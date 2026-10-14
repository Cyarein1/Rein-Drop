/**
 * Web subscription lifecycle against a REAL PostgreSQL and the Stripe SDK talking to an in-memory
 * Stripe (fake-stripe.test-helper): successful checkout, failed payments, renewal, cancellation,
 * webhook retries / duplicates / out-of-order delivery, and account reconciliation without webhooks
 * (POST /billing/sync). Paid access only ever comes from what Stripe itself reports.
 * Each test uses its own account; everything is deleted afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, type AccessResponse } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';
import { BILLING_PROVIDER } from './../src/modules/billing/billing-provider.js';
import { fakeStripe, PRICES, type FakeSubscription } from './../src/modules/billing/fake-stripe.test-helper.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const RUN = randomUUID().slice(0, 8);
const NOW_S = Math.floor(Date.now() / 1000);
const MONTH_S = 30 * 86_400;

describe('Web subscription lifecycle (integration, real database, Stripe fake)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  const stripe = fakeStripe();
  const users: string[] = [];
  let n = 0;

  /** A signed-in account that has started checkout (so it has a Stripe customer). */
  async function customer() {
    const subject = `int-bill-${RUN}-${++n}`;
    const userId = (await prisma.user.create({ data: { email: `${subject}@reindrop.test`, authProvider: 'dev', authSubject: subject } })).id;
    users.push(userId);
    const as = (req: request.Test) => req.set(DEV_AUTH_HEADER, subject);
    const post = (path: string, body: object = {}) => as(request(app.getHttpServer()).post(path)).send(body);
    const access = async () => (await as(request(app.getHttpServer()).get('/me/access')).expect(200)).body as AccessResponse;
    const checkout = await post('/billing/checkout', { planCode: 'pro', returnPath: '/settings/billing' }).expect(200);
    expect(checkout.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const customerId = [...stripe.customers.values()].find((c) => c.metadata.reindrop_user_id === userId)!.id;
    const subId = `sub_${RUN}_${n}`;
    /** What Stripe holds for this account (as if the person paid on Stripe's page). */
    const setStripe = (s: Partial<FakeSubscription>) =>
      stripe.subscriptions.set(subId, { id: subId, customer: customerId, status: 'active', price: PRICES.pro, periodStart: NOW_S, periodEnd: NOW_S + MONTH_S, metadata: { reindrop_user_id: userId }, ...stripe.subscriptions.get(subId), ...s });
    let e = 0;
    const deliver = (type = 'customer.subscription.updated', id = `evt_${RUN}_${n}_${++e}`) => {
      const { payload, signature } = stripe.webhook({ id, type, object: stripe.subscriptionObject(stripe.subscriptions.get(subId)!) });
      return request(app.getHttpServer()).post('/billing/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', signature).send(payload);
    };
    const row = () => prisma.subscription.findUnique({ where: { providerSubscriptionId: subId } });
    return { userId, subId, post, access, setStripe, deliver, row };
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    const config = loadApiConfig({
      NODE_ENV: 'test',
      DATABASE_URL,
      BILLING_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_WEBHOOK_SECRET: 'whsec_unused_by_the_fake',
      STRIPE_PRICE_IDS: `pro=${PRICES.pro},ultimate=${PRICES.ultimate}`,
      WEB_APP_URL: 'http://localhost:3000',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).overrideProvider(BILLING_PROVIDER).useValue(stripe.provider).compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.billingEvent.deleteMany({ where: { providerEventId: { startsWith: `evt_${RUN}_` } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('successful checkout: the browser returning "success" grants nothing; server-side confirmation (sync) or the webhook does', async () => {
    const c = await customer();
    // The person paid on Stripe's page; the browser comes back with ?checkout=success - nothing changes yet.
    c.setStripe({});
    expect((await c.access()).products.source).toMatchObject({ state: 'free', paid: false });
    // The billing page asks the server to confirm with Stripe (no webhook yet).
    const synced = await c.post('/billing/sync').expect(200);
    expect(synced.body.subscription).toMatchObject({ planCode: 'pro', status: 'ACTIVE', provider: 'stripe' });
    expect((await c.access()).products.source).toMatchObject({ state: 'active', paid: true, plan: { code: 'pro' } });
    // The late webhook changes nothing more (same row, idempotent).
    expect((await c.deliver('customer.subscription.created').expect(200)).body.outcome).toBe('processed');
    expect(await prisma.subscription.count({ where: { providerSubscriptionId: c.subId } })).toBe(1);
  });

  it('a checkout that was never paid (incomplete) grants nothing, even after sync', async () => {
    const c = await customer();
    c.setStripe({ status: 'incomplete' });
    await c.post('/billing/sync').expect(200);
    expect((await c.access()).products.source).toMatchObject({ state: 'free', paid: false });
  });

  it('renewal: Stripe moves the period forward; Rein Drop follows, the plan stays', async () => {
    const c = await customer();
    c.setStripe({});
    await c.deliver().expect(200);
    const firstEnd = (await c.row())!.currentPeriodEnd!;
    c.setStripe({ periodStart: NOW_S + MONTH_S, periodEnd: NOW_S + 2 * MONTH_S });
    await c.deliver().expect(200);
    const renewed = (await c.row())!;
    expect(renewed.currentPeriodEnd!.getTime()).toBeGreaterThan(firstEnd.getTime());
    expect((await c.access()).products.source).toMatchObject({ state: 'active', periodEndsAt: renewed.currentPeriodEnd!.toISOString() });
  });

  it('failed payments: past due keeps access while Stripe retries; recovery restores it; unpaid ends paid access (Hunts above Free pause, nothing deleted)', async () => {
    const c = await customer();
    c.setStripe({});
    await c.deliver().expect(200);
    for (const name of ['A', 'B']) {
      await prisma.hunt.create({ data: { userId: c.userId, name, query: name, status: 'LIVE', activatedAt: new Date(Date.now() - (name === 'A' ? 2 : 1) * 60_000) } });
    }
    c.setStripe({ status: 'past_due' });
    await c.deliver().expect(200);
    expect((await c.access()).products.source).toMatchObject({ state: 'past_due', hasAccess: true, paid: true });
    c.setStripe({ status: 'active' });
    await c.deliver().expect(200);
    expect((await c.access()).products.source.state).toBe('active');
    c.setStripe({ status: 'unpaid' });
    await c.deliver().expect(200);
    const after = await c.access();
    expect(after.products.source).toMatchObject({ state: 'expired', paid: false, plan: { code: 'free' } });
    expect(after.products.source.limits.activeHunts).toMatchObject({ limit: 1, used: 1 });
    expect(await prisma.hunt.count({ where: { userId: c.userId } })).toBe(2);
  });

  it('cancellation: scheduled -> access until the period end; ended -> Free', async () => {
    const c = await customer();
    c.setStripe({});
    await c.deliver().expect(200);
    c.setStripe({ cancelAtPeriodEnd: true, canceledAt: NOW_S });
    await c.deliver().expect(200);
    expect((await c.access()).products.source).toMatchObject({ state: 'active', paid: true, cancelsAtPeriodEnd: true });
    c.setStripe({ status: 'canceled' });
    await c.deliver('customer.subscription.deleted').expect(200);
    expect((await c.access()).products.source).toMatchObject({ state: 'canceled', paid: false, plan: { code: 'free' } });
  });

  it('webhook retries, duplicates and out-of-order delivery', async () => {
    const c = await customer();
    c.setStripe({});
    // Stripe unreachable while handling: 5xx, so Stripe retries; the retry succeeds.
    stripe.failNextRequest();
    await c.deliver('customer.subscription.created', `evt_${RUN}_retry`).expect(500);
    expect((await prisma.billingEvent.findFirstOrThrow({ where: { providerEventId: `evt_${RUN}_retry` } })).status).toBe('FAILED');
    expect((await c.deliver('customer.subscription.created', `evt_${RUN}_retry`).expect(200)).body.outcome).toBe('processed');
    // The same event again: acknowledged, no work.
    expect((await c.deliver('customer.subscription.created', `evt_${RUN}_retry`).expect(200)).body.outcome).toBe('duplicate');
    // Out of order: the subscription is canceled at Stripe; an older "updated" event arriving now still
    // results in the CURRENT state, because every event re-reads the subscription from Stripe.
    c.setStripe({ status: 'canceled' });
    await c.deliver('customer.subscription.deleted').expect(200);
    await c.deliver('customer.subscription.updated').expect(200); // stale event
    expect((await c.row())!.status).toBe('CANCELED');
  });

  it('account reconciliation: a lost webhook or drifted row is corrected from Stripe on sync', async () => {
    const c = await customer();
    c.setStripe({});
    await c.deliver().expect(200);
    // Stripe canceled it, but the webhook never arrived.
    c.setStripe({ status: 'canceled' });
    expect((await c.access()).products.source.state).toBe('active'); // stale until reconciled
    await c.post('/billing/sync').expect(200);
    expect((await c.access()).products.source).toMatchObject({ state: 'canceled', plan: { code: 'free' } });
    // Drift the other way (a row edited by hand): sync restores what Stripe says.
    c.setStripe({ status: 'active' });
    await prisma.subscription.update({ where: { providerSubscriptionId: c.subId }, data: { status: 'EXPIRED' } });
    await c.post('/billing/sync').expect(200);
    expect((await c.row())!.status).toBe('ACTIVE');
  });

  it('a web subscription updates the central entitlements every client reads', async () => {
    const c = await customer();
    c.setStripe({ price: PRICES.ultimate });
    await c.deliver().expect(200);
    const access = await c.access();
    expect(access.products.source).toMatchObject({ plan: { code: 'ultimate' }, limits: { activeHunts: { limit: 25 } } });
    const ent = (await request(app.getHttpServer()).get('/me/entitlements').set(DEV_AUTH_HEADER, `int-bill-${RUN}-${n}`).expect(200)).body;
    expect(ent.plan.code).toBe('ultimate');
  });
});
