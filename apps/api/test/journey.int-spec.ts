/**
 * END-TO-END JOURNEY (step 85): web-first subscription + mobile companion, on the REAL API, the REAL
 * worker pipeline classes and a REAL PostgreSQL. Identity: Entra External ID tokens signed by a test
 * key (first sign-in creates the account, as in production). Billing: the Stripe SDK against the
 * in-memory fake Stripe. Push: the worker's simulator provider through the real outbox and access
 * gate. "Web" and "mobile" are two separately signed-in clients of the same account.
 *
 * 1 account on web -> 2 onboarding -> 3 subscribe (verified: nothing until Stripe confirms) ->
 * 4 entitlements -> 5 Hunts -> 6 mobile sign-in -> 7 monitoring with mobile closed -> 8 push ->
 * 9 tap opens the deal -> 10 save / dismiss -> 11 consistent on both clients -> 12 cancel, expiry,
 * grace -> 13 access rules everywhere, data kept -> 14 reactivation without duplicates.
 * Plus: unauthorized access, tier-limit bypass, expired auth, webhook replay, duplicate purchase,
 * network failure, multiple devices, account switching, missing push permission, Source-only vs
 * Complete. Run with the int config; throwaway accounts, deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type KeyObject } from 'jose';
import { resolveProductAccess } from '@rein-drop/access';
import { createMockAIProvider } from '@rein-drop/ai-core';
import type { AccessResponse, DealSummary, Hunt } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { DevEbayAdapter, DevFacebookDataProvider, FacebookAdapter } from '@rein-drop/marketplace-core/adapters';
import { AppModule } from './../src/app.module.js';
import { AUTH_PROVIDER } from './../src/auth/auth.types.js';
import { EntraAuthProvider } from './../src/auth/entra-auth.provider.js';
import { loadApiConfig } from './../src/config/api-config.js';
import { BILLING_PROVIDER } from './../src/modules/billing/billing-provider.js';
import { fakeStripe, PRICES, type FakeSubscription } from './../src/modules/billing/fake-stripe.test-helper.js';
// The worker's own classes - the same code the worker process runs.
import { AccessAlertGate } from './../../worker/src/notifications/alert-gate.js';
import { NotificationDispatcher } from './../../worker/src/notifications/notification-dispatcher.js';
import { PushNotificationSender } from './../../worker/src/notifications/push/push-sender.js';
import { SimulatedPushProvider } from './../../worker/src/notifications/push/simulated-push-provider.js';
import { DealAnalysisHandler } from './../../worker/src/pipeline/deal-analysis.handler.js';
import { HuntScheduler } from './../../worker/src/pipeline/hunt-scheduler.js';
import { MarketplaceSearchHandler } from './../../worker/src/pipeline/marketplace-search.handler.js';
import { JobRunner } from './../../worker/src/queue/job-runner.js';
import { PostgresJobQueue } from './../../worker/src/queue/postgres-job-queue.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const TENANT = randomUUID();
const API = randomUUID();
const ISSUER = `https://${TENANT}.ciamlogin.com/${TENANT}/v2.0`;
const RUN = randomUUID().slice(0, 8);
const SEARCH_QUEUE = `journey-search-${RUN}`;
const ANALYSIS_QUEUE = `journey-analysis-${RUN}`;
const NOW_S = Math.floor(Date.now() / 1000);
const MONTH_S = 30 * 86_400;

describe('End-to-end journey: web subscription + mobile companion (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let key: KeyObject;
  const stripe = fakeStripe();
  const push = new SimulatedPushProvider();
  const oids: string[] = [];
  const epoch = new Date();
  const clock = () => new Date();

  /** A signed-in client ("web" or "mobile") for an Entra identity; each has its own token. */
  function client(oid: string, email: string) {
    const token = (expiresIn: string | number = '1h') =>
      new SignJWT({ tid: TENANT, oid, scp: 'access_as_user', ver: '2.0', email, name: 'Journey Tester' })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer(ISSUER)
        .setAudience(API)
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(key);
    const http = () => request(app.getHttpServer());
    /** Sends with a fresh token; asserts the status when one is given (the body is shown on failure). */
    const call = async (req: request.Test, status?: number) => {
      const res = await req.set('authorization', `Bearer ${await token()}`);
      if (status !== undefined) expect(res.status, `${req.method} ${req.url}: ${JSON.stringify(res.body)}`).toBe(status);
      return res;
    };
    return {
      token,
      get: (path: string, status?: number) => call(http().get(path), status),
      post: (path: string, body: object = {}, status?: number) => call(http().post(path).send(body), status),
      patch: (path: string, body: object, status?: number) => call(http().patch(path).send(body), status),
    };
  }
  const identity = () => {
    const oid = randomUUID();
    oids.push(oid);
    return { oid, email: `journey-${oid.slice(0, 8)}@reindrop.test` };
  };

  const registry = () =>
    new MarketplaceRegistry([
      new DevEbayAdapter({ now: clock, epoch, currency: 'ZAR' }),
      new FacebookAdapter(new DevFacebookDataProvider({ now: clock, epoch, currency: 'ZAR' }), clock),
    ]);
  const drain = async (runner: JobRunner) => {
    for (let r = await runner.runOnce(); r.received > 0; r = await runner.runOnce());
  };
  /** One worker pass for these accounts only (the app being closed changes nothing here). */
  async function runMonitoring(userIds: string[], at = new Date()) {
    const now = () => at;
    const queue = new PostgresJobQueue(prisma, now);
    const scheduler = new HuntScheduler(prisma, queue, { pollIntervalMs: 15 * 60_000, maxAttempts: 3, batchSize: 50, queue: SEARCH_QUEUE, onlyUserIds: userIds }, now);
    const search = new MarketplaceSearchHandler(prisma, registry(), { maxPages: 1, analysis: { queue, queueName: ANALYSIS_QUEUE, maxAttempts: 3 } }, now);
    await scheduler.scheduleDue();
    await drain(new JobRunner(queue, [search], { queue: SEARCH_QUEUE, maxJobs: 10, leaseMs: 60_000 }, now));
    const analysis = new DealAnalysisHandler(prisma, createMockAIProvider(), registry(), undefined, now);
    await drain(new JobRunner(queue, [analysis], { queue: ANALYSIS_QUEUE, maxJobs: 50, leaseMs: 60_000 }, now));
  }
  /** The worker's notification loop: outbox -> access gate -> push providers. */
  const dispatch = () =>
    new NotificationDispatcher(
      prisma,
      { PUSH: new PushNotificationSender(prisma, { expo: push, dev_simulated: push }) },
      { batchSize: 200, leaseMs: 60_000, maxAttempts: 3 },
      clock,
      new AccessAlertGate(prisma, { graceDays: 0 }),
    ).dispatchPending();

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey as KeyObject;
    const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'test', alg: 'RS256' }] });
    const config = loadApiConfig({
      NODE_ENV: 'test',
      DATABASE_URL,
      AUTH_PROVIDER: 'entra',
      ENTRA_AUTHORITY: 'https://reindrop.ciamlogin.com',
      ENTRA_TENANT_ID: TENANT,
      ENTRA_API_CLIENT_ID: API,
      BILLING_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_WEBHOOK_SECRET: 'whsec_unused_by_the_fake',
      STRIPE_PRICE_IDS: `pro=${PRICES.pro},ultimate=${PRICES.ultimate}`,
      WEB_APP_URL: 'http://localhost:3000',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
      .overrideProvider(AUTH_PROVIDER)
      .useValue(new EntraAuthProvider(prisma, config.entra!, { issuer: ISSUER, keys }))
      .overrideProvider(BILLING_PROVIDER)
      .useValue(stripe.provider)
      .compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (!prisma) return;
    const users = await prisma.user.findMany({ where: { authProvider: 'entra', authSubject: { in: oids } }, select: { id: true } });
    const hunts = await prisma.hunt.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { id: true } });
    await prisma.dealAnalysis.deleteMany({ where: { huntMatch: { huntId: { in: hunts.map((h) => h.id) } } } });
    const runs = await prisma.searchRun.findMany({ where: { huntIds: { hasSome: hunts.map((h) => h.id) } }, select: { id: true } });
    await prisma.rawListing.deleteMany({ where: { searchRunId: { in: runs.map((r) => r.id) } } });
    await prisma.searchRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
    await prisma.job.deleteMany({ where: { queue: { in: [SEARCH_QUEUE, ANALYSIS_QUEUE] } } });
    await prisma.billingEvent.deleteMany({ where: { providerEventId: { startsWith: `evt_journey_${RUN}` } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await prisma.plan.updateMany({ where: { code: 'complete' }, data: { isActive: false } });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------------------------
  // The journey (sequential: each step builds on the previous one)
  // ---------------------------------------------------------------------------------------------
  const me = identity();
  const web = () => client(me.oid, me.email);
  const mobile = () => client(me.oid, me.email);
  let userId = '';
  let subId = '';
  let event = 0;
  const huntIds: string[] = [];
  let deals: DealSummary[] = [];
  const devices: string[] = [];
  const access = async (c = web()) => (await c.get('/me/access', 200)).body as AccessResponse;
  const setStripe = (s: Partial<FakeSubscription>) => {
    const customer = [...stripe.customers.values()].find((c) => c.metadata.reindrop_user_id === userId)!.id;
    stripe.subscriptions.set(subId, { id: subId, customer, status: 'active', price: PRICES.pro, periodStart: NOW_S, periodEnd: NOW_S + MONTH_S, metadata: { reindrop_user_id: userId }, ...stripe.subscriptions.get(subId), ...s });
  };
  const deliver = (type: string, id = `evt_journey_${RUN}_${++event}`) => {
    const { payload, signature } = stripe.webhook({ id, type, object: stripe.subscriptionObject(stripe.subscriptions.get(subId)!) });
    return request(app.getHttpServer()).post('/billing/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', signature).send(payload);
  };

  it('1. account created on web by the first sign-in; starts on Free', async () => {
    const res = await web().get('/me', 200);
    userId = res.body.userId;
    expect(res.body.email).toBe(me.email);
    expect((await access()).products.source).toMatchObject({ state: 'free', hasAccess: true, paid: false });
  });

  it('2. onboarding (Seller Snapshot) completes', async () => {
    await web().patch('/me/seller-snapshot', { isReseller: true }, 200);
    for (const answer of [{ categories: ['phones_tablets'] }, { stage: 'side_income' }, { sources: ['facebook_marketplace', 'ebay'] }, { dealRule: { criterion: 'case_by_case' } }]) {
      await web().patch('/me/seller-snapshot', answer, 200);
    }
    const done = await web().patch('/me/seller-snapshot', { improvementGoal: 'stop_checking_marketplaces' }, 200);
    expect(done.body.status).toBe('complete');
  });

  it('3. subscribe on web: checkout; the browser "success" grants nothing; Stripe confirmation does', async () => {
    const checkout = await web().post('/billing/checkout', { planCode: 'pro', returnPath: '/settings/billing' }, 200);
    expect(checkout.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    subId = `sub_journey_${RUN}`;
    setStripe({}); // paid on Stripe's page
    expect((await access()).products.source.paid).toBe(false); // returned with ?checkout=success - not yet
    await web().post('/billing/sync', {}, 200);
  });

  it('4. backend entitlements: Pro active everywhere; Sell not included (Source-only account)', async () => {
    const a = await access();
    expect(a.products.source).toMatchObject({ state: 'active', paid: true, plan: { code: 'pro' } });
    expect(a.products.sell).toMatchObject({ state: 'none', hasAccess: false });
    expect((await access(mobile())).products.source.plan?.code).toBe('pro'); // same answer on mobile
  });

  it('5. creates and activates two Hunts (Pro allows more than one)', async () => {
    for (const query of ['iPhone 13', 'Galaxy S23']) {
      const created = await web().post('/hunts', { query, marketplaces: ['ebay', 'facebook'], location: { text: 'Cape Town', radiusKm: 40 }, maxPrice: { amountMinor: 1_500_000, currency: 'ZAR' } }, 201);
      huntIds.push(created.body.id);
      await web().post(`/hunts/${created.body.id}/activate`, {}, 200);
    }
    expect((await prisma.hunt.findMany({ where: { userId } })).map((h) => h.status)).toEqual(['LIVE', 'LIVE']);
  });

  it('6. mobile signs into the same account: same Hunts; registers two phones (multiple devices)', async () => {
    const hunts = (await mobile().get('/hunts', 200)).body.items as Hunt[];
    expect(hunts.map((h) => h.id).sort()).toEqual([...huntIds].sort());
    for (const token of [`dev-simulated:${randomUUID()}`, `dev-simulated:${randomUUID()}`]) {
      const device = await mobile().post('/me/push-devices', { provider: 'dev_simulated', token, platform: 'android' }, 200);
      devices.push(device.body.id);
    }
  });

  it('7. backend monitoring runs with the mobile app closed: deals appear for the account', async () => {
    await runMonitoring([userId]); // no client request involved
    deals = (await web().get('/deals?status=all&limit=100', 200)).body.items as DealSummary[];
    expect(deals.length).toBeGreaterThan(0);
    expect(await prisma.alert.count({ where: { userId } })).toBeGreaterThan(0);
  });

  it('8. push notifications (simulated) reach every registered phone, payload ids only', async () => {
    const before = push.sent.length;
    await dispatch();
    const mine = push.sent.slice(before).filter((m) => m.data.alertId && m.to.startsWith('dev-simulated:'));
    const alerts = await prisma.alert.findMany({ where: { userId, deliveries: { some: { channel: 'PUSH', status: 'SIMULATED' } } } });
    expect(alerts.length).toBeGreaterThan(0);
    expect(mine.length).toBe(alerts.length * 2); // one per phone
    for (const m of mine) expect(Object.keys(m.data).sort()).toEqual(['alertId', 'category', 'dealId']);
  });

  it('9. tapping the notification opens the correct deal (and marks the alert read)', async () => {
    const tapped = push.sent.find((m) => m.data.dealId)!;
    const deal = await mobile().get(`/deals/${tapped.data.dealId}`, 200);
    expect(deal.body.id).toBe(tapped.data.dealId);
    await mobile().post(`/alerts/${tapped.data.alertId}/read`, {}, 200);
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: tapped.data.alertId } })).readAt).not.toBeNull();
  });

  it('10-11. save on mobile, dismiss on web: both clients see the same state', async () => {
    const [toSave, toIgnore] = deals;
    await mobile().post(`/deals/${toSave!.id}/save`, {}, 200);
    await web().post(`/deals/${toIgnore!.id}/ignore`, {}, 200);
    for (const c of [web(), mobile()]) {
      const saved = (await c.get('/deals?status=saved', 200)).body.items as DealSummary[];
      const ignored = (await c.get('/deals?status=ignored', 200)).body.items as DealSummary[];
      const open = (await c.get('/deals?status=open&limit=100', 200)).body.items as DealSummary[];
      expect(saved.map((d) => d.id)).toContain(toSave!.id);
      expect(ignored.map((d) => d.id)).toEqual([toIgnore!.id]);
      expect(open.map((d) => d.id)).not.toContain(toIgnore!.id);
    }
    // Something bought, to check it survives the downgrade later.
    await web().post(`/deals/${toSave!.id}/bought`, {}, 200);
  });

  it('12a. cancel (at period end): access continues until the period ends; nothing paused yet', async () => {
    setStripe({ cancelAtPeriodEnd: true });
    await deliver('customer.subscription.updated').expect(200);
    expect((await access()).products.source).toMatchObject({ state: 'active', cancelsAtPeriodEnd: true, paid: true });
    expect(await prisma.hunt.count({ where: { userId, status: 'LIVE' } })).toBe(2);
  });

  it('12b. grace rule: with BILLING_GRACE_DAYS a failed renewal keeps access for the grace days; 0 = none', async () => {
    // Policy check on the shared resolver (same code API + worker use): unpaid renewal just now.
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { providerSubscriptionId: subId } });
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'UNPAID', cancelAtPeriodEnd: false } });
    expect((await resolveProductAccess(prisma, userId, 'source', { policy: { graceDays: 3 } })).state).toBe('grace_period');
    expect((await resolveProductAccess(prisma, userId, 'source', { policy: { graceDays: 0 } })).state).toBe('expired');
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', cancelAtPeriodEnd: true } });
  });

  it('13. the period ends: Free again; worker pauses Hunts above the limit; pushes for them stop; data kept', async () => {
    const dealsBefore = await prisma.huntMatch.count({ where: { hunt: { userId } } });
    setStripe({ status: 'canceled', periodEnd: NOW_S - 60 });
    await deliver('customer.subscription.deleted').expect(200);
    const a = await access();
    expect(a.products.source).toMatchObject({ state: 'canceled', paid: false, plan: { code: 'free' } });
    expect((await access(mobile())).products.source.state).toBe('canceled'); // mobile reads the same rules

    // A pending push for the Hunt above the limit is skipped even before the sweep runs.
    const extra = await prisma.alert.create({
      data: { userId, category: 'deal_alerts', huntId: huntIds[1]!, dedupeKey: `journey:${RUN}:after-cancel`, title: 'late', deliveries: { create: [{ channel: 'IN_APP', status: 'SENT' }, { channel: 'PUSH', status: 'PENDING' }] } },
    });
    await dispatch();
    expect(await prisma.hunt.count({ where: { userId, status: 'LIVE' } })).toBe(1); // limit enforced
    const skipped = await prisma.notificationDelivery.findUniqueOrThrow({ where: { alertId_channel: { alertId: extra.id, channel: 'PUSH' } } });
    expect(['SKIPPED', 'SIMULATED']).toContain(skipped.status);
    const pausedHunt = (await prisma.hunt.findMany({ where: { userId, status: 'PAUSED' } }))[0]!;
    if (pausedHunt.id === huntIds[1]) expect(skipped).toMatchObject({ status: 'SKIPPED', reason: 'hunt_not_live' });

    // Clients can't bring the paused Hunt back above the limit.
    await mobile().post(`/hunts/${pausedHunt.id}/resume`, {}, 409);
    // Nothing deleted: Hunts, deals, saved / ignored, inventory.
    expect(await prisma.hunt.count({ where: { userId } })).toBe(2);
    expect(await prisma.huntMatch.count({ where: { hunt: { userId } } })).toBe(dealsBefore);
    expect(await prisma.inventoryItem.count({ where: { userId } })).toBe(1);
    expect(((await web().get('/deals?status=ignored', 200)).body.items as DealSummary[]).length).toBe(1);
  });

  it('14. reactivation restores Pro; the paused Hunt resumes; no duplicate subscriptions, deals or alerts', async () => {
    await web().post('/billing/checkout', { planCode: 'pro', returnPath: '/settings/billing' }, 200);
    subId = `sub_journey_${RUN}_again`;
    setStripe({ status: 'active', periodStart: NOW_S, periodEnd: NOW_S + MONTH_S, cancelAtPeriodEnd: false });
    await web().post('/billing/sync', {}, 200);
    await deliver('customer.subscription.created').expect(200); // late webhook too
    expect((await access()).products.source).toMatchObject({ state: 'active', plan: { code: 'pro' } });
    const paused = (await prisma.hunt.findMany({ where: { userId, status: 'PAUSED' } }))[0]!;
    await mobile().post(`/hunts/${paused.id}/resume`, {}, 200);

    const counts = async () => ({
      subs: await prisma.subscription.count({ where: { userId, provider: 'stripe' } }),
      deals: await prisma.huntMatch.count({ where: { hunt: { userId } } }),
      alerts: await prisma.alert.count({ where: { userId, category: 'deal_alerts' } }),
      inventory: await prisma.inventoryItem.count({ where: { userId } }),
    });
    const before = await counts();
    expect(before.subs).toBe(2); // the canceled one and the new one - one row per Stripe subscription
    await runMonitoring([userId], new Date(Date.now() + 16 * 60_000)); // next poll, same listings
    await dispatch();
    expect(await counts()).toEqual(before);
  });

  // ---------------------------------------------------------------------------------------------
  // Abuse, failure and configuration cases
  // ---------------------------------------------------------------------------------------------

  it('unauthorized access: no token / garbage token = 401; another account\'s data = 404', async () => {
    for (const path of ['/me', '/hunts', '/deals', '/me/access', '/sell/listings', '/alerts']) {
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer()).get(path).set('authorization', 'Bearer not-a-token').expect(401);
    }
    const other = identity();
    const stranger = client(other.oid, other.email);
    await stranger.get('/me', 200);
    await stranger.get(`/hunts/${huntIds[0]}`, 404);
    await stranger.get(`/deals/${deals[0]!.id}`, 404);
    await stranger.post(`/deals/${deals[0]!.id}/save`, {}, 404);
    await stranger.post(`/hunts/${huntIds[0]}/pause`, {}, 404);
    // Webhooks need Stripe's signature.
    await request(app.getHttpServer()).post('/billing/webhooks/stripe').set('content-type', 'application/json').send('{}').expect(400);
  });

  it('expired authentication: an expired token is refused (401) - the app sends the person to sign in again', async () => {
    const expired = await web().token(-60);
    await request(app.getHttpServer()).get('/hunts').set('authorization', `Bearer ${expired}`).expect(401);
  });

  it('tier-limit bypass attempts on Free: second live Hunt refused, status can\'t be set directly, concurrent activations race-safe', async () => {
    const free = identity();
    const c = client(free.oid, free.email);
    await c.get('/me', 200);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push((await c.post('/hunts', { query: `Switch ${i}`, marketplaces: ['ebay'] }, 201)).body.id);
    }
    await c.post(`/hunts/${ids[0]}/activate`, {}, 200);
    await c.post(`/hunts/${ids[1]}/activate`, {}, 409);
    // Writing the status field directly is not part of the contract.
    await c.patch(`/hunts/${ids[1]}`, { status: 'LIVE' }, 400);
    // Pause, then race two activations: the per-user lock lets only one through.
    await c.post(`/hunts/${ids[0]}/pause`, {}, 200);
    const results = await Promise.all([c.post(`/hunts/${ids[1]}/activate`), c.post(`/hunts/${ids[2]}/activate`)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const userIdFree = (await c.get('/me', 200)).body.userId as string;
    expect(await prisma.hunt.count({ where: { userId: userIdFree, status: 'LIVE' } })).toBe(1);
    // Development plan confirmation isn't available with real billing (defect found + fixed in step 85).
    expect([404]).toContain((await c.post('/billing/dev/confirm', { planCode: 'ultimate' })).status);
  });

  it('webhook replay: the same event delivered twice is processed once', async () => {
    const id = `evt_journey_${RUN}_replay`;
    expect((await deliver('customer.subscription.updated', id).expect(200)).body.outcome).toBe('processed');
    expect((await deliver('customer.subscription.updated', id).expect(200)).body.outcome).toBe('duplicate');
  });

  it('duplicate purchase: a second checkout while a paid plan is current is refused', async () => {
    const res = await (await web().post('/billing/checkout', { planCode: 'ultimate', returnPath: '/settings/billing' }));
    expect(res.status).toBe(409);
    expect(await prisma.subscription.count({ where: { userId, provider: 'stripe', status: 'ACTIVE' } })).toBe(1);
  });

  it('network failure: Stripe unreachable during checkout = a clear error, nothing granted or recorded', async () => {
    const free = identity();
    const c = client(free.oid, free.email);
    const uid = (await c.get('/me', 200)).body.userId as string;
    stripe.failNextRequest();
    const res = await c.post('/billing/checkout', { planCode: 'pro', returnPath: '/settings/billing' });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await prisma.subscription.count({ where: { userId: uid, provider: 'stripe' } })).toBe(0);
  });

  it('account switching: a phone registered by another account moves to it; the first account stops reaching it', async () => {
    const token = (await prisma.pushDevice.findUniqueOrThrow({ where: { id: devices[0]! } })).token;
    const second = identity();
    const c = client(second.oid, second.email);
    const uid = (await c.get('/me', 200)).body.userId as string;
    await c.post('/me/push-devices', { provider: 'dev_simulated', token, platform: 'android' }, 200);
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { token } })).userId).toBe(uid);
    const mine = await mobile().get('/me/push-devices', 200);
    expect((mine.body.items as { id: string }[]).map((d) => d.id)).not.toContain(devices[0]);
  });

  it('missing push permission (no registered phone): the push is skipped, the inbox still has the alert', async () => {
    const nobody = identity();
    const c = client(nobody.oid, nobody.email);
    const uid = (await c.get('/me', 200)).body.userId as string;
    const alert = await prisma.alert.create({ data: { userId: uid, category: 'operational', dedupeKey: `journey:${RUN}:nodevice`, title: 'hello', deliveries: { create: [{ channel: 'IN_APP', status: 'SENT' }, { channel: 'PUSH', status: 'PENDING' }] } } });
    await dispatch();
    expect(await prisma.notificationDelivery.findUniqueOrThrow({ where: { alertId_channel: { alertId: alert.id, channel: 'PUSH' } } })).toMatchObject({ status: 'SKIPPED', reason: 'no_device' });
    expect(((await c.get('/alerts', 200)).body.items as { id: string }[]).map((a) => a.id)).toContain(alert.id);
  });

  it('Complete account: grants Source AND Sell; Source-only (Pro) grants Source only', async () => {
    const complete = identity();
    const c = client(complete.oid, complete.email);
    const uid = (await c.get('/me', 200)).body.userId as string;
    // Complete isn't sold yet (inactive plan) - switched on for this check only.
    const plan = await prisma.plan.update({ where: { code: 'complete' }, data: { isActive: true } });
    try {
      await prisma.subscription.create({ data: { userId: uid, planId: plan.id, status: 'ACTIVE', provider: 'dev-fake', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + MONTH_S * 1000) } });
      const a = (await c.get('/me/access', 200)).body as AccessResponse;
      expect(a.products.source).toMatchObject({ hasAccess: true, paid: true, plan: { code: 'complete' } });
      expect(a.products.sell).toMatchObject({ hasAccess: true, paid: true, state: 'active' });
    } finally {
      await prisma.plan.update({ where: { code: 'complete' }, data: { isActive: false } });
    }
    expect((await access()).products.sell.hasAccess).toBe(false); // the Pro journey account
  });
});
