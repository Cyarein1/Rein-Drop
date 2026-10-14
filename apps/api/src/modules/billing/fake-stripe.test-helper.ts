import Stripe from 'stripe';
import { StripeBillingProvider } from './stripe-billing.provider.js';

/**
 * A fake Stripe API for tests: the real `stripe` SDK talks to it through its fetch HTTP client, so
 * request encoding, idempotency keys and response parsing are the SDK's own. Holds customers,
 * subscriptions and prices in memory, and signs webhook payloads like Stripe (test secret).
 * Shapes follow API version 2026-09-30 (billing periods on subscription items).
 */
export const WEBHOOK_SECRET = 'whsec_test_reindrop_fake';
export const PRICES = { pro: 'price_pro_monthly', ultimate: 'price_ultimate_monthly' } as const;

export interface FakeSubscription {
  id: string;
  customer: string;
  status: string;
  price: string;
  periodStart: number;
  periodEnd: number;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: number | null;
  metadata?: Record<string, string>;
}

interface Call {
  method: string;
  path: string;
  body: URLSearchParams;
  idempotencyKey: string | null;
}

export function fakeStripe() {
  const calls: Call[] = [];
  const customers = new Map<string, { id: string; email: string; metadata: Record<string, string> }>();
  const byIdempotencyKey = new Map<string, string>();
  const subscriptions = new Map<string, FakeSubscription>();
  const prices = new Map<string, { id: string; active: boolean; unit_amount: number | null; currency: string; recurring: { interval: string; interval_count: number } | null }>([
    [PRICES.pro, { id: PRICES.pro, active: true, unit_amount: 19900, currency: 'zar', recurring: { interval: 'month', interval_count: 1 } }],
    [PRICES.ultimate, { id: PRICES.ultimate, active: true, unit_amount: 49900, currency: 'zar', recurring: { interval: 'month', interval_count: 1 } }],
  ]);
  let n = 0;
  let failNext = false;

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': `req_${++n}` } });
  const notFound = (what: string) => json(404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: `No such ${what}` } });

  const subscriptionObject = (s: FakeSubscription) => ({
    id: s.id,
    object: 'subscription',
    customer: s.customer,
    status: s.status,
    cancel_at_period_end: s.cancelAtPeriodEnd ?? false,
    canceled_at: s.canceledAt ?? null,
    metadata: s.metadata ?? {},
    items: {
      object: 'list',
      data: [{ id: `si_${s.id}`, object: 'subscription_item', price: prices.get(s.price) ?? { id: s.price }, current_period_start: s.periodStart, current_period_end: s.periodEnd }],
    },
  });

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const headers = new Headers(init?.headers);
    const call: Call = { method: init?.method ?? 'GET', path: url.pathname, body: new URLSearchParams(String(init?.body ?? '')), idempotencyKey: headers.get('idempotency-key') };
    calls.push(call);
    if (failNext) {
      failNext = false;
      return json(500, { error: { type: 'api_error', message: 'Stripe is having a bad day' } });
    }
    const [, , resource, id] = url.pathname.split('/'); // /v1/<resource>/<id>
    if (call.method === 'POST' && url.pathname === '/v1/customers') {
      const existing = call.idempotencyKey ? byIdempotencyKey.get(call.idempotencyKey) : undefined;
      const customer = existing ? customers.get(existing)! : { id: `cus_${++n}`, email: call.body.get('email') ?? '', metadata: { reindrop_user_id: call.body.get('metadata[reindrop_user_id]') ?? '' } };
      customers.set(customer.id, customer);
      if (call.idempotencyKey) byIdempotencyKey.set(call.idempotencyKey, customer.id);
      return json(200, { object: 'customer', ...customer });
    }
    if (call.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      return json(200, { id: `cs_test_${++n}`, object: 'checkout.session', mode: 'subscription', url: `https://checkout.stripe.com/c/pay/cs_test_${n}` });
    }
    if (call.method === 'POST' && url.pathname === '/v1/billing_portal/sessions') {
      return json(200, { id: `bps_${++n}`, object: 'billing_portal.session', url: `https://billing.stripe.com/p/session/test_${n}` });
    }
    if (call.method === 'GET' && url.pathname === '/v1/subscriptions') {
      const customer = url.searchParams.get('customer');
      const data = [...subscriptions.values()].filter((s) => s.customer === customer).map(subscriptionObject);
      return json(200, { object: 'list', data, has_more: false, url: '/v1/subscriptions' });
    }
    if (call.method === 'GET' && resource === 'subscriptions' && id) {
      const s = subscriptions.get(id);
      return s ? json(200, subscriptionObject(s)) : notFound(`subscription: '${id}'`);
    }
    if (call.method === 'GET' && resource === 'prices' && id) {
      const p = prices.get(id);
      return p ? json(200, { object: 'price', ...p }) : notFound(`price: '${id}'`);
    }
    return notFound(url.pathname);
  }) as typeof fetch;

  const stripe = new Stripe('sk_test_fake', { httpClient: Stripe.createFetchHttpClient(fetchImpl), maxNetworkRetries: 0 });

  /** A signed webhook delivery, exactly as Stripe sends it. */
  function webhook(event: { id: string; type: string; object: Record<string, unknown> }, o: { secret?: string; timestamp?: number } = {}) {
    const payload = JSON.stringify({ id: event.id, object: 'event', api_version: '2026-09-30.endive', type: event.type, data: { object: event.object } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: o.secret ?? WEBHOOK_SECRET, ...(o.timestamp ? { timestamp: o.timestamp } : {}) });
    return { payload, signature };
  }

  return {
    stripe,
    calls,
    customers,
    subscriptions,
    prices,
    webhook,
    subscriptionObject,
    provider: new StripeBillingProvider(stripe, WEBHOOK_SECRET),
    failNextRequest: () => {
      failNext = true;
    },
  };
}
