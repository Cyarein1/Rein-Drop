import Stripe from 'stripe';
import { BILLING_INTERVALS } from '@rein-drop/contracts';
import { WebhookSignatureError, type BillingProvider, type BillingStatus, type BillingWebhookEvent, type ProviderSubscription } from './billing-provider.js';

/**
 * Stripe behind BillingProvider: Checkout (mode subscription), the Customer Portal, signed
 * webhooks, and subscriptions re-read from the API (pinned to the SDK's API version, 2026-09-30).
 * In that version billing periods live on subscription items, not the subscription.
 */
const STATUS: Record<string, BillingStatus> = {
  trialing: 'TRIALING',
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  // Retries exhausted, invoices left open: treat like past due (not paid), never as active.
  unpaid: 'PAST_DUE',
  canceled: 'CANCELED',
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'EXPIRED',
  paused: 'PAUSED',
};

/** Stripe status -> Rein Drop status (unknown future statuses are not entitled). */
export function mapStripeStatus(status: string): BillingStatus {
  return STATUS[status] ?? 'INCOMPLETE';
}

/** Events that can change a subscription; everything else is recorded and ignored. */
const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

const date = (seconds: number | null | undefined) => (typeof seconds === 'number' ? new Date(seconds * 1000) : null);
const idOf = (value: string | { id: string } | null | undefined) => (typeof value === 'string' ? value : (value?.id ?? null));

export class StripeBillingProvider implements BillingProvider {
  readonly id = 'stripe' as const;

  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: string,
  ) {}

  static create(secretKey: string, webhookSecret: string): StripeBillingProvider {
    return new StripeBillingProvider(new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: 'Rein Drop' } }), webhookSecret);
  }

  async createCustomer(user: { id: string; email: string }): Promise<string> {
    const customer = await this.stripe.customers.create(
      { email: user.email, metadata: { reindrop_user_id: user.id } },
      // A retried request (double click, network retry) returns the same customer.
      { idempotencyKey: `reindrop-customer-${user.id}` },
    );
    return customer.id;
  }

  async createCheckout(args: { customerId: string; priceId: string; userId: string; planCode: string; successUrl: string; cancelUrl: string }): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: args.customerId,
      client_reference_id: args.userId,
      line_items: [{ price: args.priceId, quantity: 1 }],
      subscription_data: { metadata: { reindrop_user_id: args.userId, reindrop_plan: args.planCode } },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    });
    if (!session.url) throw new Error('Stripe returned a checkout session without a URL');
    return session.url;
  }

  async createPortal(args: { customerId: string; returnUrl: string; flow: 'manage' | 'change_plan' | 'cancel'; subscriptionId: string | null }): Promise<string> {
    const flow =
      args.flow === 'change_plan' && args.subscriptionId
        ? { type: 'subscription_update' as const, subscription_update: { subscription: args.subscriptionId } }
        : args.flow === 'cancel' && args.subscriptionId
          ? { type: 'subscription_cancel' as const, subscription_cancel: { subscription: args.subscriptionId } }
          : undefined;
    const session = await this.stripe.billingPortal.sessions.create({ customer: args.customerId, return_url: args.returnUrl, ...(flow ? { flow_data: flow } : {}) });
    return session.url;
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): BillingWebhookEvent {
    if (!signature) throw new WebhookSignatureError('Missing Stripe-Signature header');
    let event: Stripe.Event;
    try {
      // Checks the HMAC and the timestamp (default 5-minute tolerance against replays).
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (err) {
      throw new WebhookSignatureError(err instanceof Error ? err.message : 'Invalid signature');
    }
    const object = event.data.object as { object?: string; id?: string; mode?: string; subscription?: string | { id: string } | null };
    let subscriptionId: string | null = null;
    if (SUBSCRIPTION_EVENTS.has(event.type) && object.object === 'subscription') subscriptionId = object.id ?? null;
    if (event.type === 'checkout.session.completed' && object.mode === 'subscription') subscriptionId = idOf(object.subscription);
    return { id: event.id, type: event.type, subscriptionId };
  }

  async getSubscription(id: string): Promise<ProviderSubscription | null> {
    let sub: Stripe.Subscription;
    try {
      sub = await this.stripe.subscriptions.retrieve(id);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeInvalidRequestError && err.statusCode === 404) return null;
      throw err;
    }
    const item = sub.items.data[0];
    return {
      id: sub.id,
      customerId: idOf(sub.customer)!,
      status: mapStripeStatus(sub.status),
      priceId: item?.price.id ?? null,
      currentPeriodStart: date(item?.current_period_start),
      currentPeriodEnd: date(item?.current_period_end),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAt: date(sub.canceled_at),
      userId: sub.metadata?.reindrop_user_id ?? null,
    };
  }

  async getPrices(priceIds: readonly string[]) {
    const result = new Map<string, { status: 'priced'; amount: { amountMinor: number; currency: string }; interval: (typeof BILLING_INTERVALS)[number]; intervalCount: number }>();
    await Promise.all(
      priceIds.map(async (id) => {
        const price = await this.stripe.prices.retrieve(id);
        const interval = price.recurring?.interval;
        if (!price.active || price.unit_amount === null || !interval || !(BILLING_INTERVALS as readonly string[]).includes(interval)) return;
        result.set(id, {
          status: 'priced',
          amount: { amountMinor: price.unit_amount, currency: price.currency.toUpperCase() },
          interval: interval as (typeof BILLING_INTERVALS)[number],
          intervalCount: price.recurring?.interval_count ?? 1,
        });
      }),
    );
    return result;
  }
}
