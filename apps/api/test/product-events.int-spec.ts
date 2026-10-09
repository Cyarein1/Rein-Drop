/**
 * Product events (Build Prompt 43) against a REAL API + PostgreSQL: each key action records its
 * event once - when the state actually changes - with only the catalog's properties, and nothing
 * from the marketplace listing, money amounts or what the user typed ever leaves in an event.
 * Billing events (plan_selected, cancellation) are covered in billing.int-spec.ts, deal_alerted in
 * the worker's alerts.int-spec.ts.
 * Run with `pnpm --filter api test:int`. Creates a throwaway user, hunt, listings and matches and
 * deletes everything afterwards. The hunt's polls are pushed to 2036 before it goes live, so a
 * worker running alongside never searches it.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, type Hunt, type InventoryItem } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { MemoryProductEventProvider } from '@rein-drop/telemetry';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';
import { PRODUCT_EVENT_PROVIDER } from './../src/modules/telemetry/telemetry.module.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const SUBJECT = `int-test-${randomUUID().slice(0, 8)}`;
const PREFIX = `int-test-events-${randomUUID().slice(0, 8)}-`;
const NEVER = new Date('2036-01-01T00:00:00Z');
const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });

/** Things that must never appear in any product event. */
const LISTING_TITLE = 'Nintendo Switch OLED white - barely used';
const LISTING_URL = `https://dev.example/ebay/${PREFIX}item`;
const HUNT_QUERY = 'Nintendo Switch OLED telemetry check';
const IGNORE_REASON = 'seller asked for payment off-platform';

describe('Product events (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  let huntId: string;
  const tracked = new MemoryProductEventProvider();
  const deal = { kept: '', ignored: '' };

  const as = (req: request.Test) => req.set(DEV_AUTH_HEADER, SUBJECT);
  const server = () => app.getHttpServer();
  const names = () => tracked.events.filter((e) => e.distinctId === userId).map((e) => e.name);
  /** Events recorded since `from` (the buffer keeps everything for the final privacy check). */
  const since = (from: number) => tracked.events.slice(from).map((e) => [e.name, e.properties]);

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    userId = (await prisma.user.create({ data: { email: `${SUBJECT}@reindrop.test`, authProvider: 'dev', authSubject: SUBJECT } })).id;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(loadApiConfig({ NODE_ENV: 'test', DATABASE_URL }))] })
      .overrideProvider(PRODUCT_EVENT_PROVIDER)
      .useValue(tracked)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (prisma) {
      await prisma.inventoryItem.deleteMany({ where: { userId } });
      if (userId) await prisma.user.delete({ where: { id: userId } }); // profile, hunts, matches, saved deals, subscriptions
      await prisma.listing.deleteMany({ where: { externalId: { startsWith: PREFIX } } });
      await prisma.$disconnect();
    }
  });

  it('onboarding: started on the first answer, completed once when the fifth answer lands', async () => {
    const patch = (body: object) => as(request(server()).patch('/me/seller-snapshot')).send(body).expect(200);
    await patch({ isReseller: true });
    await patch({ categories: ['gaming'] });
    await patch({ stage: 'side_income' });
    await patch({ sources: ['ebay'] });
    await patch({ dealRule: { criterion: 'min_margin', targetPercent: 30 } });
    expect(names()).toEqual(['onboarding_started']);
    await patch({ improvementGoal: 'stop_checking_marketplaces' });
    await patch({ stage: 'full_time' });
    expect(names()).toEqual(['onboarding_started', 'onboarding_completed']);
  });

  it('hunts: created, then activated through the plan gate (a blocked or repeated activation records nothing)', async () => {
    const created = await as(request(server()).post('/hunts'))
      .send({ query: HUNT_QUERY, marketplaces: ['ebay'], maxPrice: ZAR(450_000) })
      .expect(201);
    huntId = (created.body as Hunt).id;
    expect(tracked.named('hunt_created', userId).map((e) => e.properties)).toEqual([{ huntId, marketplaces: ['ebay'], hasMaxPrice: true, hasTarget: false }]);

    // The plan gate was shown (reported by the app).
    await as(request(server()).post('/telemetry/events')).send({ name: 'plan_viewed', properties: { context: 'hunt_activation' } }).expect(204);

    await prisma.huntMarketplace.updateMany({ where: { huntId }, data: { nextPollAt: NEVER } });
    await as(request(server()).post(`/hunts/${huntId}/activate`)).expect(200);
    await as(request(server()).post(`/hunts/${huntId}/activate`)).expect(409);
    // Pause / resume are not activations.
    await as(request(server()).post(`/hunts/${huntId}/pause`)).expect(200);
    await as(request(server()).post(`/hunts/${huntId}/resume`)).expect(200);
    await prisma.huntMarketplace.updateMany({ where: { huntId }, data: { nextPollAt: NEVER } });
    expect(tracked.named('hunt_activated', userId).map((e) => e.properties)).toEqual([{ huntId, planCode: 'free' }]);
    expect(names()).toEqual(['onboarding_started', 'onboarding_completed', 'hunt_created', 'plan_viewed', 'hunt_activated']);
  });

  it('deals: opened (first / again), saved once, ignored once, bought once', async () => {
    const ebay = await prisma.marketplace.findUniqueOrThrow({ where: { key: 'ebay' } });
    for (const name of ['kept', 'ignored'] as const) {
      const listing = await prisma.listing.create({
        data: {
          marketplaceId: ebay.id,
          externalId: `${PREFIX}${name}`,
          url: name === 'kept' ? LISTING_URL : `${LISTING_URL}-2`,
          title: LISTING_TITLE,
          priceMinor: 412_300,
          currency: 'ZAR',
          status: 'ACTIVE',
          imageUrls: [],
          listedAt: new Date(),
          firstSeenAt: new Date(),
        },
      });
      deal[name] = (await prisma.huntMatch.create({ data: { huntId, listingId: listing.id, status: 'NEW', relevanceScore: 100, reasons: [] } })).id;
    }
    const post = (path: string, body: object = {}) => as(request(server()).post(path)).send(body).expect(200);

    const from = tracked.events.length;
    await post(`/deals/${deal.kept}/seen`);
    await post(`/deals/${deal.kept}/seen`);
    await post(`/deals/${deal.kept}/save`);
    await post(`/deals/${deal.kept}/save`);
    await post(`/deals/${deal.ignored}/ignore`, { reason: IGNORE_REASON });
    await post(`/deals/${deal.ignored}/ignore`, { reason: IGNORE_REASON });
    await post(`/deals/${deal.kept}/bought`, {});
    await post(`/deals/${deal.kept}/bought`, {});
    expect(since(from)).toEqual([
      ['deal_opened', { dealId: deal.kept, firstOpen: true }],
      ['deal_opened', { dealId: deal.kept, firstOpen: false }],
      ['deal_saved', { dealId: deal.kept }],
      ['deal_ignored', { dealId: deal.ignored, hasReason: true }],
      ['deal_bought', { dealId: deal.kept, marketplace: 'ebay', strength: null }],
    ]);
  });

  it('sale_recorded once per sale (a correction is not another sale), with the direction only', async () => {
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { huntMatchId: deal.kept } });
    const sell = (amountMinor: number) =>
      as(request(server()).put(`/inventory/${item.id}/sale`)).send({ price: ZAR(amountMinor), soldAt: new Date().toISOString() }).expect(200);
    const from = tracked.events.length;
    const sold = (await sell(500_000)).body as InventoryItem;
    expect(sold.result).toMatchObject({ status: 'ok' });
    await sell(400_000); // corrected: now a loss - still one sale
    expect(since(from)).toEqual([['sale_recorded', { inventoryItemId: item.id, fromDeal: true, result: 'profit', daysHeld: 0 }]]);
  });

  it('the client endpoint accepts only screen events, for the signed-in user, in the catalog shape', async () => {
    const from = tracked.events.length;
    const send = (body: object) => as(request(server()).post('/telemetry/events')).send(body);
    // Server-owned events can't be reported (or forged) by an app.
    await send({ name: 'deal_bought', properties: { dealId: deal.kept, marketplace: 'ebay', strength: null } }).expect(400);
    await send({ name: 'plan_viewed', properties: { context: 'hunt_activation', email: `${SUBJECT}@reindrop.test` } }).expect(400);
    await send({ name: 'plan_viewed', properties: { context: 'hunt_activation' }, distinctId: randomUUID() }).expect(400);
    await request(server()).post('/telemetry/events').send({ name: 'plan_viewed', properties: { context: 'hunt_activation' } }).expect(401);
    expect(since(from)).toEqual([]);
  });

  it('no event of the whole run carries listing content, money, free text or personal data', async () => {
    expect(tracked.events).toHaveLength(11); // 2 onboarding + 3 hunt / plan gate + 5 deal + 1 sale
    const all = JSON.stringify(tracked.events);
    for (const forbidden of [LISTING_TITLE, LISTING_URL, '412300', '500000', IGNORE_REASON, HUNT_QUERY, `${SUBJECT}@reindrop.test`, SUBJECT]) {
      expect(all).not.toContain(forbidden);
    }
    expect(tracked.events.every((e) => e.distinctId === userId && e.source === 'api')).toBe(true);
  });
});
