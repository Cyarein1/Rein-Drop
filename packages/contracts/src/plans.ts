import { z } from 'zod';
import { marketplaceKeySchema, type MarketplaceKey } from './common.js';
import { huntLiveReadinessProblems, huntPrioritySchema, type HuntPriority, type HuntLocation } from './hunts.js';

/**
 * Plans and entitlements (App Flow Blueprint sections 6 and 14).
 *
 * Prices are NOT modelled: they are TBD until infrastructure economics are measured.
 * Seeded limits are placeholders too - every plan reports `limitsFinal: false` until the
 * product owner's cost calculations are done.
 */

/** Entitlement rows (Entitlement.key) and what they mean. */
export const ENTITLEMENT_KEYS = {
  /** limit = max LIVE hunts (null = unlimited). */
  activeHuntsMax: 'hunts.active.max',
  /** One row per allowed marketplace: `marketplace.<key>`. */
  marketplacePrefix: 'marketplace.',
  /** limit 1 = Hot Hunts available on this plan (future feature flag). */
  hotHuntsEnabled: 'hunts.hot.enabled',
  /** limit = max Hot Hunts (null = unlimited) when enabled. */
  hotHuntsMax: 'hunts.hot.max',
  /** value = highest monitoring priority (HuntPriority). */
  monitoringPriority: 'monitoring.priority',
  /** limit = days of analytics/history (null = all). */
  analyticsHistoryDays: 'analytics.history_days',
  /** limit = people on the account (teams are roadmap). */
  seatsMax: 'seats.max',
} as const;

export const planEntitlementsSchema = z.object({
  activeHunts: z.object({ limit: z.number().int().min(0).nullable() }),
  marketplaces: z.array(marketplaceKeySchema),
  /** Hot Hunts are a future feature: `available` stays false until they ship. */
  hotHunts: z.object({ available: z.boolean(), limit: z.number().int().min(0).nullable() }),
  monitoringPriority: huntPrioritySchema,
  /** Null = full history. */
  analyticsHistoryDays: z.number().int().min(0).nullable(),
  seats: z.number().int().min(1),
});
export type PlanEntitlements = z.infer<typeof planEntitlementsSchema>;

export const planPricingSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('free') }),
  /** TODO(billing): real prices once decided (Stripe leading candidate). */
  z.object({ status: z.literal('tbd') }),
]);

/** `GET /plans` item - the plan gate shows Free alongside paid plans. */
export const planSchema = z.object({
  code: z.string(),
  name: z.string(),
  pricing: planPricingSchema,
  /** False while limits are placeholders. */
  limitsFinal: z.boolean(),
  entitlements: planEntitlementsSchema,
});
export type Plan = z.infer<typeof planSchema>;
export const planListSchema = z.object({ items: z.array(planSchema) });

/**
 * The user's current subscription. `provider: "dev-fake"` = created by the DEVELOPMENT-ONLY
 * fake billing confirmation (no real payment). TODO(billing): real provider (Stripe / app
 * stores) is not integrated.
 */
export const subscriptionSummarySchema = z.object({
  planCode: z.string(),
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED']),
  provider: z.string().nullable(),
  isDevelopment: z.boolean(),
});
export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>;

/** `POST /billing/dev/confirm` (DEVELOPMENT ONLY - 404 in production). */
export const devBillingConfirmRequestSchema = z.object({ planCode: z.string().trim().min(1).max(50) });
export type DevBillingConfirmRequest = z.infer<typeof devBillingConfirmRequestSchema>;
export const devBillingConfirmResponseSchema = z.object({ subscription: subscriptionSummarySchema });
export type DevBillingConfirmResponse = z.infer<typeof devBillingConfirmResponseSchema>;

/** `GET /me/entitlements` - the caller's plan, what it allows, and current usage. */
export const entitlementEvaluationSchema = z.object({
  /** Null = the user has not chosen a plan yet (they are on Free by default). */
  subscription: subscriptionSummarySchema.nullable(),
  plan: planSchema.pick({ code: true, name: true, pricing: true, limitsFinal: true }),
  entitlements: planEntitlementsSchema,
  usage: z.object({ activeHunts: z.number().int().min(0) }),
  /** Null = unlimited. */
  remaining: z.object({ activeHunts: z.number().int().min(0).nullable() }),
});
export type EntitlementEvaluation = z.infer<typeof entitlementEvaluationSchema>;

// ---------------------------------------------------------------------------
// Activation blocks
// ---------------------------------------------------------------------------

/** What the user can do about a block (Blueprint section 14: "Pause another Hunt or upgrade"). */
export const ACTIVATION_RESOLUTIONS = ['pause_another_hunt', 'upgrade_plan', 'edit_hunt'] as const;
export type ActivationResolution = (typeof ACTIVATION_RESOLUTIONS)[number];
const resolutions = z.array(z.enum(ACTIVATION_RESOLUTIONS));

export const activationBlockReasonSchema = z.discriminatedUnion('code', [
  z.object({
    code: z.literal('ACTIVE_HUNT_LIMIT_REACHED'),
    message: z.string(),
    limit: z.number().int().min(0),
    used: z.number().int().min(0),
    resolutions,
  }),
  z.object({
    code: z.literal('MARKETPLACE_NOT_IN_PLAN'),
    message: z.string(),
    marketplaces: z.array(marketplaceKeySchema),
    resolutions,
  }),
  z.object({
    code: z.literal('PRIORITY_NOT_IN_PLAN'),
    message: z.string(),
    priority: huntPrioritySchema,
    resolutions,
  }),
  z.object({
    code: z.literal('NOT_READY'),
    message: z.string(),
    problems: z.array(z.string()),
    resolutions,
  }),
]);
export type ActivationBlockReason = z.infer<typeof activationBlockReasonSchema>;

/** Attached to `ACTIVATION_BLOCKED` errors. The hunt itself is left unchanged (still a draft / paused). */
export const activationBlockSchema = z.object({
  planCode: z.string(),
  reasons: z.array(activationBlockReasonSchema).min(1),
});
export type ActivationBlock = z.infer<typeof activationBlockSchema>;

/** `GET /hunts/:id/activation-check` - preview before "Start watching". */
export const activationCheckSchema = z.object({
  huntId: z.string(),
  canActivate: z.boolean(),
  planCode: z.string(),
  reasons: z.array(activationBlockReasonSchema),
});
export type ActivationCheck = z.infer<typeof activationCheckSchema>;

const MARKETPLACE_LABEL: Record<MarketplaceKey, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };

/**
 * Everything that stops a hunt going LIVE under a plan (empty = allowed). Pure, so the API
 * enforces exactly what clients preview. `activeHuntsInUse` must exclude the hunt itself.
 */
export function evaluateActivation(
  entitlements: PlanEntitlements,
  activeHuntsInUse: number,
  hunt: { marketplaces: MarketplaceKey[]; location: HuntLocation | null; priority: HuntPriority },
): ActivationBlockReason[] {
  const reasons: ActivationBlockReason[] = [];

  const problems = huntLiveReadinessProblems(hunt);
  if (problems.length > 0) {
    reasons.push({ code: 'NOT_READY', message: 'This hunt is not ready to go live', problems, resolutions: ['edit_hunt'] });
  }

  const limit = entitlements.activeHunts.limit;
  if (limit !== null && activeHuntsInUse >= limit) {
    reasons.push({
      code: 'ACTIVE_HUNT_LIMIT_REACHED',
      message: `Your plan allows ${limit} live ${limit === 1 ? 'hunt' : 'hunts'} and ${activeHuntsInUse} ${activeHuntsInUse === 1 ? 'is' : 'are'} live. Pause another hunt or upgrade - this one stays saved.`,
      limit,
      used: activeHuntsInUse,
      resolutions: ['pause_another_hunt', 'upgrade_plan'],
    });
  }

  const locked = hunt.marketplaces.filter((m) => !entitlements.marketplaces.includes(m));
  if (locked.length > 0) {
    reasons.push({
      code: 'MARKETPLACE_NOT_IN_PLAN',
      message: `${locked.map((m) => MARKETPLACE_LABEL[m]).join(' and ')} ${locked.length === 1 ? "isn't" : "aren't"} included in your plan. Remove ${locked.length === 1 ? 'it' : 'them'} from this hunt or upgrade.`,
      marketplaces: locked,
      resolutions: ['edit_hunt', 'upgrade_plan'],
    });
  }

  if (hunt.priority !== entitlements.monitoringPriority && hunt.priority !== 'NORMAL') {
    reasons.push({
      code: 'PRIORITY_NOT_IN_PLAN',
      message: 'This monitoring priority is not included in your plan',
      priority: hunt.priority,
      resolutions: ['edit_hunt', 'upgrade_plan'],
    });
  }
  return reasons;
}
