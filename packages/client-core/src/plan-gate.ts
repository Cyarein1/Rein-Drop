import {
  evaluateActivation,
  type ActivationBlockReason,
  type Hunt,
  type Plan,
  type PlanEntitlements,
  type PlanPricing,
} from '@rein-drop/contracts';
import { translator, type Translator } from '@rein-drop/i18n';
import { formatMoney } from './money.js';

/**
 * Plan gate view model (App Flow Blueprint section 6), built ONLY from server data
 * (`GET /plans`, `GET /me/entitlements`) - no plan names, limits or prices are assumed here.
 */

const MARKETPLACE_LABEL: Record<string, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };
const EN = translator('en');

/** Human-readable lines for what a plan allows. */
export function describeEntitlements(e: PlanEntitlements, t: Translator = EN): string[] {
  const hunts = e.activeHunts.limit;
  const markets = e.marketplaces.map((m) => MARKETPLACE_LABEL[m] ?? m);
  return [
    hunts === null ? t('billing.entLiveUnlimited') : t('billing.entLive', { count: hunts }),
    e.savedHunts.limit === null ? t('billing.entSavedUnlimited') : t('billing.entSaved', { count: e.savedHunts.limit }),
    markets.length === 0
      ? t('billing.entNoMarketplaces')
      : markets.length === 1
        ? markets[0]!
        : t('billing.listAnd', { items: markets.slice(0, -1).join(', '), last: markets.at(-1) }),
    e.hotHunts.available
      ? e.hotHunts.limit === null
        ? t('billing.entHotHunts')
        : t('billing.entHotHuntsLimit', { limit: e.hotHunts.limit })
      : t('billing.entHotHuntsLater'),
    t('billing.entPriority', { priority: e.monitoringPriority }),
    e.analyticsHistoryDays === null ? t('billing.entAnalyticsFull') : t('billing.entAnalyticsDays', { days: e.analyticsHistoryDays }),
    t('billing.entSeats', { count: e.seats }),
  ];
}

/** "Free", "Price TBD", or the provider's price, e.g. "R 199,00 / month" - never a made-up price. */
export function priceLabel(pricing: PlanPricing, localeTag: string, t: Translator = EN): string {
  if (pricing.status === 'free') return t('billing.priceFree');
  if (pricing.status === 'tbd') return t('billing.priceTbd');
  const price = formatMoney(pricing.amount, localeTag);
  return pricing.intervalCount === 1
    ? t('billing.pricePer', { price, unit: pricing.interval })
    : t('billing.priceEvery', { price, unit: pricing.interval, count: pricing.intervalCount });
}

export interface PlanGateOption {
  plan: Plan;
  /** Pricing label - never a made-up price. */
  priceLabel: string;
  /** Free, or a paid plan with a real price (a TBD plan can't be chosen). */
  available: boolean;
  lines: string[];
  /** Why this plan cannot run the hunt right now (empty = it can). */
  reasons: ActivationBlockReason[];
  canRunHunt: boolean;
  recommended: boolean;
  isCurrent: boolean;
}

/**
 * One option per plan, in server order. "Recommended" = the first plan that can run this
 * hunt (labelled, alternatives stay visible - Blueprint section 6).
 */
export function planGateOptions(
  plans: readonly Plan[],
  hunt: Pick<Hunt, 'marketplaces' | 'location' | 'priority'>,
  activeHuntsInUse: number,
  currentPlanCode: string | null,
  localeTag = 'en',
  t: Translator = EN,
): PlanGateOption[] {
  const options = plans.map((plan) => {
    const reasons = evaluateActivation(plan.entitlements, activeHuntsInUse, hunt);
    return {
      plan,
      priceLabel: priceLabel(plan.pricing, localeTag, t),
      available: plan.pricing.status !== 'tbd',
      lines: describeEntitlements(plan.entitlements, t),
      reasons,
      canRunHunt: reasons.length === 0,
      recommended: false,
      isCurrent: plan.code === currentPlanCode,
    };
  });
  const recommended = options.find((o) => o.canRunHunt);
  if (recommended) recommended.recommended = true;
  return options;
}

/** Labels for the resolutions the API suggests on an activation block. */
export const RESOLUTION_LABEL = {
  pause_another_hunt: 'Pause another Hunt',
  upgrade_plan: 'Choose a bigger plan',
  edit_hunt: 'Edit this Hunt',
} as const;

/** RESOLUTION_LABEL in the UI language (web only - "upgrade_plan" sells). Use this; the English constant will be removed in step 89. */
export function resolutionLabels(t: Translator): Record<keyof typeof RESOLUTION_LABEL, string> {
  return {
    pause_another_hunt: t('billing.resolutionPauseAnother'),
    upgrade_plan: t('billing.resolutionUpgrade'),
    edit_hunt: t('billing.resolutionEdit'),
  };
}
