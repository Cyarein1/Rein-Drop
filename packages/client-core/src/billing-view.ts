import type { AccessResponse, BillingInfo, Plan } from '@rein-drop/contracts';
import { describeEntitlements, priceLabel } from './plan-gate.js';

/**
 * WEB "Plans & billing" view model (decision 0018: subscription management is web-only - the mobile
 * companion never uses this). Built only from server data: GET /me/access, GET /plans, GET /billing.
 */

type SourceAccess = AccessResponse['products']['source'];
export type StatusTone = 'neutral' | 'info' | 'action' | 'fresh' | 'profit' | 'loss';

const date = (iso: string | null, localeTag: string) => {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
};

export interface BillingStatusView {
  label: string;
  tone: StatusTone;
  /** Renewal / end / grace sentences, most important first. */
  lines: string[];
  /** Ask the person to update the payment method (portal). */
  paymentAttention: boolean;
}

export function billingStatusView(source: SourceAccess, localeTag: string): BillingStatusView {
  const end = date(source.periodEndsAt, localeTag);
  switch (source.state) {
    case 'active':
      return source.cancelsAtPeriodEnd
        ? { label: 'Cancels at period end', tone: 'fresh', lines: [`Your ${source.plan?.name} plan stays active until ${end ?? 'the end of the period'}, then you move to Free. Nothing is deleted.`], paymentAttention: false }
        : { label: 'Active', tone: 'profit', lines: end ? [`Renews on ${end}.`] : [], paymentAttention: false };
    case 'trialing':
      return { label: 'Trial', tone: 'info', lines: end ? [`Your trial runs until ${end}; the plan then renews.`] : [], paymentAttention: false };
    case 'past_due':
      return { label: 'Payment retrying', tone: 'fresh', lines: ['Your last payment didn’t go through. Stripe is retrying - you keep your plan meanwhile.', 'Update your payment method in Manage billing.'], paymentAttention: true };
    case 'grace_period':
      return { label: 'Grace period', tone: 'fresh', lines: [`Your paid access ended. You keep it until ${date(source.graceEndsAt, localeTag) ?? 'the grace period ends'}, then you move to Free.`], paymentAttention: true };
    case 'canceled':
      return { label: 'Free', tone: 'neutral', lines: ['Your paid plan was cancelled. You’re on Free; your Hunts and data are kept.'], paymentAttention: false };
    case 'expired':
      return { label: 'Free', tone: 'neutral', lines: ['Your paid plan ended. You’re on Free; your Hunts and data are kept.'], paymentAttention: false };
    case 'suspended':
      return { label: 'Suspended', tone: 'loss', lines: ['Access to this account is suspended. Your data is kept - contact support.'], paymentAttention: false };
    case 'free':
    case 'none':
      return { label: 'Free', tone: 'neutral', lines: [], paymentAttention: false };
  }
}

export type PlanAction =
  | { kind: 'current' }
  | { kind: 'subscribe' }
  | { kind: 'change' }
  | { kind: 'downgrade_to_free' }
  | { kind: 'unavailable'; reason: string };

export interface PlanCardView {
  plan: Plan;
  price: string;
  lines: string[];
  action: PlanAction;
}

/**
 * What each plan offers and what the person can do with it:
 * - On Free: subscribe to a priced paid plan (checkout).
 * - On a paid plan: change to another paid plan, or cancel to move to Free (portal).
 * - Plans without a price, development mode or a suspended account: not available.
 */
export function planCards(plans: readonly Plan[], source: SourceAccess, billing: BillingInfo, localeTag: string): PlanCardView[] {
  const currentCode = source.plan?.code ?? null;
  return plans.map((plan) => {
    const base = { plan, price: priceLabel(plan.pricing, localeTag), lines: describeEntitlements(plan.entitlements) };
    let action: PlanAction;
    if (plan.code === currentCode) action = { kind: 'current' };
    else if (source.state === 'suspended') action = { kind: 'unavailable', reason: 'Not available while access is suspended' };
    else if (plan.pricing.status === 'free') action = source.paid ? { kind: 'downgrade_to_free' } : { kind: 'current' };
    else if (plan.pricing.status === 'tbd') action = { kind: 'unavailable', reason: 'Not available yet' };
    else if (billing.mode !== 'stripe') action = { kind: 'unavailable', reason: 'Online billing isn’t set up here (development)' };
    else action = source.paid ? { kind: 'change' } : { kind: 'subscribe' };
    return { ...base, action };
  });
}

/** Banner after coming back from checkout: only what the SERVER now says counts. */
export function checkoutReturnView(result: string | undefined, source: SourceAccess): { tone: 'success' | 'info'; title: string; message: string } | null {
  if (result === 'success') {
    return source.paid
      ? { tone: 'success', title: `You’re on ${source.plan?.name ?? 'your new plan'}`, message: 'Payment confirmed. Your new limits apply on the web and in the app.' }
      : { tone: 'info', title: 'Confirming your payment', message: 'Stripe hasn’t confirmed it yet - this usually takes a few seconds. Use Refresh status in a moment.' };
  }
  if (result === 'cancelled') return { tone: 'info', title: 'Checkout cancelled', message: 'Nothing was charged and your plan didn’t change.' };
  return null;
}
