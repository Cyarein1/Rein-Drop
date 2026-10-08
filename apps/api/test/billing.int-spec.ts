/**
 * Web billing against a REAL API + PostgreSQL, with Stripe replaced by a fake Stripe API that the
 * real Stripe SDK talks to, and webhooks signed exactly like Stripe's. Checkpoint (Build Prompt 39):
 * subscribe / change / cancel events produce the right Subscription and entitlements - only via
 * verified webhooks, idempotently, whatever the delivery order. Free stays free.
 * Run with `pnpm --filter api test:int`. Creates a throwaway user, deletes it afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEV_AUTH_HEADER, type BillingInfo, type EntitlementEvaluation, type Plan } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { loadApiConfig } from './../src/config/api-config.js';
import { BILLING_PROVIDER } from './../src/modules/billing/billing-provider.js';
import { fakeStripe, PRICES } from './../src/modules/billing/fake-stripe.test-helper.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const SUBJECT = `int-test-${randomUUID().slice(0, 8)}`;
const RUN = randomUUID().slice(0, 8);
const NOW_S = Math.floor(Date.now() / 1000);
const MONTH_S = 30 * 86_400;

describe('Web billing with Stripe (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let userId: string;
  const stripe = fakeStripe();
  const evt = (name: string) => `evt_${RUN}_${name}`;
  const subId = `sub_${RUN}`;

  const as = (req: request.Test) => req.set(DEV_AUTH_HEADER, SUBJECT);
  const get = async <T>(path: string) => (await as(request(app.getHttpServer()).get(path)).expect(200)).body as T;
  const post = (path: string, body: object = {}) => as(request(app.getHttpServer()).post(path)).send(body);
  const deliver = (event: { id: string; type: string; object: Record<string, unknown> }, o?: { secret?: string }) => {
    const { payload, signature } = stripe.webhook(event, o);
    return request(app.getHttpServer()).post('/billing/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', signature).send(payload);
  };
  const subscriptionEvent = (id: string, type = 'customer.subscription.updated') => ({ id: evt(id), type, object: stripe.subscriptionObject(stripe.subscriptions.get(subId)!) });
  const entitlements = () => get<EntitlementEvaluation>('/me/entitlements');

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    userId = (await prisma.user.create({ data: { email: `${SUBJECT}@reindrop.test`, authProvider: 'dev', authSubject: SUBJECT } })).id;
    const config = loadApiConfig({
      NODE_ENV: 'test',
      DATABASE_URL,
      BILLING_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_WEBHOOK_SECRET: 'whsec_unused_by_the_fake',
      STRIPE_PRICE_IDS: `pro=${PRICES.pro},ultimate=${PRICES.ultimate}`,
      WEB_APP_URL: 'http://localhost:3000',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
      .overrideProvider(BILLING_PROVIDER)
      .useValue(stripe.provider)
      .compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (prisma) {
      await prisma.billingEvent.deleteMany({ where: { providerEventId: { startsWith: `evt_${RUN}_` } } });
      if (userId) await prisma.user.delete({ where: { id: userId } }); // subscriptions, billing customer
      await prisma.$disconnect();
    }
  });

  it('shows Stripe prices for paid plans and keeps Free free; Free needs no card', async () => {
    const plans = (await get<{ items: Plan[] }>('/plans')).items;
    expect(plans.find((p) => p.code === 'free')?.pricing).toEqual({ status: 'free' });
    expect(plans.find((p) => p.code === 'pro')?.pricing).toEqual({ status: 'priced', amount: { amountMinor: 19900, currency: 'ZAR' }, interval: 'month', intervalCount: 1 });
    expect(await get<BillingInfo>('/billing')).toEqual({ mode: 'stripe', canManage: false });

    const free = await post('/billing/free').expect(200);
    expect(free.body).toMatchObject({ subscription: { planCode: 'free', provider: 'free', status: 'ACTIVE', isDevelopment: false } });
    expect((await entitlements()).plan.code).toBe('free');
  });

  it('starts a hosted checkout, but grants nothing until Stripe confirms by webhook', async () => {
    const res = await post('/billing/checkout', { planCode: 'pro', returnPath: '/hunts/abc/start' }).expect(200);
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const checkout = Object.fromEntries(stripe.calls.find((c) => c.path === '/v1/checkout/sessions')!.body);
    expect(checkout).toMatchObject({ success_url: 'http://localhost:3000/hunts/abc/start?checkout=success', cancel_url: 'http://localhost:3000/hunts/abc/start?checkout=cancelled', client_reference_id: userId });
    const customer = await prisma.billingCustomer.findUniqueOrThrow({ where: { provider_userId: { provider: 'stripe', userId } } });
    expect(checkout.customer).toBe(customer.providerCustomerId);
    // A second checkout reuses the same customer.
    await post('/billing/checkout', { planCode: 'pro', returnPath: '/settings' }).expect(200);
    expect(await prisma.billingCustomer.count({ where: { userId } })).toBe(1);
    expect((await entitlements()).plan.code).toBe('free');
    // Nonsense requests are refused.
    await post('/billing/checkout', { planCode: 'free', returnPath: '/settings' }).expect(400);
    await post('/billing/checkout', { planCode: 'pro', returnPath: 'https://evil.example' }).expect(400);
    await post('/billing/checkout', { planCode: 'nope', returnPath: '/settings' }).expect(404);

    // The customer completes payment at Stripe: subscription + checkout.session.completed.
    stripe.subscriptions.set(subId, { id: subId, customer: customer.providerCustomerId, status: 'active', price: PRICES.pro, periodStart: NOW_S, periodEnd: NOW_S + MONTH_S, metadata: { reindrop_user_id: userId } });
    const done = await deliver({ id: evt('checkout'), type: 'checkout.session.completed', object: { object: 'checkout.session', mode: 'subscription', subscription: subId } }).expect(200);
    expect(done.body).toEqual({ received: true, outcome: 'processed' });

    const e = await entitlements();
    expect(e.plan.code).toBe('pro');
    expect(e.subscription).toMatchObject({ planCode: 'pro', provider: 'stripe', status: 'ACTIVE', cancelAtPeriodEnd: false, currentPeriodEnd: new Date((NOW_S + MONTH_S) * 1000).toISOString() });
    // The Free choice was replaced (one current subscription).
    expect(await prisma.subscription.count({ where: { userId, status: 'ACTIVE' } })).toBe(1);
    expect(await get<BillingInfo>('/billing')).toEqual({ mode: 'stripe', canManage: true });
  });

  it('processes each event once: duplicates and the overlapping subscription.created are harmless', async () => {
    const again = await deliver({ id: evt('checkout'), type: 'checkout.session.completed', object: { object: 'checkout.session', mode: 'subscription', subscription: subId } }).expect(200);
    expect(again.body.outcome).toBe('duplicate');
    expect(await prisma.billingEvent.findUniqueOrThrow({ where: { provider_providerEventId: { provider: 'stripe', providerEventId: evt('checkout') } } })).toMatchObject({ status: 'PROCESSED', attempts: 1 });
    await deliver(subscriptionEvent('created', 'customer.subscription.created')).expect(200);
    expect(await prisma.subscription.count({ where: { userId, provider: 'stripe' } })).toBe(1);
  });

  it('a plan change in the portal moves the entitlements; an older event arriving late changes nothing', async () => {
    const older = subscriptionEvent('older'); // built while still on Pro, delivered after the change
    stripe.subscriptions.get(subId)!.price = PRICES.ultimate;
    await deliver(subscriptionEvent('changed')).expect(200);
    expect((await entitlements()).plan.code).toBe('ultimate');
    await deliver(older).expect(200);
    // The subscription is re-read from Stripe, so a stale payload can't roll the plan back.
    expect((await entitlements()).plan.code).toBe('ultimate');
  });

  it('refuses a second checkout or a Free choice while paid; the portal manages it instead', async () => {
    await post('/billing/checkout', { planCode: 'pro', returnPath: '/settings' }).expect(409);
    await post('/billing/free').expect(409);
    const portal = await post('/billing/portal', { returnPath: '/settings', flow: 'change_plan' }).expect(200);
    expect(portal.body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
    expect(Object.fromEntries(stripe.calls.at(-1)!.body)).toMatchObject({ 'flow_data[type]': 'subscription_update', 'flow_data[subscription_update][subscription]': subId });
  });

  it('keeps access through a failed renewal (past due) and until a scheduled cancellation takes effect', async () => {
    stripe.subscriptions.get(subId)!.status = 'past_due';
    await deliver(subscriptionEvent('past-due')).expect(200);
    expect((await entitlements()).subscription).toMatchObject({ status: 'PAST_DUE', planCode: 'ultimate' });

    Object.assign(stripe.subscriptions.get(subId)!, { status: 'active', cancelAtPeriodEnd: true, canceledAt: NOW_S });
    await deliver(subscriptionEvent('cancel-scheduled')).expect(200);
    const e = await entitlements();
    expect(e.plan.code).toBe('ultimate');
    expect(e.subscription).toMatchObject({ cancelAtPeriodEnd: true });
  });

  it('ignores events Rein Drop has no use for, and rejects unsigned / forged deliveries', async () => {
    expect((await deliver({ id: evt('invoice'), type: 'invoice.created', object: { object: 'invoice', id: 'in_1' } }).expect(200)).body.outcome).toBe('ignored');
    // A subscription of someone who isn't a Rein Drop customer (e.g. `stripe trigger` fixtures).
    stripe.subscriptions.set(`${subId}_foreign`, { id: `${subId}_foreign`, customer: 'cus_someone_else', status: 'active', price: PRICES.pro, periodStart: NOW_S, periodEnd: NOW_S + MONTH_S });
    const foreign = { id: evt('foreign'), type: 'customer.subscription.created', object: stripe.subscriptionObject(stripe.subscriptions.get(`${subId}_foreign`)!) };
    expect((await deliver(foreign).expect(200)).body.outcome).toBe('ignored');
    expect(await prisma.subscription.count({ where: { providerSubscriptionId: `${subId}_foreign` } })).toBe(0);
    await deliver({ id: evt('forged'), type: 'customer.subscription.deleted', object: { object: 'subscription', id: subId } }, { secret: 'whsec_attacker' }).expect(400);
    await request(app.getHttpServer()).post('/billing/webhooks/stripe').set('content-type', 'application/json').send('{}').expect(400);
    expect(await prisma.billingEvent.count({ where: { providerEventId: evt('forged') } })).toBe(0);
    expect((await entitlements()).plan.code).toBe('ultimate');
  });

  it('a failed event is retried by Stripe and then processed (e.g. a price missing from the config)', async () => {
    stripe.subscriptions.get(subId)!.price = 'price_not_configured';
    await deliver(subscriptionEvent('unknown-price')).expect(500);
    expect(await prisma.billingEvent.findUniqueOrThrow({ where: { provider_providerEventId: { provider: 'stripe', providerEventId: evt('unknown-price') } } })).toMatchObject({ status: 'FAILED' });
    expect((await entitlements()).plan.code).toBe('ultimate'); // unchanged

    stripe.subscriptions.get(subId)!.price = PRICES.ultimate; // config / data fixed; Stripe redelivers the same event
    await deliver(subscriptionEvent('unknown-price')).expect(200);
    expect(await prisma.billingEvent.findUniqueOrThrow({ where: { provider_providerEventId: { provider: 'stripe', providerEventId: evt('unknown-price') } } })).toMatchObject({ status: 'PROCESSED', attempts: 2 });
  });

  it('when the subscription ends, the user is back on Free, live Hunts above its limit pause, and Free can be chosen again', async () => {
    // Three Hunts went live while paid (no marketplaces, so a running worker never polls them).
    const live = async (name: string, minutesAgo: number) =>
      (await prisma.hunt.create({ data: { userId, name, query: name, status: 'LIVE', activatedAt: new Date(Date.now() - minutesAgo * 60_000) } })).id;
    const oldest = await live('Oldest', 300);
    const middle = await live('Middle', 200);
    const newest = await live('Newest', 100);

    Object.assign(stripe.subscriptions.get(subId)!, { status: 'canceled', cancelAtPeriodEnd: false });
    await deliver(subscriptionEvent('deleted', 'customer.subscription.deleted')).expect(200);
    const e = await entitlements();
    expect(e.subscription).toBeNull();
    expect(e.plan.code).toBe('free');

    // Free allows 1 live Hunt: the longest-running stays live, the others pause (a system action).
    const statuses = Object.fromEntries((await prisma.hunt.findMany({ where: { userId }, select: { id: true, status: true } })).map((h) => [h.id, h.status]));
    expect([statuses[oldest], statuses[middle], statuses[newest]]).toEqual(['LIVE', 'PAUSED', 'PAUSED']);
    const event = await prisma.huntEvent.findFirstOrThrow({ where: { huntId: newest, type: 'PAUSED' } });
    expect(event).toMatchObject({ actorUserId: null, changes: { reason: 'plan_limit' } });
    expect(e.usage.activeHunts).toBe(1);
    // Redelivery changes nothing more.
    await deliver(subscriptionEvent('deleted', 'customer.subscription.deleted')).expect(200);
    expect(await prisma.hunt.count({ where: { userId, status: 'LIVE' } })).toBe(1);
    await post('/billing/free').expect(200);
    expect((await entitlements()).subscription).toMatchObject({ planCode: 'free', provider: 'free' });
  });
});
