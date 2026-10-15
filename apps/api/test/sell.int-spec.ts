/**
 * Sell workspace (decision 0019) against a REAL PostgreSQL: "List" on a bought item, AI drafts
 * (mock provider - suggestions only, never saved by themselves), own and source photos with a
 * chosen cover and signed photo links, cross-listing (eBay mock, Facebook assisted + confirm),
 * inventory status following the listing, and ownership (another account gets 404).
 * Photos go to a temporary folder; everything is deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, type SellListing } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const RUN = randomUUID().slice(0, 8);
const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'rd-media-'));
// Smallest valid JPEG-ish payload: the API checks the declared type and size, not the pixels.
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const SOURCE_PHOTOS = ['https://dev.example/img/a.jpg', 'https://dev.example/img/b.jpg'];

describe('Sell workspace (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let ebayId: string;
  const users: string[] = [];
  const listings: string[] = [];
  let n = 0;

  /** A signed-in account with one bought item (from an eBay listing with photos and a frozen resale estimate). */
  async function seller() {
    const subject = `int-sell-${RUN}-${++n}`;
    const userId = (await prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } })).id;
    users.push(userId);
    const listing = await prisma.listing.create({
      data: {
        marketplaceId: ebayId,
        externalId: `sell-${RUN}-${n}`,
        url: `https://dev.example/ebay/sell-${RUN}-${n}`,
        title: 'Apple iPhone 13 128GB Midnight',
        description: 'Battery health 89%. Small scratch on the back.',
        conditionText: 'Used',
        priceMinor: 450_000,
        currency: 'ZAR',
        status: 'ACTIVE',
        imageUrls: SOURCE_PHOTOS,
      },
    });
    listings.push(listing.id);
    const item = await prisma.inventoryItem.create({
      data: {
        userId,
        listingId: listing.id,
        title: 'Apple iPhone 13 128GB Midnight',
        purchasePriceMinor: 450_000,
        currency: 'ZAR',
        purchasedAt: new Date(),
        expected: { capturedAt: new Date().toISOString(), askingPrice: { amountMinor: 450_000, currency: 'ZAR' }, knownCosts: null, estimatedResale: { amountMinor: 580_000, currency: 'ZAR' }, estimatedUpside: null, strength: null, confidence: null },
      },
    });
    const as = (req: request.Test) => req.set(DEV_AUTH_HEADER, subject);
    const http = request(app.getHttpServer());
    return {
      userId,
      itemId: item.id,
      get: (p: string) => as(http.get(p)),
      post: (p: string, body: object = {}) => as(http.post(p)).send(body),
      patch: (p: string, body: object) => as(http.patch(p)).send(body),
      put: (p: string, body: object) => as(http.put(p)).send(body),
      del: (p: string) => as(http.delete(p)),
      upload: (p: string, type = 'image/jpeg') => as(http.post(p)).attach('photo', JPEG, { filename: 'photo.jpg', contentType: type }),
      item: () => prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }),
    };
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    ebayId = (await prisma.marketplace.findUniqueOrThrow({ where: { key: 'ebay' } })).id;
    const config = loadApiConfig({ NODE_ENV: 'test', DATABASE_URL, MEDIA_DIR });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.listing.deleteMany({ where: { id: { in: listings } } });
    await prisma.$disconnect();
    rmSync(MEDIA_DIR, { recursive: true, force: true });
  });

  it('every marketplace is offered, with how it publishes; uploads and AI are on in development', async () => {
    const s = await seller();
    const res = await s.get('/sell/marketplaces').expect(200);
    expect(res.body).toMatchObject({ uploads: true, ai: true });
    expect(res.body.items.map((m: { marketplace: string; mode: string; live: boolean }) => [m.marketplace, m.mode, m.live])).toEqual([
      ['ebay', 'api', false],
      ['facebook', 'assisted', true],
    ]);
  });

  it('"List" creates one listing per item (again = the same one), prefilled from the item, with what is missing', async () => {
    const s = await seller();
    const first = (await s.post('/sell/listings', { inventoryItemId: s.itemId }).expect(200)).body as SellListing;
    const again = (await s.post('/sell/listings', { inventoryItemId: s.itemId }).expect(200)).body as SellListing;
    expect(again.id).toBe(first.id);
    expect(first).toMatchObject({ status: 'DRAFT', title: 'Apple iPhone 13 128GB Midnight', price: null, sourcePhotos: SOURCE_PHOTOS, photos: [], channels: [] });
    expect(first.missing).toEqual(['Write a description', 'Set your price', 'Choose the condition', 'Add at least one photo']);
  });

  it('Use AI: a grounded suggestion that is NOT saved; the seller applies and edits it', async () => {
    const s = await seller();
    const listing = (await s.post('/sell/listings', { inventoryItemId: s.itemId })).body as SellListing;
    const draft = await s.post(`/sell/listings/${listing.id}/draft`, { notes: 'Comes with the original box' }).expect(200);
    expect(draft.body).toMatchObject({ provider: 'mock', condition: 'good', suggestedPrice: { amount: { amountMinor: 580_000, currency: 'ZAR' }, basis: 'resale_estimate' } });
    expect(draft.body.description).toMatch(/original box/);
    // Never what was paid, or where it was bought.
    expect(`${draft.body.title} ${draft.body.description}`).not.toMatch(/4 ?500|ebay/i);
    expect(((await s.get(`/sell/listings/${listing.id}`)).body as SellListing).description).toBe('');
    // Applied, then edited by the seller.
    const saved = await s.patch(`/sell/listings/${listing.id}`, { ...draft.body, provider: undefined, suggestedPrice: undefined, checks: undefined, price: { amountMinor: 599_900, currency: 'ZAR' }, aiAssisted: true }).expect(200);
    expect(saved.body).toMatchObject({ aiAssisted: true, condition: 'good', price: { amountMinor: 599_900, currency: 'ZAR' } });
    expect(saved.body.missing).toEqual(['Add at least one photo']);
    await s.patch(`/sell/listings/${listing.id}`, { price: { amountMinor: 100, currency: 'USD' } }).expect(400);
  });

  it('photos: own uploads and source photos mixed, reordered so any becomes the cover, removed; signed links', async () => {
    const s = await seller();
    const id = ((await s.post('/sell/listings', { inventoryItemId: s.itemId })).body as SellListing).id;
    await s.post(`/sell/listings/${id}/photos/source`, { url: SOURCE_PHOTOS[1] }).expect(201);
    const withOwn = (await s.upload(`/sell/listings/${id}/photos`).expect(201)).body as SellListing;
    expect(withOwn.photos.map((p) => [p.source, p.position])).toEqual([
      ['source', 0],
      ['own', 1],
    ]);
    expect(withOwn.sourcePhotos).toEqual([SOURCE_PHOTOS[0]]);
    const own = withOwn.photos[1]!;
    expect(own.url).toMatch(/^\/media\/[0-9a-f-]{36}\.jpg\?exp=\d+&sig=/);
    // The signed link works without credentials; a tampered one doesn't.
    const img = await request(app.getHttpServer()).get(own.url).expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    await request(app.getHttpServer()).get(own.url.replace(/sig=./, 'sig=x')).expect(404);
    // Own photo becomes the cover.
    const reordered = (await s.put(`/sell/listings/${id}/photos/order`, { photoIds: [own.id, withOwn.photos[0]!.id] }).expect(200)).body as SellListing;
    expect(reordered.photos[0]!.id).toBe(own.id);
    await s.put(`/sell/listings/${id}/photos/order`, { photoIds: [own.id] }).expect(400);
    // Only the source listing's own photos can be added; wrong types are refused.
    await s.post(`/sell/listings/${id}/photos/source`, { url: 'https://evil.example/x.jpg' }).expect(400);
    await s.upload(`/sell/listings/${id}/photos`, 'application/pdf').expect(400);
    const removed = (await s.del(`/sell/listings/${id}/photos/${own.id}`).expect(200)).body as SellListing;
    expect(removed.photos.map((p) => [p.source, p.position])).toEqual([['source', 0]]);
  });

  it('cross-listing: eBay (simulated) is live, Facebook waits for the seller to confirm; the item becomes Listed; ending everything returns it to In stock', async () => {
    const s = await seller();
    const id = ((await s.post('/sell/listings', { inventoryItemId: s.itemId })).body as SellListing).id;
    // Not ready yet: publishing says what's missing.
    const blocked = await s.post(`/sell/listings/${id}/publish`, { marketplaces: ['ebay'] }).expect(400);
    expect(blocked.body.details.map((d: { message: string }) => d.message)).toContain('Set your price');

    await s.patch(`/sell/listings/${id}`, { description: 'Works perfectly.', price: { amountMinor: 599_900, currency: 'ZAR' }, condition: 'good' });
    await s.post(`/sell/listings/${id}/photos/source`, { url: SOURCE_PHOTOS[0] });
    const published = (await s.post(`/sell/listings/${id}/publish`, { marketplaces: ['ebay', 'facebook'] }).expect(200)).body as SellListing;
    expect(published.status).toBe('PUBLISHED');
    const [ebay, facebook] = published.channels;
    expect(ebay).toMatchObject({ marketplace: 'ebay', status: 'PUBLISHED', simulated: true, assist: null });
    expect(ebay!.url).toMatch(/^https:\/\/dev\.example\/ebay\/itm\/mock-/);
    expect(facebook).toMatchObject({ marketplace: 'facebook', status: 'AWAITING_CONFIRMATION', simulated: false, url: null });
    expect(facebook!.assist).toMatchObject({ openUrl: 'https://www.facebook.com/marketplace/create/item' });
    expect(facebook!.assist!.text).toMatch(/^Apple iPhone 13 128GB Midnight\nPrice: ZAR\s?5,999\.00\nCondition: Good \(used\)/);
    expect((await s.item()).status).toBe('LISTED');

    // Publishing again doesn't duplicate live channels.
    expect(((await s.post(`/sell/listings/${id}/publish`, { marketplaces: ['ebay'] }).expect(200)).body as SellListing).channels).toHaveLength(2);

    const confirmed = (await s.post(`/sell/listings/${id}/channels/facebook/confirm`, { url: 'https://www.facebook.com/marketplace/item/123' }).expect(200)).body as SellListing;
    expect(confirmed.channels[1]).toMatchObject({ status: 'PUBLISHED', url: 'https://www.facebook.com/marketplace/item/123' });
    await s.post(`/sell/listings/${id}/channels/facebook/confirm`, {}).expect(409);

    await s.post(`/sell/listings/${id}/channels/ebay/end`).expect(200);
    const ended = (await s.post(`/sell/listings/${id}/channels/facebook/end`).expect(200)).body as SellListing;
    expect(ended.status).toBe('ENDED');
    expect((await s.item()).status).toBe('IN_STOCK');
  });

  it("another account can't see or change a listing (404); a sold item can't be listed", async () => {
    const owner = await seller();
    const other = await seller();
    const id = ((await owner.post('/sell/listings', { inventoryItemId: owner.itemId })).body as SellListing).id;
    await other.get(`/sell/listings/${id}`).expect(404);
    await other.patch(`/sell/listings/${id}`, { title: 'mine now' }).expect(404);
    await other.post('/sell/listings', { inventoryItemId: owner.itemId }).expect(404);
    expect((await other.get('/sell/listings').expect(200)).body.items.some((l: SellListing) => l.id === id)).toBe(false);

    const sold = await seller();
    await prisma.inventoryItem.update({ where: { id: sold.itemId }, data: { status: 'SOLD' } });
    await sold.post('/sell/listings', { inventoryItemId: sold.itemId }).expect(409);
  });
});
