/**
 * Period analytics against a REAL PostgreSQL: overview, Hunt funnel, products, marketplaces and
 * missed potential, all from SQL aggregates. Checks the SQL realized profit against the shared
 * TypeScript formula (realizedResult), currency separation, period windows, user isolation, and
 * that missed potential never touches profit or loss.
 * Run with `pnpm --filter api test:int`. Creates throwaway users and data, deletes them afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import {
  DEV_AUTH_HEADER,
  realizedResult,
  type AnalyticsOverview,
  type HuntAnalytics,
  type MarketplaceAnalytics,
  type MissedPotential,
  type ProductAnalytics,
} from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { computeEconomics, DEFAULT_SCORING_POLICY } from '@rein-drop/scoring';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const SUBJECT = `int-test-${randomUUID().slice(0, 8)}`;
const OTHER = `int-test-${randomUUID().slice(0, 8)}`;
const PREFIX = `int-test-analytics-${randomUUID().slice(0, 8)}-`;
const DAY = 86_400_000;
const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });
const ago = (days: number) => new Date(Date.now() - days * DAY);

describe('Analytics (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  let otherUserId: string;
  let market: Record<'ebay' | 'facebook', string>;
  const deal: Record<string, string> = {};
  const hunts = { A: '', B: '' };
  const get = async <T>(path: string, subject = SUBJECT) => (await request(app.getHttpServer()).get(path).set(DEV_AUTH_HEADER, subject).expect(200)).body as T;

  async function makeDeal(
    name: string,
    o: {
      hunt: string;
      market: 'ebay' | 'facebook';
      price: number;
      strength: string;
      product?: string;
      resale?: number;
      status?: 'NEW' | 'SEEN' | 'DISMISSED' | 'BOUGHT';
      listingStatus?: 'ACTIVE' | 'SOLD';
      matchedDaysAgo?: number;
      seen?: boolean;
    },
  ) {
    const listing = await prisma.listing.create({
      data: { marketplaceId: market[o.market], externalId: `${PREFIX}${name}`, url: `https://dev.example/${name}`, title: `Listing ${name}`, priceMinor: o.price, currency: 'ZAR', status: o.listingStatus ?? 'ACTIVE', imageUrls: [] },
    });
    const at = ago(o.matchedDaysAgo ?? 0);
    const match = await prisma.huntMatch.create({
      data: {
        huntId: o.hunt,
        listingId: listing.id,
        status: o.status ?? 'NEW',
        relevanceScore: 100,
        reasons: [],
        matchedAt: at,
        seenAt: o.seen ? at : null,
        dismissedAt: o.status === 'DISMISSED' ? at : null,
      },
    });
    const economics = computeEconomics(
      {
        asking: ZAR(o.price),
        knownCosts: [],
        maxPrice: null,
        target: null,
        comparables: o.resale ? { source: 'int-test', sampleSize: 8, low: ZAR(o.resale - 10_000), typical: ZAR(o.resale), high: ZAR(o.resale + 10_000), asOf: new Date().toISOString() } : null,
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
        strength: o.strength,
        confidence: 'medium',
        score: 70,
        result: o.product ? ({ product: { normalizedName: o.product } } as never) : undefined,
        scoring: { strengthReasons: [], confidenceReasons: [], alert: { eligible: false, kind: null, rules: [], blockedBy: [] } },
        completedAt: at,
      },
    });
    deal[name] = match.id;
    return { matchId: match.id, listingId: listing.id };
  }

  async function buy(name: string, o: { price: number; daysAgo: number; costs?: number[]; currency?: string; title?: string; user?: string }) {
    const d = deal[name];
    const listingId = d ? (await prisma.huntMatch.findUniqueOrThrow({ where: { id: d } })).listingId : null;
    const owner = o.user ?? userId;
    const item = await prisma.inventoryItem.create({
      data: {
        userId: owner,
        huntMatchId: d ?? null,
        listingId,
        title: o.title ?? `Item ${name}`,
        purchasePriceMinor: o.price,
        currency: o.currency ?? 'ZAR',
        purchasedAt: ago(o.daysAgo),
      },
    });
    for (const c of o.costs ?? []) {
      await prisma.cost.create({ data: { userId: owner, inventoryItemId: item.id, category: 'TAX', amountMinor: c, currency: o.currency ?? 'ZAR', incurredAt: ago(o.daysAgo) } });
    }
    if (d) await prisma.huntMatch.update({ where: { id: d }, data: { status: 'BOUGHT', boughtAt: ago(o.daysAgo) } });
    return item.id;
  }

  async function sell(itemId: string, o: { price: number; daysAgo: number; fees?: number[]; currency?: string; on?: 'ebay' | 'facebook'; user?: string }) {
    const owner = o.user ?? userId;
    const sale = await prisma.sale.create({
      data: { userId: owner, inventoryItemId: itemId, salePriceMinor: o.price, currency: o.currency ?? 'ZAR', soldAt: ago(o.daysAgo), marketplaceId: o.on ? market[o.on] : null },
    });
    for (const f of o.fees ?? []) {
      await prisma.cost.create({ data: { userId: owner, saleId: sale.id, category: 'MARKETPLACE_FEE', amountMinor: f, currency: o.currency ?? 'ZAR', incurredAt: ago(o.daysAgo) } });
    }
    await prisma.inventoryItem.update({ where: { id: itemId }, data: { status: 'SOLD' } });
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const user = (subject: string) => prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } });
    userId = (await user(SUBJECT)).id;
    otherUserId = (await user(OTHER)).id;
    const rows = await prisma.marketplace.findMany({ where: { key: { in: ['ebay', 'facebook'] } } });
    market = Object.fromEntries(rows.map((m) => [m.key, m.id])) as typeof market;
    // Far-future polls: a running worker never picks these hunts up.
    const never = new Date('2036-01-01T00:00:00Z');
    const hunt = (owner: string, name: string, status: 'LIVE' | 'PAUSED') =>
      prisma.hunt.create({
        data: { userId: owner, name, query: 'Switch', status, marketplaces: { create: [{ marketplaceId: market.ebay, nextPollAt: never }, { marketplaceId: market.facebook, nextPollAt: never }] } },
      });
    hunts.A = (await hunt(userId, 'Switch hunt', 'LIVE')).id;
    hunts.B = (await hunt(userId, 'Old hunt', 'PAUSED')).id;
    const otherHunt = (await hunt(otherUserId, 'Not yours', 'LIVE')).id;

    // Hunt A - all found today.
    await makeDeal('oled', { hunt: hunts.A, market: 'ebay', price: 400_000, strength: 'strong', product: 'Nintendo Switch OLED', seen: true });
    await makeDeal('lite', { hunt: hunts.A, market: 'facebook', price: 200_000, strength: 'strong', product: 'Nintendo Switch Lite' });
    await makeDeal('ignored', { hunt: hunts.A, market: 'ebay', price: 300_000, strength: 'exceptional', resale: 450_000, status: 'DISMISSED', seen: true });
    await makeDeal('gone', { hunt: hunts.A, market: 'facebook', price: 250_000, strength: 'strong', listingStatus: 'SOLD' });
    await makeDeal('weakGone', { hunt: hunts.A, market: 'ebay', price: 100_000, strength: 'weak', listingStatus: 'SOLD' });
    await makeDeal('saved', { hunt: hunts.A, market: 'ebay', price: 150_000, strength: 'strong', status: 'SEEN', seen: true });
    // Hunt B - found 45 days ago, bought 40, sold 35 at a loss (outside 30d, inside 90d).
    await makeDeal('old', { hunt: hunts.B, market: 'ebay', price: 300_000, strength: 'strong', product: 'Old console', matchedDaysAgo: 45 });
    // Another user's deal and sale - must never count.
    await makeDeal('theirs', { hunt: otherHunt, market: 'ebay', price: 100_000, strength: 'strong' });

    for (const name of ['oled', 'ignored', 'saved']) {
      await prisma.alert.create({ data: { userId, category: 'deal_alerts', huntId: hunts.A, huntMatchId: deal[name], dedupeKey: `${PREFIX}${name}`, title: `Alert ${name}` } });
    }
    const savedListing = (await prisma.huntMatch.findUniqueOrThrow({ where: { id: deal.saved } })).listingId;
    await prisma.savedDeal.create({ data: { userId, listingId: savedListing, huntMatchId: deal.saved } });

    // Outcomes.
    const oled = await buy('oled', { price: 400_000, daysAgo: 10, costs: [60_000] });
    await sell(oled, { price: 650_000, daysAgo: 2, fees: [65_000, 10_000], on: 'ebay' });
    await buy('lite', { price: 200_000, daysAgo: 5 }); // held
    const old = await buy('old', { price: 300_000, daysAgo: 40 });
    await sell(old, { price: 250_000, daysAgo: 35, fees: [10_000], on: 'ebay' });
    // Bought outside Rein Drop in USD, sold in ZAR on Facebook: counted, never converted.
    const camera = await buy('camera', { price: 10_000, daysAgo: 3, currency: 'USD', title: 'Vintage camera' });
    await sell(camera, { price: 200_000, daysAgo: 1, on: 'facebook' });
    const theirs = await buy('theirs', { price: 100_000, daysAgo: 4, user: otherUserId });
    await sell(theirs, { price: 900_000, daysAgo: 1, user: otherUserId });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL }))],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (prisma) {
      await prisma.dealAnalysis.deleteMany({ where: { huntMatchId: { in: Object.values(deal) } } });
      for (const id of [userId, otherUserId]) if (id) await prisma.user.delete({ where: { id } }); // hunts, matches, items, sales, costs, alerts
      await prisma.listing.deleteMany({ where: { externalId: { startsWith: PREFIX } } });
      await prisma.$disconnect();
    }
  });

  it('overview (30 days): spend, revenue, realized profit, margin, buys, sells, holding - per currency', async () => {
    const o = await get<AnalyticsOverview>('/analytics/overview');
    expect(o.period.key).toBe('30d');
    // Per currency, alphabetical; never converted.
    expect(o).toMatchObject({ buys: 3, sells: 2, spent: [{ amountMinor: 10_000, currency: 'USD' }, ZAR(660_000)] });
    // The SQL agrees with the shared TypeScript formula.
    const expected = realizedResult({ purchasePrice: ZAR(400_000), purchaseCosts: [ZAR(60_000)], salePrice: ZAR(650_000), saleCosts: [ZAR(65_000), ZAR(10_000)] });
    expect(expected.status === 'ok' && expected.realizedProfit).toEqual(ZAR(115_000));
    expect(o.realized).toEqual([
      // The camera sale (bought in USD) is counted as revenue but left out of profit.
      { currency: 'ZAR', revenue: ZAR(850_000), comparableSales: 1, excludedSales: 1, realizedProfit: ZAR(115_000), marginPercent: 17 },
    ]);
    expect(o.sellingCosts).toEqual([ZAR(75_000)]);
    expect(o.avgDaysToSell).toBe(5); // 8 days and 2 days
    // Held now: the Lite. Never a loss.
    expect(o.holding).toEqual({ count: 1, costBasis: [ZAR(200_000)], oldestDays: 5 });
  });

  it('periods: 7 days narrows, 90 days includes the earlier loss, all = everything', async () => {
    const week = await get<AnalyticsOverview>('/analytics/overview?period=7d');
    expect(week).toMatchObject({ buys: 2, sells: 2 }); // lite + camera bought; oled + camera sold
    const quarter = await get<AnalyticsOverview>('/analytics/overview?period=90d');
    expect(quarter).toMatchObject({ buys: 4, sells: 3 });
    expect(quarter.realized[0]).toMatchObject({ realizedProfit: ZAR(115_000 - 60_000), comparableSales: 2, excludedSales: 1 });
    const all = await get<AnalyticsOverview>('/analytics/overview?period=all');
    expect(all.period.since).toBeNull();
    expect(all.realized[0]!.realizedProfit).toEqual(ZAR(55_000));
    await request(app.getHttpServer()).get('/analytics/overview?period=forever').set(DEV_AUTH_HEADER, SUBJECT).expect(400);
  });

  it('Hunt funnel: found -> alerted -> viewed -> saved / ignored -> bought -> sold, with rates', async () => {
    const { items } = await get<HuntAnalytics>('/analytics/hunts');
    expect(items.map((h) => h.name)).toEqual(['Switch hunt', 'Old hunt']); // live first
    expect(items[0]).toMatchObject({
      found: 6,
      alerted: 3,
      viewed: 3,
      saved: 1,
      ignored: 1,
      bought: 2,
      sold: 1,
      realized: [{ currency: 'ZAR', realizedProfit: ZAR(115_000) }],
      ignoreRatePercent: 33,
      alertToBuyPercent: 66,
    });
    expect(items[1]).toMatchObject({ found: 0, bought: 0, sold: 0, realized: [] });
    const quarter = await get<HuntAnalytics>('/analytics/hunts?period=90d');
    expect(quarter.items[1]).toMatchObject({ found: 1, bought: 1, sold: 1, realized: [{ realizedProfit: ZAR(-60_000), marginPercent: -24 }] });
  });

  it('products: grouped by the AI product name (else the title), best realized result first, losses last', async () => {
    const { items } = await get<ProductAnalytics>('/analytics/products');
    expect(items.map((p) => [p.name, p.bought, p.sold, p.holding])).toEqual([
      ['Nintendo Switch OLED', 1, 1, 0],
      ['Vintage camera', 1, 1, 0],
      ['Nintendo Switch Lite', 1, 0, 1],
    ]);
    expect(items[0]).toMatchObject({ spent: [ZAR(460_000)], realized: [{ realizedProfit: ZAR(115_000), marginPercent: 17 }], avgDaysToSell: 8 });
    expect(items[1]!.realized).toEqual([{ currency: 'ZAR', revenue: ZAR(200_000), comparableSales: 0, excludedSales: 1, realizedProfit: ZAR(0), marginPercent: null }]);
    const quarter = await get<ProductAnalytics>('/analytics/products?period=90d');
    expect(quarter.items.at(-1)).toMatchObject({ name: 'Old console', realized: [{ realizedProfit: ZAR(-60_000) }] });
  });

  it('marketplaces: what each sourced (and how it sold) vs what sold there', async () => {
    const { items } = await get<MarketplaceAnalytics>('/analytics/marketplaces');
    const by = Object.fromEntries(items.map((m) => [m.marketplace, m]));
    expect(by.ebay).toMatchObject({
      sourced: { found: 4, alerted: 3, bought: 1, sold: 1, realized: [{ realizedProfit: ZAR(115_000) }] },
      soldHere: { sales: 1, revenue: [ZAR(650_000)] },
    });
    expect(by.facebook).toMatchObject({ sourced: { found: 2, alerted: 0, bought: 1, sold: 0, realized: [] }, soldHere: { sales: 1, revenue: [ZAR(200_000)] } });
    // Bought outside Rein Drop.
    expect(by.other).toMatchObject({ sourced: { found: 0, bought: 1, sold: 1 }, soldHere: { sales: 0 } });
  });

  it('missed potential: strong deals never bought and no longer open - estimates only, separate from P/L', async () => {
    const m = await get<MissedPotential>('/analytics/missed');
    expect(m).toMatchObject({ count: 2, gone: 1, ignored: 1, withEstimate: 1, estimatedPotential: [ZAR(150_000)] });
    expect(m.items.map((i) => [i.dealId, i.reason, i.estimatedUpside])).toEqual([
      [deal.ignored, 'ignored', ZAR(150_000)],
      [deal.gone, 'gone', null],
    ]);
    // Weak deals, open deals and bought deals are never "missed"; and missing out changes no profit.
    expect(m.items.map((i) => i.dealId)).not.toContain(deal.weakGone);
    expect((await get<AnalyticsOverview>('/analytics/overview')).realized[0]!.realizedProfit).toEqual(ZAR(115_000));
  });

  it("never includes another user's data", async () => {
    const theirs = await get<AnalyticsOverview>('/analytics/overview', OTHER);
    expect(theirs).toMatchObject({ buys: 1, sells: 1, realized: [{ realizedProfit: ZAR(800_000) }] });
    const mine = await get<MarketplaceAnalytics>('/analytics/marketplaces');
    expect(mine.items.find((x) => x.marketplace === 'ebay')!.sourced.found).toBe(4);
  });
});
