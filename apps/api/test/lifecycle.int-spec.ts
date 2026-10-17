/**
 * Step 90 - item lifecycle without deleting (decision 0021) against a REAL PostgreSQL:
 * manual "Add item", return / write-off / cancel (Undo bought, re-opening the deal) / reopen, the
 * item event history, the sale -> listings-ended sync (from Inventory and from a listing, with the
 * Facebook "remove it yourself" flag), discard / restore of draft listings and the Sell tabs,
 * Sell-area sections and counts, analytics treatment of the new statuses, and ownership (another
 * account gets 404). Everything created is deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import {
  DEV_AUTH_HEADER,
  type AnalyticsOverview,
  type DealDetail,
  type InventoryCounts,
  type InventoryEventList,
  type InventoryItem,
  type ListingSoldResponse,
  type ProductAnalytics,
  type SellListing,
} from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const RUN = randomUUID().slice(0, 8);
const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });
const HOUR = 3_600_000;

describe('Item lifecycle without deleting (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let ebayId: string;
  const users: string[] = [];
  const listings: string[] = [];
  let n = 0;

  async function account() {
    const subject = `int-life-${RUN}-${++n}`;
    const userId = (await prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } })).id;
    users.push(userId);
    const http = () => request(app.getHttpServer());
    const as = (req: request.Test, platform?: string) => {
      const r = req.set(DEV_AUTH_HEADER, subject);
      return platform ? r.set('x-client-platform', platform) : r;
    };
    return {
      userId,
      subject,
      get: (p: string) => as(http().get(p)),
      post: (p: string, body: object = {}, platform?: string) => as(http().post(p), platform).send(body),
      put: (p: string, body: object, platform?: string) => as(http().put(p), platform).send(body),
      patch: (p: string, body: object) => as(http().patch(p)).send(body),
      del: (p: string) => as(http().delete(p)),
      events: async (itemId: string) => ((await as(http().get(`/inventory/${itemId}/events`)).expect(200)).body as InventoryEventList).items,
    };
  }
  type Account = Awaited<ReturnType<typeof account>>;

  /** A deal (hunt match on an eBay listing) for this account. */
  async function deal(a: Account, price = 100_00) {
    const listing = await prisma.listing.create({
      data: { marketplaceId: ebayId, externalId: `life-${RUN}-${++n}`, url: `https://dev.example/ebay/life-${RUN}-${n}`, title: 'Desk lamp', priceMinor: price, currency: 'ZAR', status: 'ACTIVE', imageUrls: ['https://dev.example/img/l.jpg'] },
    });
    listings.push(listing.id);
    const hunt = await prisma.hunt.create({ data: { userId: a.userId, name: 'Lamps', query: 'desk lamp', status: 'PAUSED' } });
    return (await prisma.huntMatch.create({ data: { huntId: hunt.id, listingId: listing.id, status: 'SEEN', relevanceScore: 100, reasons: [] } })).id;
  }

  const addItem = async (a: Account, body: object = {}) =>
    (await a.post('/inventory', { title: 'Garage sale lamp', purchasePrice: ZAR(50_00), purchasedAt: new Date(Date.now() - 48 * HOUR).toISOString(), ...body }, 'web').expect(201)).body as InventoryItem;

  /** A listing ready to publish (title, description, price, condition, a photo). */
  async function readyListing(a: Account, itemId: string) {
    const listing = (await a.post('/sell/listings', { inventoryItemId: itemId }).expect(200)).body as SellListing;
    await a.patch(`/sell/listings/${listing.id}`, { title: 'Desk lamp', description: 'Works well', price: ZAR(150_00), condition: 'good' }).expect(200);
    await prisma.sellPhoto.create({ data: { sellListingId: listing.id, source: 'SOURCE', ref: 'https://dev.example/img/l.jpg', position: 0 } });
    return listing.id;
  }

  /** Published on eBay (mock) and posted on Facebook (assisted, confirmed). */
  async function liveEverywhere(a: Account, itemId: string) {
    const id = await readyListing(a, itemId);
    await a.post(`/sell/listings/${id}/publish`, { marketplaces: ['ebay', 'facebook'] }).expect(200);
    const live = (await a.post(`/sell/listings/${id}/channels/facebook/confirm`, {}).expect(200)).body as SellListing;
    expect(live.channels.map((c) => [c.marketplace, c.status])).toEqual([['ebay', 'PUBLISHED'], ['facebook', 'PUBLISHED']]);
    return id;
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    ebayId = (await prisma.marketplace.findUniqueOrThrow({ where: { key: 'ebay' } })).id;
    const config = loadApiConfig({ NODE_ENV: 'test', DATABASE_URL });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.listing.deleteMany({ where: { id: { in: listings } } });
    await prisma.$disconnect();
  });

  it('Add item: a manual purchase works like any item, with validation, a timeline and another account kept out', async () => {
    const a = await account();
    const added = await addItem(a, { boughtFrom: { kind: 'other', text: 'garage sale' }, costs: [{ category: 'REPAIR', amount: ZAR(10_00) }], notes: 'needs a bulb' });
    expect(added).toMatchObject({
      status: 'IN_STOCK',
      origin: 'manual',
      dealId: null,
      source: null,
      boughtFrom: { marketplace: null, text: 'garage sale' },
      purchase: { price: ZAR(50_00), total: ZAR(60_00) },
      closure: null,
      sellListing: null,
    });
    expect(added.actions).toContain('cancel');
    const events = await a.events(added.id);
    expect(events).toEqual([expect.objectContaining({ type: 'ADDED_MANUALLY', source: 'web', details: { price: ZAR(50_00), where: 'garage sale' } })]);

    // Validation like the purchase update: positive price, one currency, not in the future.
    await a.post('/inventory', { title: 'x', purchasePrice: ZAR(0), purchasedAt: new Date().toISOString() }).expect(400);
    await a.post('/inventory', { title: 'x', purchasePrice: ZAR(1_00), purchasedAt: new Date().toISOString(), costs: [{ category: 'TAX', amount: { amountMinor: 1, currency: 'USD' } }] }).expect(400);
    await a.post('/inventory', { title: 'x', purchasePrice: ZAR(1_00), purchasedAt: new Date(Date.now() + 48 * HOUR).toISOString() }).expect(400);
    await request(app.getHttpServer()).post('/inventory').send({ title: 'x', purchasePrice: ZAR(1_00), purchasedAt: new Date().toISOString() }).expect(401);

    // Sellable like a deal's item.
    await a.put(`/inventory/${added.id}/sale`, { price: ZAR(90_00), soldAt: new Date().toISOString(), marketplace: 'ebay' }).expect(200);

    const other = await account();
    for (const [method, path] of [
      ['get', `/inventory/${added.id}`],
      ['get', `/inventory/${added.id}/events`],
      ['post', `/inventory/${added.id}/return`],
      ['post', `/inventory/${added.id}/write-off`],
      ['post', `/inventory/${added.id}/cancel`],
      ['post', `/inventory/${added.id}/reopen`],
    ] as const) {
      await (method === 'get' ? other.get(path) : other.post(path, {})).expect(404);
    }
  });

  it('return, write off and reopen follow the state machine; every step is in the timeline', async () => {
    const a = await account();
    const item = await addItem(a, { costs: [{ category: 'SHIPPING', amount: ZAR(5_00) }] });

    await a.post(`/inventory/${item.id}/return`, { refund: { amountMinor: 1, currency: 'USD' } }).expect(400);
    const returned = (await a.post(`/inventory/${item.id}/return`, { refund: ZAR(40_00), note: 'wrong size' }, 'mobile').expect(200)).body as InventoryItem;
    expect(returned).toMatchObject({
      status: 'RETURNED',
      holding: false,
      actions: ['edit_purchase', 'reopen'],
      closure: { status: 'RETURNED', note: 'wrong size', refund: ZAR(40_00), result: { status: 'ok', costBasis: ZAR(55_00), recovered: ZAR(40_00), realizedProfit: ZAR(-15_00) } },
    });
    // Not from this status.
    await a.post(`/inventory/${item.id}/write-off`, {}).expect(409);
    await a.put(`/inventory/${item.id}/sale`, { price: ZAR(90_00), soldAt: new Date().toISOString() }).expect(409);
    await a.patch(`/inventory/${item.id}`, { status: 'LISTED' }).expect(409);
    await a.post('/sell/listings', { inventoryItemId: item.id }).expect(409);

    const reopened = (await a.post(`/inventory/${item.id}/reopen`, {}).expect(200)).body as InventoryItem;
    expect(reopened).toMatchObject({ status: 'IN_STOCK', holding: true, closure: null });
    await a.post(`/inventory/${item.id}/reopen`, {}).expect(409);

    const writtenOff = (await a.post(`/inventory/${item.id}/write-off`, { reason: 'broken' }).expect(200)).body as InventoryItem;
    expect(writtenOff.closure).toMatchObject({ status: 'WRITTEN_OFF', refund: null, result: { realizedProfit: ZAR(-55_00) } });
    // A date before the purchase is refused.
    await a.post(`/inventory/${item.id}/reopen`, {}).expect(200);
    await a.post(`/inventory/${item.id}/write-off`, { writtenOffAt: new Date(Date.now() - 30 * 24 * HOUR).toISOString() }).expect(400);

    const events = await a.events(item.id);
    expect(events.map((e) => e.type)).toEqual(['ADDED_MANUALLY', 'RETURNED', 'REOPENED', 'WRITTEN_OFF', 'REOPENED']);
    expect(events[1]).toMatchObject({ source: 'mobile', details: { refund: ZAR(40_00), note: 'wrong size' } });
    expect(events[2]!.details).toEqual({ from: 'RETURNED' });
    expect(events[3]!.details).toEqual({ reason: 'broken' });
    // The history is never deleted: the item is still there, every event too.
    expect(await prisma.inventoryEvent.count({ where: { inventoryItemId: item.id } })).toBe(5);
  });

  it('Undo bought: the deal re-opens (not bought), the item stays CANCELLED with its history, buying again revives it', async () => {
    const a = await account();
    const dealId = await deal(a);
    const bought = (await a.post(`/deals/${dealId}/bought`, { price: ZAR(90_00) }, 'mobile').expect(200)).body as DealDetail;
    const itemId = bought.decision.inventoryItemId!;
    // A draft listing is discarded with the cancel.
    await a.post('/sell/listings', { inventoryItemId: itemId }).expect(200);

    const cancelled = (await a.post(`/inventory/${itemId}/cancel`, { note: 'mis-tap' }).expect(200)).body as InventoryItem;
    expect(cancelled).toMatchObject({ status: 'CANCELLED', closure: { status: 'CANCELLED', note: 'mis-tap', result: null }, actions: ['reopen'], sellListing: { status: 'DISCARDED' } });
    const reopenedDeal = (await a.get(`/deals/${dealId}`).expect(200)).body as DealDetail;
    expect(reopenedDeal.status).not.toBe('bought');
    expect(reopenedDeal.decision).toMatchObject({ boughtAt: null, inventoryItemId: null });
    expect((await prisma.huntMatch.findUniqueOrThrow({ where: { id: dealId } })).status).toBe('SEEN');

    // Bought for real afterwards: the same item, with the new price.
    const again = (await a.post(`/deals/${dealId}/bought`, { price: ZAR(80_00) }).expect(200)).body as DealDetail;
    expect(again.decision.inventoryItemId).toBe(itemId);
    expect((await a.get(`/inventory/${itemId}`).expect(200)).body).toMatchObject({ status: 'IN_STOCK', purchase: { price: ZAR(80_00) }, closure: null });
    expect((await a.events(itemId)).map((e) => e.type)).toEqual(['BOUGHT', 'LISTING_STARTED', 'LISTING_DISCARDED', 'CANCELLED', 'BOUGHT']);
    expect((await a.events(itemId))[3]!.details).toMatchObject({ dealReopened: true, note: 'mis-tap' });

    // Undo from the deal itself (DELETE /deals/:id/bought), then reopen from Inventory marks the deal bought again.
    const undone = (await a.del(`/deals/${dealId}/bought`).expect(200)).body as DealDetail;
    expect(undone.decision.inventoryItemId).toBeNull();
    await a.del(`/deals/${dealId}/bought`).expect(200); // idempotent
    await a.post(`/inventory/${itemId}/reopen`, {}).expect(200);
    expect(((await a.get(`/deals/${dealId}`).expect(200)).body as DealDetail).status).toBe('bought');

    // Never once sold, and never while live on a marketplace.
    const live = await liveEverywhere(a, itemId);
    const blocked = await a.post(`/inventory/${itemId}/cancel`, {}).expect(409);
    expect(blocked.body.message).toMatch(/take the listing down in Sell first/);
    await a.post(`/sell/listings/${live}/channels/ebay/end`, {}).expect(200);
    await a.post(`/sell/listings/${live}/channels/facebook/end`, {}).expect(200);
    await a.put(`/inventory/${itemId}/sale`, { price: ZAR(150_00), soldAt: new Date().toISOString() }).expect(200);
    await a.post(`/inventory/${itemId}/cancel`, {}).expect(409);
    await a.del(`/deals/${dealId}/bought`).expect(409);
  });

  it('Mark sold from Inventory ends every live listing; Facebook is flagged for manual removal; undo keeps them ended', async () => {
    const a = await account();
    const item = await addItem(a);
    const listingId = await liveEverywhere(a, item.id);
    expect(((await a.get(`/inventory/${item.id}`).expect(200)).body as InventoryItem).sellListing).toMatchObject({ status: 'PUBLISHED', activeChannels: 2, price: ZAR(150_00) });

    const sold = (await a.put(`/inventory/${item.id}/sale`, { price: ZAR(140_00), soldAt: new Date().toISOString(), marketplace: null }, 'web').expect(200)).body as InventoryItem;
    expect(sold).toMatchObject({ status: 'SOLD', sellListing: { status: 'ENDED', activeChannels: 0, removeManually: ['facebook'] } });
    const listing = (await a.get(`/sell/listings/${listingId}`).expect(200)).body as SellListing;
    expect(listing).toMatchObject({ status: 'ENDED', itemStatus: 'SOLD', sale: { price: ZAR(140_00), marketplace: null }, removeManually: ['facebook'], canSell: false });
    expect(listing.channels.map((c) => [c.marketplace, c.status, c.endedReason, c.removalPending])).toEqual([
      ['ebay', 'ENDED', 'sold_elsewhere', false],
      ['facebook', 'ENDED', 'sold_elsewhere', true],
    ]);
    // Nobody can publish it again while it is sold.
    await a.post(`/sell/listings/${listingId}/publish`, { marketplaces: ['ebay'] }).expect(409);

    // The seller confirms they removed it on Facebook.
    const acked = (await a.post(`/sell/listings/${listingId}/channels/facebook/end`, {}).expect(200)).body as SellListing;
    expect(acked.removeManually).toEqual([]);

    // Undo the sale: held again, listings stay ended; republishing works.
    const undone = (await a.del(`/inventory/${item.id}/sale`).expect(200)).body as InventoryItem;
    expect(undone).toMatchObject({ status: 'IN_STOCK', sellListing: { status: 'ENDED', activeChannels: 0 } });
    const again = (await a.post(`/sell/listings/${listingId}/publish`, { marketplaces: ['ebay'] }).expect(200)).body as SellListing;
    expect(again).toMatchObject({ status: 'PUBLISHED', itemStatus: 'LISTED' });
    expect(again.channels.find((c) => c.marketplace === 'ebay')).toMatchObject({ status: 'PUBLISHED', endedReason: null, removalPending: false });

    const types = (await a.events(item.id)).map((e) => e.type);
    expect(types).toEqual([
      'ADDED_MANUALLY',
      'LISTING_STARTED',
      'PUBLISHED',
      'PUBLISHED',
      'CHANNEL_ENDED',
      'CHANNEL_ENDED',
      'SOLD',
      'SALE_UNDONE',
      'PUBLISHED',
    ]);
    const soldEvent = (await a.events(item.id)).find((e) => e.type === 'SOLD')!;
    expect(soldEvent).toMatchObject({ source: 'web', details: { via: 'inventory', endedChannels: ['ebay', 'facebook'], removeManually: ['facebook'] } });
  });

  it('"Sold on eBay": POST /sell/listings/:id/sold records the sale and ends the other listings', async () => {
    const a = await account();
    const item = await addItem(a);
    const listingId = await liveEverywhere(a, item.id);
    await a.post(`/sell/listings/${listingId}/sold`, { price: ZAR(150_00), soldAt: new Date().toISOString(), marketplace: 'ebay' }).expect(200).then(async (res) => {
      const body = res.body as ListingSoldResponse;
      expect(body.removeManually).toEqual(['facebook']);
      expect(body.item).toMatchObject({ status: 'SOLD', sale: { price: ZAR(150_00), marketplace: 'ebay' }, result: { status: 'ok', realizedProfit: ZAR(100_00) } });
      expect(body.listing.channels.map((c) => [c.marketplace, c.endedReason, c.removalPending])).toEqual([
        ['ebay', 'sold_here', false],
        ['facebook', 'sold_elsewhere', true],
      ]);
      expect(body.listing.status).toBe('ENDED');
    });
    // Already sold: correct it from Inventory instead.
    await a.post(`/sell/listings/${listingId}/sold`, { price: ZAR(150_00), soldAt: new Date().toISOString(), marketplace: 'ebay' }).expect(409);
    expect((await a.events(item.id)).find((e) => e.type === 'SOLD')!.details).toMatchObject({ via: 'listing', marketplace: 'ebay' });

    // A marketplace it isn't listed on is refused; another account gets 404.
    const b = await addItem(a);
    const draft = (await a.post('/sell/listings', { inventoryItemId: b.id }).expect(200)).body as SellListing;
    await a.post(`/sell/listings/${draft.id}/sold`, { price: ZAR(10_00), soldAt: new Date().toISOString(), marketplace: 'ebay' }).expect(400);
    const other = await account();
    await other.post(`/sell/listings/${draft.id}/sold`, { price: ZAR(10_00), soldAt: new Date().toISOString(), marketplace: null }).expect(404);
    await other.post(`/sell/listings/${draft.id}/discard`, {}).expect(404);
    await other.post(`/sell/listings/${draft.id}/restore`, {}).expect(404);
    // Sold from a draft (sold elsewhere, never published): the draft ends.
    const res = (await a.post(`/sell/listings/${draft.id}/sold`, { price: ZAR(10_00), soldAt: new Date().toISOString(), marketplace: null }).expect(200)).body as ListingSoldResponse;
    expect(res).toMatchObject({ removeManually: [], listing: { status: 'ENDED' }, item: { status: 'SOLD' } });
  });

  it('a return or write-off also ends live listings', async () => {
    const a = await account();
    const item = await addItem(a);
    const listingId = await liveEverywhere(a, item.id);
    const returned = (await a.post(`/inventory/${item.id}/return`, {}).expect(200)).body as InventoryItem;
    expect(returned).toMatchObject({ closure: { refund: ZAR(50_00) }, sellListing: { status: 'ENDED', removeManually: ['facebook'] } });
    const listing = (await a.get(`/sell/listings/${listingId}`).expect(200)).body as SellListing;
    expect(listing.channels.map((c) => c.endedReason)).toEqual(['returned', 'returned']);
  });

  it('discard / restore a draft; Sell tabs; List again restores it', async () => {
    const a = await account();
    const item = await addItem(a);
    const draft = (await a.post('/sell/listings', { inventoryItemId: item.id }).expect(200)).body as SellListing;
    expect(draft).toMatchObject({ status: 'DRAFT', canDiscard: true, canSell: true });

    const discarded = (await a.post(`/sell/listings/${draft.id}/discard`, {}).expect(200)).body as SellListing;
    expect(discarded).toMatchObject({ status: 'DISCARDED', canDiscard: false, canSell: false });
    await a.post(`/sell/listings/${draft.id}/discard`, {}).expect(200); // idempotent
    await a.patch(`/sell/listings/${draft.id}`, { title: 'x' }).expect(409);
    const ids = async (q: string) => (((await a.get(`/sell/listings${q}`).expect(200)).body as { items: SellListing[] }).items).map((l) => l.id);
    expect(await ids('')).toEqual([]);
    expect(await ids('?view=discarded')).toEqual([draft.id]);
    expect(await ids('?view=drafts')).toEqual([]);

    // "List" on the item again brings it back.
    const back = (await a.post('/sell/listings', { inventoryItemId: item.id }).expect(200)).body as SellListing;
    expect(back).toMatchObject({ id: draft.id, status: 'DRAFT' });
    expect(await ids('?view=drafts')).toEqual([draft.id]);

    // A live listing can't be discarded; restore of a non-discarded listing is a no-op.
    await readyListing(a, item.id);
    await a.post(`/sell/listings/${draft.id}/publish`, { marketplaces: ['ebay'] }).expect(200);
    await a.post(`/sell/listings/${draft.id}/discard`, {}).expect(409);
    expect(((await a.post(`/sell/listings/${draft.id}/restore`, {}).expect(200)).body as SellListing).status).toBe('PUBLISHED');
    expect(await ids('?view=active')).toEqual([draft.id]);
    expect(await ids('?status=PUBLISHED')).toEqual([draft.id]);
    expect((await a.events(item.id)).map((e) => e.type)).toEqual(['ADDED_MANUALLY', 'LISTING_STARTED', 'LISTING_DISCARDED', 'LISTING_RESTORED', 'PUBLISHED']);
  });

  it('Sell-area sections and counts; analytics leave cancelled out and count returns / write-offs as realized results', async () => {
    const a = await account();
    const holding = await addItem(a, { title: 'Holding lamp' });
    const drafted = await addItem(a, { title: 'Drafted lamp' });
    await a.post('/sell/listings', { inventoryItemId: drafted.id }).expect(200);
    const elsewhere = await addItem(a, { title: 'Elsewhere lamp' });
    await a.patch(`/inventory/${elsewhere.id}`, { status: 'LISTED' }).expect(200);
    const discardedDraft = await addItem(a, { title: 'Discarded lamp' });
    const d = (await a.post('/sell/listings', { inventoryItemId: discardedDraft.id }).expect(200)).body as SellListing;
    await a.post(`/sell/listings/${d.id}/discard`, {}).expect(200);
    const sold = await addItem(a, { title: 'Sold lamp' });
    await a.put(`/inventory/${sold.id}/sale`, { price: ZAR(80_00), soldAt: new Date().toISOString() }).expect(200);
    const writtenOff = await addItem(a, { title: 'Broken lamp', costs: [{ category: 'REPAIR', amount: ZAR(10_00) }] });
    await a.post(`/inventory/${writtenOff.id}/write-off`, {}).expect(200);
    const returned = await addItem(a, { title: 'Returned lamp' });
    await a.post(`/inventory/${returned.id}/return`, { refund: ZAR(45_00) }).expect(200);
    const cancelled = await addItem(a, { title: 'Mistake lamp' });
    await a.post(`/inventory/${cancelled.id}/cancel`, {}).expect(200);

    const section = async (s: string) => (((await a.get(`/inventory?section=${s}`).expect(200)).body as { items: InventoryItem[] }).items).map((i) => i.title).sort();
    expect(await section('holding')).toEqual(['Discarded lamp', 'Holding lamp']);
    expect(await section('listed')).toEqual(['Drafted lamp', 'Elsewhere lamp']);
    expect(await section('sold')).toEqual(['Sold lamp']);
    expect(await section('other')).toEqual(['Broken lamp', 'Mistake lamp', 'Returned lamp']);
    expect(((await a.get('/inventory/counts').expect(200)).body as InventoryCounts)).toEqual({ holding: 2, listed: 2, sold: 1, other: 3, listings: { drafts: 1, active: 0, discarded: 1 } });
    // The older filters still work.
    expect((((await a.get('/inventory?status=closed').expect(200)).body) as { items: unknown[] }).items).toHaveLength(3);
    expect((((await a.get('/inventory').expect(200)).body) as { items: unknown[] }).items).toHaveLength(4);
    void holding;

    const overview = (await a.get('/analytics/overview?period=7d').expect(200)).body as AnalyticsOverview;
    // 8 added, the cancelled one left out of buys and spent.
    expect(overview.buys).toBe(7);
    expect(overview.spent).toEqual([ZAR(7 * 50_00 + 10_00)]);
    expect(overview.holding.count).toBe(4);
    expect(overview.realized).toEqual([expect.objectContaining({ currency: 'ZAR', realizedProfit: ZAR(30_00) })]);
    expect(overview.closed).toEqual([
      { currency: 'ZAR', returned: 1, writtenOff: 1, costBasis: ZAR(110_00), recovered: ZAR(45_00), realizedResult: ZAR(-65_00), excluded: 0 },
    ]);
    expect(overview.netRealized).toEqual([ZAR(30_00 - 65_00)]);
    const products = (await a.get('/analytics/products?period=7d').expect(200)).body as ProductAnalytics;
    expect(products.items.find((p) => p.name === 'Broken lamp')).toMatchObject({ bought: 1, writtenOff: 1, closedResult: [ZAR(-60_00)] });
    expect(products.items.find((p) => p.name === 'Mistake lamp')).toBeUndefined();
  });
});
