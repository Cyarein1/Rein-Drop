import { billingReturnPathSchema } from '@rein-drop/contracts';
import { parsePriceIds, resolveBillingConfig } from './billing-config.js';
import { WebhookSignatureError } from './billing-provider.js';
import { fakeStripe, PRICES, WEBHOOK_SECRET } from './fake-stripe.test-helper.js';
import { mapStripeStatus } from './stripe-billing.provider.js';

const NOW_S = 1_790_000_000;

describe('billing config', () => {
  const stripeEnv = {
    BILLING_PROVIDER: 'stripe' as const,
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_abc',
    STRIPE_PRICE_IDS: ' pro=price_1, ultimate=price_2 ',
    WEB_APP_URL: 'https://app.reindrop.example/',
  };

  it('maps plan codes to Stripe prices from configuration (prices never in code)', () => {
    expect(parsePriceIds('pro=price_1,ultimate=price_2')).toEqual({ priceIds: { pro: 'price_1', ultimate: 'price_2' } });
    expect(parsePriceIds('pro=19.99')).toEqual({ problem: 'STRIPE_PRICE_IDS: "pro=19.99" must look like plan=price_...' });
    expect(parsePriceIds('pro=price_1,pro=price_2')).toEqual({ problem: 'STRIPE_PRICE_IDS: plan "pro" is listed twice' });
    expect(parsePriceIds('pro=price_1,ultimate=price_1')).toEqual({ problem: 'STRIPE_PRICE_IDS: price_1 is used by two plans' });
  });

  it('uses the development fake locally and Stripe in production (dev refused there)', () => {
    expect(resolveBillingConfig({}, 'development')).toEqual({ billing: { provider: 'dev' }, problems: [] });
    expect(resolveBillingConfig({ BILLING_PROVIDER: 'dev' }, 'production').problems).toEqual([
      'BILLING_PROVIDER: "dev" is a development-only fake checkout, not allowed when NODE_ENV=production',
    ]);
    expect(resolveBillingConfig({}, 'production').problems).toEqual([
      'STRIPE_SECRET_KEY: required when BILLING_PROVIDER=stripe',
      'STRIPE_WEBHOOK_SECRET: required when BILLING_PROVIDER=stripe',
      'STRIPE_PRICE_IDS: required when BILLING_PROVIDER=stripe',
      'WEB_APP_URL: required when BILLING_PROVIDER=stripe',
    ]);
    expect(resolveBillingConfig(stripeEnv, 'production')).toEqual({
      billing: { provider: 'stripe', secretKey: 'sk_test_123', webhookSecret: 'whsec_abc', priceIds: { pro: 'price_1', ultimate: 'price_2' }, webAppUrl: 'https://app.reindrop.example' },
      problems: [],
    });
  });

  it('only accepts same-site return paths (no open redirects through checkout)', () => {
    for (const ok of ['/settings', '/hunts/abc/start?x=1']) expect(billingReturnPathSchema.safeParse(ok).success).toBe(true);
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'settings', '/a b']) expect(billingReturnPathSchema.safeParse(bad).success).toBe(false);
  });
});

describe('StripeBillingProvider', () => {
  it('maps every Stripe status; only paid-up states will be entitled', () => {
    expect(['trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused', 'something_new'].map(mapStripeStatus)).toEqual([
      'TRIALING',
      'ACTIVE',
      'PAST_DUE',
      'PAST_DUE',
      'CANCELED',
      'INCOMPLETE',
      'EXPIRED',
      'PAUSED',
      'INCOMPLETE',
    ]);
  });

  it('creates one customer per user (idempotency key), then a subscription checkout for that price', async () => {
    const f = fakeStripe();
    const a = await f.provider.createCustomer({ id: 'u1', email: 'thandi@example.com' });
    expect(await f.provider.createCustomer({ id: 'u1', email: 'thandi@example.com' })).toBe(a);
    expect(f.calls[0]!.idempotencyKey).toBe('reindrop-customer-u1');
    const url = await f.provider.createCheckout({ customerId: a, priceId: PRICES.pro, userId: 'u1', planCode: 'pro', successUrl: 'https://app/x?checkout=success', cancelUrl: 'https://app/x?checkout=cancelled' });
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const body = Object.fromEntries(f.calls.at(-1)!.body);
    expect(body).toMatchObject({
      mode: 'subscription',
      customer: a,
      client_reference_id: 'u1',
      'line_items[0][price]': PRICES.pro,
      'line_items[0][quantity]': '1',
      'subscription_data[metadata][reindrop_user_id]': 'u1',
      'subscription_data[metadata][reindrop_plan]': 'pro',
      success_url: 'https://app/x?checkout=success',
    });
  });

  it('opens the portal, deep-linking to change plan or cancel', async () => {
    const f = fakeStripe();
    await f.provider.createPortal({ customerId: 'cus_1', returnUrl: 'https://app/settings', flow: 'cancel', subscriptionId: 'sub_1' });
    expect(Object.fromEntries(f.calls.at(-1)!.body)).toMatchObject({ customer: 'cus_1', return_url: 'https://app/settings', 'flow_data[type]': 'subscription_cancel', 'flow_data[subscription_cancel][subscription]': 'sub_1' });
    await f.provider.createPortal({ customerId: 'cus_1', returnUrl: 'https://app/settings', flow: 'manage', subscriptionId: 'sub_1' });
    expect(f.calls.at(-1)!.body.has('flow_data[type]')).toBe(false);
  });

  it('reads a subscription with its period from the subscription item', async () => {
    const f = fakeStripe();
    f.subscriptions.set('sub_1', { id: 'sub_1', customer: 'cus_1', status: 'active', price: PRICES.pro, periodStart: NOW_S, periodEnd: NOW_S + 30 * 86400, cancelAtPeriodEnd: true, metadata: { reindrop_user_id: 'u1' } });
    expect(await f.provider.getSubscription('sub_1')).toEqual({
      id: 'sub_1',
      customerId: 'cus_1',
      status: 'ACTIVE',
      priceId: PRICES.pro,
      currentPeriodStart: new Date(NOW_S * 1000),
      currentPeriodEnd: new Date((NOW_S + 30 * 86400) * 1000),
      cancelAtPeriodEnd: true,
      canceledAt: null,
      userId: 'u1',
    });
    expect(await f.provider.getSubscription('sub_missing')).toBeNull();
  });

  it('reads current prices (inactive or non-recurring ones are left out)', async () => {
    const f = fakeStripe();
    f.prices.set('price_old', { id: 'price_old', active: false, unit_amount: 100, currency: 'zar', recurring: { interval: 'month', interval_count: 1 } });
    const prices = await f.provider.getPrices([PRICES.pro, 'price_old']);
    expect([...prices.entries()]).toEqual([[PRICES.pro, { status: 'priced', amount: { amountMinor: 19900, currency: 'ZAR' }, interval: 'month', intervalCount: 1 }]]);
  });

  it('verifies webhook signatures and extracts the subscription to re-sync', () => {
    const f = fakeStripe();
    const sub = f.webhook({ id: 'evt_1', type: 'customer.subscription.updated', object: { object: 'subscription', id: 'sub_1' } });
    expect(f.provider.parseWebhook(Buffer.from(sub.payload), sub.signature)).toEqual({ id: 'evt_1', type: 'customer.subscription.updated', subscriptionId: 'sub_1' });
    const checkout = f.webhook({ id: 'evt_2', type: 'checkout.session.completed', object: { object: 'checkout.session', mode: 'subscription', subscription: 'sub_9' } });
    expect(f.provider.parseWebhook(Buffer.from(checkout.payload), checkout.signature).subscriptionId).toBe('sub_9');
    const other = f.webhook({ id: 'evt_3', type: 'invoice.created', object: { object: 'invoice', id: 'in_1' } });
    expect(f.provider.parseWebhook(Buffer.from(other.payload), other.signature).subscriptionId).toBeNull();
  });

  it('rejects missing, wrong-secret, tampered and replayed (old) signatures', () => {
    const f = fakeStripe();
    const good = f.webhook({ id: 'evt_1', type: 'customer.subscription.updated', object: { object: 'subscription', id: 'sub_1' } });
    const parse = (payload: string, signature: string | undefined) => () => f.provider.parseWebhook(Buffer.from(payload), signature);
    expect(parse(good.payload, undefined)).toThrow(WebhookSignatureError);
    expect(parse(good.payload.replace('sub_1', 'sub_2'), good.signature)).toThrow(WebhookSignatureError);
    const forged = f.webhook({ id: 'evt_1', type: 'customer.subscription.updated', object: { object: 'subscription', id: 'sub_1' } }, { secret: 'whsec_attacker' });
    expect(parse(forged.payload, forged.signature)).toThrow(WebhookSignatureError);
    const replay = f.webhook({ id: 'evt_1', type: 'customer.subscription.updated', object: { object: 'subscription', id: 'sub_1' } }, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect(parse(replay.payload, replay.signature)).toThrow(WebhookSignatureError);
    expect(WEBHOOK_SECRET).toMatch(/^whsec_/);
  });
});
