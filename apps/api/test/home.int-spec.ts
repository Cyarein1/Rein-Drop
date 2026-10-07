/**
 * GET /me/home against a REAL PostgreSQL: all five sections from real rows.
 * Throwaway users, hunts, listings, matches, alerts, purchases and sales - deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, type Home } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const SUBJECT = `int-test-${randomUUID().slice(0, 8)}`;
const EMPTY = `int-test-${randomUUID().slice(0, 8)}`;
const PREFIX = `int-test-home-${randomUUID().slice(0, 8)}-`;
const DAY = 86_400_000;
const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });

describe('Home (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  let emptyId: string;
  let live: string;
  const get = async (subject = SUBJECT) => (await request(app.getHttpServer()).get('/me/home').set(DEV_AUTH_HEADER, subject).expect(200)).body as Home;

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const user = (s: string) => prisma.user.create({ data: { email: `${s}@reindrop.test`, authProvider: 'dev', authSubject: s } });
    userId = (await user(SUBJECT)).id;
    emptyId = (await user(EMPTY)).id;
    const ebay = (await prisma.marketplace.findUniqueOrThrow({ where: { key: 'ebay' } })).id;
    const now = Date.now();
    live = (
      await prisma.hunt.create({
        data: {
          userId,
          name: 'iPhone 13',
          query: 'iPhone 13',
          status: 'LIVE',
          activatedAt: new Date(now - 2 * DAY),
          marketplaces: { create: [{ marketplaceId: ebay, lastPolledAt: new Date(now - 60_000), lastPollStatus: 'SUCCEEDED', nextPollAt: new Date('2036-01-01') }] },
        },
      })
    ).id;
    await prisma.hunt.create({ data: { userId, name: 'PS5', query: 'PS5', status: 'PAUSED' } });
    await prisma.hunt.create({ data: { userId, name: 'Old', query: 'Old', status: 'ARCHIVED' } });

    const listing = (title: string) =>
      prisma.listing.create({ data: { marketplaceId: ebay, externalId: `${PREFIX}${randomUUID().slice(0, 8)}`, url: 'https://example.com/x', title, priceMinor: 400_000, currency: 'ZAR', status: 'ACTIVE', imageUrls: [], listedAt: new Date(now - 3_600_000) } });
    const open = await prisma.huntMatch.create({ data: { huntId: live, listingId: (await listing('iPhone 13 open')).id, status: 'NEW' } });
    const bought = await prisma.huntMatch.create({ data: { huntId: live, listingId: (await listing('iPhone 13 bought')).id, status: 'BOUGHT' } });
    await prisma.alert.create({ data: { userId, huntId: live, huntMatchId: open.id, category: 'deal_alerts', dedupeKey: `int-test:${randomUUID()}`, title: 'Strong deal: iPhone 13', createdAt: new Date(now - 30 * 60_000) } });

    // Outcomes: one still held, one sold at a profit after costs (in the period), one sold long ago.
    await prisma.inventoryItem.create({ data: { userId, title: 'iPhone 13 bought', purchasePriceMinor: 380_000, currency: 'ZAR', purchasedAt: new Date(now - 10 * 60_000), huntMatchId: bought.id } });
    const sold = await prisma.inventoryItem.create({ data: { userId, title: 'iPhone 12', purchasePriceMinor: 300_000, currency: 'ZAR', purchasedAt: new Date(now - 10 * DAY), status: 'SOLD' } });
    const sale = await prisma.sale.create({ data: { userId, inventoryItemId: sold.id, salePriceMinor: 450_000, currency: 'ZAR', soldAt: new Date(now - 2 * DAY) } });
    await prisma.cost.createMany({
      data: [
        { userId, inventoryItemId: sold.id, category: 'REPAIR', amountMinor: 20_000, currency: 'ZAR', incurredAt: new Date(now - 9 * DAY) },
        { userId, saleId: sale.id, category: 'MARKETPLACE_FEE', amountMinor: 30_000, currency: 'ZAR', incurredAt: new Date(now - 2 * DAY) },
      ],
    });
    const old = await prisma.inventoryItem.create({ data: { userId, title: 'Old sale', purchasePriceMinor: 1, currency: 'ZAR', purchasedAt: new Date(now - 90 * DAY), status: 'SOLD' } });
    await prisma.sale.create({ data: { userId, inventoryItemId: old.id, salePriceMinor: 999_999, currency: 'ZAR', soldAt: new Date(now - 80 * DAY) } });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL }))] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    for (const id of [userId, emptyId]) if (id) await prisma.user.delete({ where: { id } }); // hunts, matches, alerts, inventory, sales, costs
    await prisma.listing.deleteMany({ where: { externalId: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it('1. attention: unread alerts, deals to review and the strongest open deals', async () => {
    const home = await get();
    expect(home.attention).toMatchObject({ unreadAlerts: 1, toReview: 1 });
    expect(home.attention.top.map((d) => d.listing.title)).toEqual(['iPhone 13 open']);
  });

  it('2. hunts: live ones with monitoring state; paused / draft counted; archived left out', async () => {
    const home = await get();
    expect(home.hunts).toMatchObject({ live: 1, paused: 1, drafts: 0 });
    expect(home.hunts.items).toHaveLength(1);
    expect(home.hunts.items[0]).toMatchObject({ id: live, name: 'iPhone 13', status: 'LIVE', activity: { scanning: false, counts: { deals: 2, toReview: 1, bought: 1 } } });
  });

  it('3. realized profit: recorded sales in the last 30 days, after recorded costs', async () => {
    const { profit } = await get();
    expect(profit).toMatchObject({ periodDays: 30, bought: 2, sold: 1, holding: 1, hasSales: true });
    // 450 000 - 300 000 - 20 000 (repair) - 30 000 (fee) = 100 000; spent = 380 000 + 300 000.
    expect(profit.byCurrency).toEqual([{ currency: 'ZAR', spent: ZAR(680_000), revenue: ZAR(450_000), realizedProfit: ZAR(100_000), sold: 1 }]);
  });

  it('4. recent: purchases, the alert and the sale, newest first', async () => {
    const { recent } = await get();
    expect(recent.map((r) => r.kind)).toEqual(['bought', 'alert', 'sold', 'bought']);
    expect(recent[0]).toMatchObject({ title: 'iPhone 13 bought', amount: ZAR(380_000) });
    expect(recent[2]).toMatchObject({ title: 'iPhone 12', amount: ZAR(450_000) });
  });

  it('5. one recommendation from the user\'s own state (here: setup not finished)', async () => {
    expect((await get()).recommendation).toMatchObject({ code: 'finish_setup', kind: 'setup', target: { kind: 'onboarding' } });
  });

  it('a brand-new account: empty sections, no invented numbers', async () => {
    const home = await get(EMPTY);
    expect(home).toMatchObject({
      attention: { unreadAlerts: 0, toReview: 0, top: [] },
      hunts: { live: 0, paused: 0, drafts: 0, items: [] },
      profit: { bought: 0, sold: 0, holding: 0, byCurrency: [], hasSales: false },
      recent: [],
      recommendation: { code: 'finish_setup' },
    });
  });
});
