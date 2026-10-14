import { z } from 'zod';
import { isoDateTimeSchema, marketplaceKeySchema, moneySchema, type MarketplaceKey } from './common.js';
import { huntLiveReadinessProblems, huntPrioritySchema, type HuntPriority, type HuntLocation } from './hunts.js';

/**
 * Plans and entitlements (App Flow Blueprint sections 6 and 14).
 *
 * Prices are never in code: paid plans are priced by the billing provider (Stripe prices mapped
 * to plan codes by configuration, decision 0014) and show as TBD until configured. Seeded limits
 * are placeholders too - every plan reports `limitsFinal: false` until the cost calculations are done.
 */

/** Entitlement rows (Entitlement.key) and what they mean. */
export const ENTITLEMENT_KEYS = {
  /** limit = max LIVE hunts (null = unlimited). */
  activeHuntsMax: 'hunts.active.max',
  /** limit = max saved (non-archived) Hunts: drafts, live and paused (null = unlimited; no row = unlimited). */
  savedHuntsMax: 'hunts.saved.max',
  /** Sell product (Sell / Complete plans): limit = max active listings (null = unlimited). Sell isn't built yet. */
  sellListingsMax: 'sell.listings.max',
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

/** Rein Drop products (decision 0018). A plan's family says which products it grants. */
export const PRODUCT_FAMILIES = ['SOURCE', 'SELL', 'COMPLETE'] as const;
export type ProductFamily = (typeof PRODUCT_FAMILIES)[number];
export const PRODUCTS = ['source', 'sell'] as const;
export type Product = (typeof PRODUCTS)[number];
/** Which plan families grant a product: Complete grants both. */
export const FAMILIES_GRANTING: Record<Product, readonly ProductFamily[]> = { source: ['SOURCE', 'COMPLETE'], sell: ['SELL', 'COMPLETE'] };

export const planEntitlementsSchema = z.object({
  activeHunts: z.object({ limit: z.number().int().min(0).nullable() }),
  /** Saved (non-archived) Hunts. Null = unlimited. */
  savedHunts: z.object({ limit: z.number().int().min(0).nullable() }),
  marketplaces: z.array(marketplaceKeySchema),
  /** Hot Hunts are a future feature: `available` stays false until they ship. */
  hotHunts: z.object({ available: z.boolean(), limit: z.number().int().min(0).nullable() }),
  monitoringPriority: huntPrioritySchema,
  /** Null = full history. */
  analyticsHistoryDays: z.number().int().min(0).nullable(),
  seats: z.number().int().min(1),
});
export type PlanEntitlements = z.infer<typeof planEntitlementsSchema>;

export const BILLING_INTERVALS = ['day', 'week', 'month', 'year'] as const;

export const planPricingSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('free') }),
  /** No price configured (or the provider is unreachable): can't be bought yet. */
  z.object({ status: z.literal('tbd') }),
  /** The provider's current price - read from it, never stored in code. */
  z.object({
    status: z.literal('priced'),
    amount: moneySchema,
    interval: z.enum(BILLING_INTERVALS),
    intervalCount: z.number().int().positive(),
  }),
]);
export type PlanPricing = z.infer<typeof planPricingSchema>;

/** `GET /plans` item - the plan gate shows Free alongside paid plans. */
export const planSchema = z.object({
  code: z.string(),
  name: z.string(),
  family: z.enum(PRODUCT_FAMILIES),
  pricing: planPricingSchema,
  /** False while limits are placeholders. */
  limitsFinal: z.boolean(),
  entitlements: planEntitlementsSchema,
});
export type Plan = z.infer<typeof planSchema>;
export const planListSchema = z.object({ items: z.array(planSchema) });

export const SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'INCOMPLETE', 'PAUSED', 'UNPAID'] as const;

/**
 * The user's current subscription. `provider`: "stripe" (paid, web), "free" (Free chosen - no
 * payment), "dev-fake" (DEVELOPMENT-ONLY fake billing, no real payment).
 */
export const subscriptionSummarySchema = z.object({
  planCode: z.string(),
  status: z.enum(SUBSCRIPTION_STATUSES),
  provider: z.string().nullable(),
  isDevelopment: z.boolean(),
  /** Ends at currentPeriodEnd instead of renewing (still on the plan until then). */
  cancelAtPeriodEnd: z.boolean(),
  /** Renewal / end date of a paid subscription; null for Free. */
  currentPeriodEnd: isoDateTimeSchema.nullable(),
});
export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>;

// ---------------------------------------------------------------------------
// Web billing (decision 0014). Native store billing is not built.
// ---------------------------------------------------------------------------

/** "stripe" = real web checkout; "development" = the fake confirmation (never in production). */
export const BILLING_MODES = ['stripe', 'development'] as const;

/** `GET /billing` - how plans are bought here, and whether the user has billing to manage. */
export const billingInfoSchema = z.object({
  mode: z.enum(BILLING_MODES),
  /** True when the user has a provider customer (the Customer Portal can be opened). */
  canManage: z.boolean(),
});
export type BillingInfo = z.infer<typeof billingInfoSchema>;

/** A same-origin web path to come back to, e.g. "/hunts/<id>/start" (never a full URL). */
export const billingReturnPathSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/(?![/\\])[^\s]*$/, 'must be a path on this site, e.g. /settings');

/** `POST /billing/checkout` - start paying for a plan; the browser goes to `url`. */
export const billingCheckoutRequestSchema = z.object({ planCode: z.string().trim().min(1).max(50), returnPath: billingReturnPathSchema });
export type BillingCheckoutRequest = z.infer<typeof billingCheckoutRequestSchema>;
export const billingRedirectSchema = z.object({ url: z.url() });
export type BillingRedirect = z.infer<typeof billingRedirectSchema>;

/** `POST /billing/portal` - manage payment method / invoices, change plan, or cancel. */
export const BILLING_PORTAL_FLOWS = ['manage', 'change_plan', 'cancel'] as const;
export const billingPortalRequestSchema = z.object({ returnPath: billingReturnPathSchema, flow: z.enum(BILLING_PORTAL_FLOWS).default('manage') });
export type BillingPortalRequest = z.infer<typeof billingPortalRequestSchema>;
export type BillingPortalRequestInput = z.input<typeof billingPortalRequestSchema>;

/** `POST /billing/free` - choose the Free plan (no payment, no card). */
export const chooseFreePlanResponseSchema = z.object({ subscription: subscriptionSummarySchema });

/** `POST /billing/dev/confirm` (DEVELOPMENT ONLY - 404 in production). */
export const devBillingConfirmRequestSchema = z.object({ planCode: z.string().trim().min(1).max(50) });
export type DevBillingConfirmRequest = z.infer<typeof devBillingConfirmRequestSchema>;
export const devBillingConfirmResponseSchema = z.object({ subscription: subscriptionSummarySchema });
export type DevBillingConfirmResponse = z.infer<typeof devBillingConfirmResponseSchema>;

/** `GET /me/entitlements` - the caller's plan, what it allows, and current usage. */
// ---------------------------------------------------------------------------
// Effective access (decision 0018) - GET /me/access
// ---------------------------------------------------------------------------

/**
 * Effective access state of one product for the account (rules: docs/strategy/ACCESS_RULES.md):
 * - free           Source at the Free plan (no paid subscription).
 * - active / trialing   paid and current.
 * - past_due       renewal failed, the provider is retrying - access kept (D36).
 * - grace_period   paid access ended (not by the user's own cancellation) - kept for the configured
 *                  grace days (default 0 = no grace).
 * - canceled       the user's cancellation took effect (a scheduled one keeps access until then).
 * - expired        paid access ended (retries exhausted, period over, ended at the provider).
 * - suspended      access revoked by Rein Drop - nothing runs; data kept.
 * - none           no access to this product (e.g. Sell without a Sell / Complete plan).
 */
export const ACCESS_STATES = ['free', 'active', 'trialing', 'past_due', 'grace_period', 'canceled', 'expired', 'suspended', 'none'] as const;
export type AccessState = (typeof ACCESS_STATES)[number];

const usageLimitSchema = z.object({
  /** Null = unlimited. */
  limit: z.number().int().min(0).nullable(),
  used: z.number().int().min(0),
  /** Null = unlimited. */
  remaining: z.number().int().min(0).nullable(),
});

const productAccessBase = {
  state: z.enum(ACCESS_STATES),
  /** The product's features are usable right now (free counts for Source). */
  hasAccess: z.boolean(),
  /** Access comes from a paid (or trial) subscription. */
  paid: z.boolean(),
  plan: z.object({ code: z.string(), name: z.string(), family: z.enum(PRODUCT_FAMILIES) }).nullable(),
  /** End of the current paid period, if any. */
  periodEndsAt: isoDateTimeSchema.nullable(),
  /** A cancellation is scheduled for periodEndsAt (access continues until then). */
  cancelsAtPeriodEnd: z.boolean(),
  /** When a grace period ends (state grace_period). */
  graceEndsAt: isoDateTimeSchema.nullable(),
};

export const accessResponseSchema = z.object({
  /** Access revoked by Rein Drop: every product is suspended; data is kept. */
  suspended: z.boolean(),
  products: z.object({
    source: z.object({
      ...productAccessBase,
      limits: z.object({
        activeHunts: usageLimitSchema,
        savedHunts: usageLimitSchema,
        marketplaces: z.array(marketplaceKeySchema),
        monitoringPriority: huntPrioritySchema,
        hotHunts: z.object({ available: z.boolean(), limit: z.number().int().min(0).nullable() }),
        analyticsHistoryDays: z.number().int().min(0).nullable(),
        seats: z.number().int().min(1),
      }),
    }),
    sell: z.object({
      ...productAccessBase,
      /** Null while the account has no Sell access. Sell isn't built yet. */
      limits: z.object({ listings: z.object({ limit: z.number().int().min(0).nullable() }) }).nullable(),
    }),
  }),
});
export type AccessResponse = z.infer<typeof accessResponseSchema>;
export type ProductAccess = AccessResponse['products']['source'] | AccessResponse['products']['sell'];

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
