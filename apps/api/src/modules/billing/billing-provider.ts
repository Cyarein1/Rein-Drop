import type { PlanPricing } from '@rein-drop/contracts';

/**
 * The web billing boundary (decision 0014). Provider objects stop here: the rest of the API sees
 * provider-neutral subscriptions and events, and entitlements come from Rein Drop's own tables.
 * Native store billing (App Store / Google Play) is not built - it would be another provider.
 */

/** Rein Drop SubscriptionStatus values a provider subscription maps to. */
export type BillingStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' | 'INCOMPLETE' | 'PAUSED';

export interface ProviderSubscription {
  id: string;
  customerId: string;
  status: BillingStatus;
  /** The (single) price the subscription is on. */
  priceId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  /** Rein Drop user id we attached at checkout (fallback when the customer isn't known yet). */
  userId: string | null;
}

/** A verified webhook event, reduced to what Rein Drop acts on. */
export interface BillingWebhookEvent {
  id: string;
  type: string;
  /** The provider subscription to re-sync; null = nothing for Rein Drop to do. */
  subscriptionId: string | null;
}

export class WebhookSignatureError extends Error {}

export interface BillingProvider {
  readonly id: 'stripe';
  /** The provider customer for this user (created once; idempotent per user). */
  createCustomer(user: { id: string; email: string }): Promise<string>;
  /** Hosted checkout for one plan price; returns the URL to send the browser to. */
  createCheckout(args: { customerId: string; priceId: string; userId: string; planCode: string; successUrl: string; cancelUrl: string }): Promise<string>;
  /** Hosted self-service portal (payment method, invoices, change plan, cancel). */
  createPortal(args: { customerId: string; returnUrl: string; flow: 'manage' | 'change_plan' | 'cancel'; subscriptionId: string | null }): Promise<string>;
  /** Verifies the signature over the raw body; throws WebhookSignatureError when it doesn't match. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): BillingWebhookEvent;
  /** The subscription as the provider sees it NOW (null when it no longer exists). */
  getSubscription(id: string): Promise<ProviderSubscription | null>;
  /** Current prices for these price ids (missing / inactive ones are left out). */
  getPrices(priceIds: readonly string[]): Promise<Map<string, Extract<PlanPricing, { status: 'priced' }>>>;
}

/** Injection token: the active BillingProvider, or null in development-fake mode. */
export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
