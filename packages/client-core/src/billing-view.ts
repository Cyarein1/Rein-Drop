import type { AccessResponse, BillingInfo, Plan } from '@rein-drop/contracts';
import { translator, type Translator } from '@rein-drop/i18n';
import { describeEntitlements, priceLabel } from './plan-gate.js';

const EN = translator('en');

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

export function billingStatusView(source: SourceAccess, localeTag: string, t: Translator = EN): BillingStatusView {
  const end = date(source.periodEndsAt, localeTag);
  switch (source.state) {
    case 'active': {
      const plan = source.plan?.name ?? '';
      return source.cancelsAtPeriodEnd
        ? {
            label: t('billing.statusCancelsAtEnd'),
            tone: 'fresh',
            lines: [end ? t('billing.cancelsLine', { plan, date: end }) : t('billing.cancelsLineNoDate', { plan })],
            paymentAttention: false,
          }
        : { label: t('billing.statusActive'), tone: 'profit', lines: end ? [t('billing.renewsOn', { date: end })] : [], paymentAttention: false };
    }
    case 'trialing':
      return { label: t('billing.statusTrial'), tone: 'info', lines: end ? [t('billing.trialUntil', { date: end })] : [], paymentAttention: false };
    case 'past_due':
      return { label: t('billing.statusPaymentRetrying'), tone: 'fresh', lines: [t('billing.pastDueLine'), t('billing.pastDueAction')], paymentAttention: true };
    case 'grace_period': {
      const graceEnd = date(source.graceEndsAt, localeTag);
      return {
        label: t('billing.statusGrace'),
        tone: 'fresh',
        lines: [graceEnd ? t('billing.graceLine', { date: graceEnd }) : t('billing.graceLineNoDate')],
        paymentAttention: true,
      };
    }
    case 'canceled':
      return { label: t('billing.statusFree'), tone: 'neutral', lines: [t('billing.canceledLine')], paymentAttention: false };
    case 'expired':
      return { label: t('billing.statusFree'), tone: 'neutral', lines: [t('billing.expiredLine')], paymentAttention: false };
    case 'suspended':
      return { label: t('billing.statusSuspended'), tone: 'loss', lines: [t('billing.suspendedLine')], paymentAttention: false };
    case 'free':
    case 'none':
      return { label: t('billing.statusFree'), tone: 'neutral', lines: [], paymentAttention: false };
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
export function planCards(plans: readonly Plan[], source: SourceAccess, billing: BillingInfo, localeTag: string, t: Translator = EN): PlanCardView[] {
  const currentCode = source.plan?.code ?? null;
  return plans.map((plan) => {
    const base = { plan, price: priceLabel(plan.pricing, localeTag, t), lines: describeEntitlements(plan.entitlements, t) };
    let action: PlanAction;
    if (plan.code === currentCode) action = { kind: 'current' };
    else if (source.state === 'suspended') action = { kind: 'unavailable', reason: t('billing.unavailableSuspended') };
    else if (plan.pricing.status === 'free') action = source.paid ? { kind: 'downgrade_to_free' } : { kind: 'current' };
    else if (plan.pricing.status === 'tbd') action = { kind: 'unavailable', reason: t('billing.unavailableYet') };
    else if (billing.mode !== 'stripe') action = { kind: 'unavailable', reason: t('billing.unavailableDevelopment') };
    else action = source.paid ? { kind: 'change' } : { kind: 'subscribe' };
    return { ...base, action };
  });
}

/** Banner after coming back from checkout: only what the SERVER now says counts. */
export function checkoutReturnView(
  result: string | undefined,
  source: SourceAccess,
  t: Translator = EN,
): { tone: 'success' | 'info'; title: string; message: string } | null {
  if (result === 'success') {
    return source.paid
      ? {
          tone: 'success',
          title: source.plan?.name ? t('billing.checkoutSuccessTitle', { plan: source.plan.name }) : t('billing.checkoutSuccessTitleUnknown'),
          message: t('billing.checkoutSuccessMessage'),
        }
      : { tone: 'info', title: t('billing.checkoutPendingTitle'), message: t('billing.checkoutPendingMessage') };
  }
  if (result === 'cancelled') return { tone: 'info', title: t('billing.checkoutCancelledTitle'), message: t('billing.checkoutCancelledMessage') };
  return null;
}
