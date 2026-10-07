import {
  evaluateActivation,
  type ActivationBlockReason,
  type Hunt,
  type Plan,
  type PlanEntitlements,
} from '@rein-drop/contracts';

/**
 * Plan gate view model (App Flow Blueprint section 6), built ONLY from server data
 * (`GET /plans`, `GET /me/entitlements`) - no plan names, limits or prices are assumed here.
 */

const MARKETPLACE_LABEL: Record<string, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };

/** Human-readable lines for what a plan allows. */
export function describeEntitlements(e: PlanEntitlements): string[] {
  const hunts = e.activeHunts.limit;
  return [
    hunts === null ? 'Unlimited live Hunts' : `${hunts} live ${hunts === 1 ? 'Hunt' : 'Hunts'}`,
    e.marketplaces.length ? e.marketplaces.map((m) => MARKETPLACE_LABEL[m] ?? m).join(' and ') : 'No marketplaces',
    e.hotHunts.available
      ? `Hot Hunts${e.hotHunts.limit === null ? '' : `: ${e.hotHunts.limit}`}`
      : 'Hot Hunts: coming later',
    `${e.monitoringPriority === 'NORMAL' ? 'Normal' : e.monitoringPriority} monitoring priority`,
    e.analyticsHistoryDays === null ? 'Full analytics history' : `${e.analyticsHistoryDays} days of analytics history`,
    `${e.seats} ${e.seats === 1 ? 'seat' : 'seats'}`,
  ];
}

export interface PlanGateOption {
  plan: Plan;
  /** Pricing label - never a made-up price. */
  priceLabel: string;
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
): PlanGateOption[] {
  const options = plans.map((plan) => {
    const reasons = evaluateActivation(plan.entitlements, activeHuntsInUse, hunt);
    return {
      plan,
      priceLabel: plan.pricing.status === 'free' ? 'Free' : 'Price TBD',
      lines: describeEntitlements(plan.entitlements),
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
