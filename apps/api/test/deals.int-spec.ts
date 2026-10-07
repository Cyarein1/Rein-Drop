/**
 * Deals API against a REAL PostgreSQL: ranked feed (strength first, freshness second), filters,
 * keyset paging, detail, and the Seen / Save / Ignore / Bought decisions.
 * Run with `pnpm --filter api test:int`. Creates throwaway users, hunts, listings, matches and
 * analyses directly, and deletes everything afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, type DealDetail, type DealSummary } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { computeEconomics, DEFAULT_SCORING_POLICY, feedRank } from '@rein-drop/scoring';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const SUBJECT = `int-test-${randomUUID().slice(0, 8)}`;
const OTHER = `int-test-${randomUUID().slice(0, 8)}`;
const PREFIX = `int-test-deals-${randomUUID().slice(0, 8)}-`;
const HOUR = 3_600_000;
const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });

describe('Deals (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  let otherUserId: string;
  let market: Record<'ebay' | 'facebook', string>;
  const hunts: Record<'A' | 'B' | 'archived', string> = { A: '', B: '', archived: '' };
  /** Deal (HuntMatch) ids by fixture name. */
  const deal: Record<string, string> = {};
  const as = (req: request.Test, subject = SUBJECT) => req.set(DEV_AUTH_HEADER, subject);
  const server = () => app.getHttpServer();
  const feed = async (query = '') => (await as(request(server()).get(`/deals${query}`)).expect(200)).body as { items: DealSummary[]; nextCursor: string | null };
  const names = (items: DealSummary[]) => items.map((d) => Object.keys(deal).find((k) => deal[k] === d.id));

  async function fixture(
    name: string,
    o: {
      hunt: string;
      market: 'ebay' | 'facebook';
      ageHours: number;
      price?: number | null;
      score?: number | null;
      strength?: string;
      matchStatus?: 'NEW' | 'SEEN' | 'EXPIRED';
      listingStatus?: 'ACTIVE' | 'SOLD';
      shipping?: number;
    },
  ) {
    const price = o.price === undefined ? 400_000 : o.price;
    const listing = await prisma.listing.create({
      data: {
        marketplaceId: market[o.market],
        externalId: `${PREFIX}${name}`,
        url: `https://dev.example/${o.market}/${name}`,
        title: `Apple iPhone 13 ${name}`,
        priceMinor: price,
        currency: price === null ? null : 'ZAR',
        status: o.listingStatus ?? 'ACTIVE',
        imageUrls: [`https://dev.example/img/${name}.jpg`],
        listedAt: new Date(Date.now() - o.ageHours * HOUR),
        firstSeenAt: new Date(Date.now() - o.ageHours * HOUR),
      },
    });
    const match = await prisma.huntMatch.create({
      data: { huntId: o.hunt, listingId: listing.id, status: o.matchStatus ?? 'NEW', relevanceScore: 100, reasons: [{ check: 'price', outcome: 'pass', code: 'within_max_price', detail: 'At or under your max price' }] },
    });
    if (o.score !== undefined && o.score !== null) {
      const economics = computeEconomics(
        {
          asking: price === null ? null : ZAR(price),
          knownCosts: o.shipping ? [{ kind: 'shipping', label: 'Shipping', amount: ZAR(o.shipping) }] : [],
          maxPrice: ZAR(450_000),
          target: null,
          comparables: null,
        },
        DEFAULT_SCORING_POLICY,
      );
      await prisma.dealAnalysis.create({
        data: {
          listingId: listing.id,
          huntMatchId: match.id,
          status: 'COMPLETED',
          provider: 'mock',
          inputHash: randomUUID(),
          scoringVersion: 1,
          economics: economics as never,
          strength: o.strength ?? 'strong',
          confidence: 'medium',
          score: o.score,
          scoring: { strengthReasons: [], confidenceReasons: [], alert: { eligible: false, kind: null, rules: [], blockedBy: ['strength'] } },
          completedAt: new Date(),
        },
      });
    }
    deal[name] = match.id;
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const user = (subject: string) => prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } });
    userId = (await user(SUBJECT)).id;
    otherUserId = (await user(OTHER)).id;
    const rows = await prisma.marketplace.findMany({ where: { key: { in: ['ebay', 'facebook'] } } });
    market = Object.fromEntries(rows.map((m) => [m.key, m.id])) as typeof market;
    const hunt = (owner: string, name: string, status: 'LIVE' | 'ARCHIVED') =>
      prisma.hunt.create({
        data: {
          userId: owner,
          name,
          query: 'iPhone 13',
          status,
          marketplaces: { create: [{ marketplaceId: market.ebay, lastPolledAt: new Date(), lastPollStatus: 'SUCCEEDED' }, { marketplaceId: market.facebook, lastPollStatus: 'FAILED', lastPolledAt: new Date() }] },
        },
      });
    hunts.A = (await hunt(userId, 'Hunt A', 'LIVE')).id;
    hunts.B = (await hunt(userId, 'Hunt B', 'LIVE')).id;
    hunts.archived = (await hunt(userId, 'Old hunt', 'ARCHIVED')).id;
    const otherHunt = (await hunt(otherUserId, 'Someone else', 'LIVE')).id;

    // Open deals. Expected order: strongFresh, strongOld, moderateBrandNew, unscored, weak.
    await fixture('strongFresh', { hunt: hunts.A, market: 'ebay', ageHours: 1, score: 75, shipping: 15_000 });
    await fixture('strongOld', { hunt: hunts.A, market: 'facebook', ageHours: 60, score: 70 });
    await fixture('moderateBrandNew', { hunt: hunts.B, market: 'ebay', ageHours: 0, score: 50, strength: 'moderate' }); // 64 < strongOld's 72.3
    await fixture('unscored', { hunt: hunts.A, market: 'facebook', ageHours: 2, price: null });
    await fixture('weak', { hunt: hunts.A, market: 'ebay', ageHours: 1, score: 10, strength: 'weak' });
    // Not open.
    await fixture('sold', { hunt: hunts.A, market: 'facebook', ageHours: 3, score: 80, listingStatus: 'SOLD' });
    await fixture('expired', { hunt: hunts.B, market: 'ebay', ageHours: 3, score: 60, matchStatus: 'EXPIRED' });
    await fixture('archivedHunt', { hunt: hunts.archived, market: 'ebay', ageHours: 1, score: 90 });
    await fixture('otherUsers', { hunt: otherHunt, market: 'ebay', ageHours: 1, score: 99 });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL }))],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (prisma) {
      const ids = Object.values(deal);
      await prisma.dealAnalysis.deleteMany({ where: { huntMatchId: { in: ids } } });
      await prisma.inventoryItem.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
      for (const id of [userId, otherUserId]) if (id) await prisma.user.delete({ where: { id } }); // hunts, matches, saved deals
      await prisma.listing.deleteMany({ where: { externalId: { startsWith: PREFIX } } });
      await prisma.$disconnect();
    }
  });

  it('ranks open deals by strength first, then freshness - not by date', async () => {
    const { items, nextCursor } = await feed();
    expect(names(items)).toEqual(['strongFresh', 'strongOld', 'moderateBrandNew', 'unscored', 'weak']);
    expect(nextCursor).toBeNull();
    // The SQL rank is the documented feedRank formula.
    const [first] = items;
    expect(first!.rank).toBeCloseTo(feedRank(75, first!.freshness.ageMinutes / 60), 1);
    expect(items.find((d) => d.id === deal.unscored)!.rank).toBeCloseTo(feedRank(null, 2), 1);
  });

  it('every card has price, freshness, source status, assessment, estimate and reason fields', async () => {
    const { items } = await feed();
    const strong = items.find((d) => d.id === deal.strongFresh)!;
    expect(strong).toMatchObject({
      status: 'new',
      hunt: { id: hunts.A, name: 'Hunt A' },
      price: { asking: ZAR(400_000), knownCosts: ZAR(15_000), knownTotal: ZAR(415_000) },
      freshness: { basis: 'posted' },
      source: { marketplace: 'ebay', listingStatus: 'ACTIVE', available: true, lastCheck: 'ok' },
      assessment: { status: 'completed', strength: 'strong', confidence: 'medium', score: 75 },
      estimate: { resale: { status: 'unavailable', reason: 'no_source' }, upside: { status: 'unavailable' } },
    });
    expect(strong.freshness.ageMinutes).toBeGreaterThanOrEqual(59);
    const unscored = items.find((d) => d.id === deal.unscored)!;
    expect(unscored).toMatchObject({
      price: { asking: null, knownTotal: null },
      assessment: { status: 'pending', strength: null },
      source: { marketplace: 'facebook', lastCheck: 'failed' },
      reason: null,
    });
  });

  it('pages with a stable cursor (no repeats, same order)', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await feed(`?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      seen.push(...page.items.map((d) => d.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual((await feed()).items.map((d) => d.id));
  });

  it('filters by hunt, source and status; archived hunts and other users stay out', async () => {
    expect(names((await feed(`?huntId=${hunts.B}`)).items)).toEqual(['moderateBrandNew']);
    expect(names((await feed('?marketplace=facebook')).items)).toEqual(['strongOld', 'unscored']);
    expect(names((await feed('?status=unavailable')).items)).toEqual(['sold', 'expired']);
    expect(names((await feed(`?huntId=${hunts.archived}`)).items)).toEqual(['archivedHunt']);
    const all = names((await feed('?status=all')).items);
    expect(all).toHaveLength(7);
    expect(all).not.toContain('archivedHunt');
    expect(all).not.toContain('otherUsers');
  });

  it('detail: 404 for unknown or other users\' deals; explanation fields present', async () => {
    await as(request(server()).get(`/deals/${deal.otherUsers}`)).expect(404);
    await as(request(server()).get(`/deals/${randomUUID()}`)).expect(404);
    const detail = (await as(request(server()).get(`/deals/${deal.strongFresh}`)).expect(200)).body as DealDetail;
    expect(detail).toMatchObject({
      id: deal.strongFresh,
      economics: { knownCosts: [{ kind: 'shipping', amount: ZAR(15_000) }], maxPrice: { status: 'within', withKnownCosts: 'within', headroom: ZAR(35_000) } },
      matchChecks: [{ check: 'price', outcome: 'pass' }],
      decision: { seenAt: null, savedAt: null, inventoryItemId: null },
    });
    expect(detail.economics!.notIncluded).toContain('selling_fees');
  });

  it('seen, save / unsave and ignore / un-ignore', async () => {
    const act = async (method: 'post' | 'delete', action: string, id = deal.strongOld!, body: object = {}) =>
      (await as(request(server())[method](`/deals/${id}/${action}`)).send(body).expect(200)).body as DealDetail;

    const seen = await act('post', 'seen');
    expect(seen).toMatchObject({ status: 'seen', matchStatus: 'SEEN' });
    expect(seen.decision.seenAt).not.toBeNull();
    expect((await act('post', 'seen')).decision.seenAt).toBe(seen.decision.seenAt); // idempotent

    expect(await act('post', 'save')).toMatchObject({ status: 'saved', isSaved: true });
    await act('post', 'save'); // idempotent
    expect(names((await feed('?status=saved')).items)).toEqual(['strongOld']);
    expect(await act('delete', 'save')).toMatchObject({ status: 'seen', isSaved: false });

    await act('post', 'save');
    const ignored = await act('post', 'ignore', deal.strongOld, { reason: 'Too far to collect' });
    expect(ignored).toMatchObject({ status: 'ignored', isSaved: false, decision: { ignoreReason: 'Too far to collect' } });
    expect(names((await feed()).items)).not.toContain('strongOld');
    expect(names((await feed('?status=ignored')).items)).toEqual(['strongOld']);

    expect(await act('delete', 'ignore')).toMatchObject({ status: 'seen', decision: { ignoredAt: null, ignoreReason: null } });
    // Saving an ignored deal un-ignores it.
    await act('post', 'ignore');
    expect(await act('post', 'save')).toMatchObject({ status: 'saved', matchStatus: 'SEEN' });
  });

  it('bought: records the purchase once at the asking price (or what you paid), and is final', async () => {
    const bought = (await as(request(server()).post(`/deals/${deal.strongFresh}/bought`)).send({}).expect(200)).body as DealDetail;
    expect(bought).toMatchObject({ status: 'bought', matchStatus: 'BOUGHT' });
    const itemId = bought.decision.inventoryItemId!;
    expect(await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({
      userId,
      huntMatchId: deal.strongFresh,
      purchasePriceMinor: 400_000,
      currency: 'ZAR',
      status: 'IN_STOCK',
    });

    // Repeating it (double tap / retry) changes nothing.
    const again = await Promise.all([1, 2].map(() => as(request(server()).post(`/deals/${deal.strongFresh}/bought`)).send({ price: ZAR(1) })));
    expect(again.map((r) => r.status)).toEqual([200, 200]);
    expect(await prisma.inventoryItem.count({ where: { huntMatchId: deal.strongFresh } })).toBe(1);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).purchasePriceMinor).toBe(400_000);

    await as(request(server()).post(`/deals/${deal.strongFresh}/ignore`)).send({}).expect(409);
    await as(request(server()).post(`/deals/${deal.strongFresh}/save`)).expect(409);
    expect(names((await feed()).items)).not.toContain('strongFresh');
    expect(names((await feed('?status=bought')).items)).toEqual(['strongFresh']);

    // No asking price: what you paid is required.
    const noPrice = await as(request(server()).post(`/deals/${deal.unscored}/bought`)).send({}).expect(400);
    expect(noPrice.body.details[0].path).toBe('body.price');
    await as(request(server()).post(`/deals/${deal.unscored}/bought`)).send({ purchasedAt: new Date(Date.now() + 2 * HOUR).toISOString(), price: ZAR(300_000) }).expect(400);
    const paid = (await as(request(server()).post(`/deals/${deal.unscored}/bought`)).send({ price: ZAR(320_000) }).expect(200)).body as DealDetail;
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: paid.decision.inventoryItemId! } })).purchasePriceMinor).toBe(320_000);

    // Another user can't act on your deal.
    await as(request(server()).post(`/deals/${deal.weak}/bought`), OTHER).send({}).expect(404);
  });
});
