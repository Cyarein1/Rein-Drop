import { z } from 'zod';
import { idSchema, isoDateTimeSchema, marketplaceKeySchema, moneySchema, pageQuerySchema, pageSchema } from './common.js';
import { listingDetailSchema, listingStatusSchema, listingSummarySchema } from './listings.js';
import { sourceStatusSchema } from './marketplace-health.js';
import { boughtCostsSchema } from './outcomes.js';

/**
 * A "deal" is a listing surfaced to the seller by one of their hunts - a HuntMatch, together
 * with its listing, the latest analysis (AI + deterministic scoring) and the user's decisions.
 * `id` is the HuntMatch id.
 *
 * ESTIMATED vs REALIZED: every amount about the future here is an estimate (`basis: 'estimate'`)
 * and only appears when real comparable sales support it. Realized profit / loss only exists for
 * recorded purchases and sales (Outcomes).
 */

/**
 * Mirrors the HuntMatchStatus database enum (checked by a test in apps/api).
 * EXPIRED = the system found the listing no longer matches (sold, price raised, duplicate).
 * DISMISSED (Ignore) and BOUGHT are the user's decisions; the system never changes them.
 */
export const DEAL_MATCH_STATUSES = ['NEW', 'SEEN', 'DISMISSED', 'EXPIRED', 'BOUGHT'] as const;
export const dealMatchStatusSchema = z.enum(DEAL_MATCH_STATUSES);
export type DealMatchStatus = z.infer<typeof dealMatchStatusSchema>;

/** Mirrors the DealAnalysisStatus database enum (checked by a test in apps/api). */
export const DEAL_ANALYSIS_STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const;
export const dealAnalysisStatusSchema = z.enum(DEAL_ANALYSIS_STATUSES);
export type DealAnalysisStatus = z.infer<typeof dealAnalysisStatusSchema>;

/**
 * One user-facing status per deal, by precedence:
 * bought > ignored > unavailable (sold / ended / no longer matching) > saved > new > seen.
 */
export const DEAL_STATUSES = ['new', 'seen', 'saved', 'ignored', 'bought', 'unavailable'] as const;
export const dealStatusSchema = z.enum(DEAL_STATUSES);
export type DealStatus = z.infer<typeof dealStatusSchema>;

/** Feed filter. `open` (default) = new + seen + saved: still available and not decided. */
export const DEAL_STATUS_FILTERS = ['open', ...DEAL_STATUSES, 'all'] as const;
export const dealStatusFilterSchema = z.enum(DEAL_STATUS_FILTERS);
export type DealStatusFilter = z.infer<typeof dealStatusFilterSchema>;

/** Mirror @rein-drop/scoring (checked by a test in apps/api). Strongest first. */
export const DEAL_STRENGTHS = ['exceptional', 'strong', 'moderate', 'weak'] as const;
export const dealStrengthSchema = z.enum(DEAL_STRENGTHS);
export type DealStrength = z.infer<typeof dealStrengthSchema>;
export const DEAL_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export const dealConfidenceSchema = z.enum(DEAL_CONFIDENCE_LEVELS);
export type DealConfidence = z.infer<typeof dealConfidenceSchema>;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Age of the opportunity. `basis`: from the seller's posting time, else from discovery. */
export const dealFreshnessSchema = z.object({
  postedAt: isoDateTimeSchema.nullable(),
  /** When Rein Drop first saw the listing. */
  discoveredAt: isoDateTimeSchema,
  ageMinutes: z.number().int().nonnegative(),
  basis: z.enum(['posted', 'discovered']),
});
export type DealFreshness = z.infer<typeof dealFreshnessSchema>;

/** Is the listing still there, and how recently did Rein Drop check its marketplace? */
export const dealSourceStatusSchema = z.object({
  marketplace: marketplaceKeySchema,
  listingStatus: listingStatusSchema,
  /** ACTIVE or UNKNOWN (not reported as gone). */
  available: z.boolean(),
  /** Last time a search returned this listing. */
  lastSeenAt: isoDateTimeSchema,
  /** Last search of this marketplace for the deal's hunt. */
  lastCheckedAt: isoDateTimeSchema.nullable(),
  lastCheck: z.enum(['ok', 'degraded', 'failed']).nullable(),
  /** The marketplace source's own health right now. */
  sourceHealth: sourceStatusSchema,
});
export type DealSourceStatus = z.infer<typeof dealSourceStatusSchema>;

/** What buying it costs, as far as known. */
export const dealPriceSchema = z.object({
  /** Asking price; null when the listing shows none. */
  asking: moneySchema.nullable(),
  /** Costs the listing states (e.g. shipping); null when none are known. */
  knownCosts: moneySchema.nullable(),
  /** Asking + known costs. Never includes fees Rein Drop can't price yet. */
  knownTotal: moneySchema.nullable(),
});
export type DealPrice = z.infer<typeof dealPriceSchema>;

const unavailableEstimate = z.object({ status: z.literal('unavailable'), reason: z.string(), detail: z.string() });

/** Resale / upside ESTIMATES - only "estimated" when comparable sales support them. */
export const dealEstimateSchema = z.object({
  resale: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('estimated'),
      basis: z.literal('comparable_sales'),
      low: moneySchema,
      typical: moneySchema,
      high: moneySchema,
      sampleSize: z.number().int().positive(),
    }),
    unavailableEstimate,
  ]),
  upside: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('estimated'),
      /** Never realized profit. */
      basis: z.literal('estimate'),
      low: moneySchema,
      typical: moneySchema,
      high: moneySchema,
      typicalMarginPercent: z.number().int().nullable(),
      /** Costs the estimate does not subtract (e.g. selling fees). */
      excludes: z.array(z.string()),
    }),
    unavailableEstimate,
  ]),
});
export type DealEstimate = z.infer<typeof dealEstimateSchema>;

export const dealAssessmentSchema = z.object({
  /** pending = not analysed yet; failed = the analysis couldn't run (retried by the system). */
  status: z.enum(['pending', 'completed', 'failed']),
  strength: dealStrengthSchema.nullable(),
  confidence: dealConfidenceSchema.nullable(),
  /** 0-100 strength-banded score (excludes freshness). */
  score: z.number().int().nullable(),
  /** Whether it qualified for an alert when analysed. */
  alertEligible: z.boolean(),
  analyzedAt: isoDateTimeSchema.nullable(),
});
export type DealAssessment = z.infer<typeof dealAssessmentSchema>;

// ---------------------------------------------------------------------------
// Feed card + detail
// ---------------------------------------------------------------------------

/** Card in the ranked feed. `GET /deals`. */
export const dealSummarySchema = z.object({
  id: idSchema,
  hunt: z.object({ id: idSchema, name: z.string() }),
  status: dealStatusSchema,
  matchStatus: dealMatchStatusSchema,
  isSaved: z.boolean(),
  matchedAt: isoDateTimeSchema,
  listing: listingSummarySchema,
  price: dealPriceSchema,
  freshness: dealFreshnessSchema,
  source: dealSourceStatusSchema,
  assessment: dealAssessmentSchema,
  estimate: dealEstimateSchema,
  /** One-line reason Rein Drop flagged it (grounded AI headline); null until analysed. */
  reason: z.string().nullable(),
  /** Feed position value: score + freshness bonus (see @rein-drop/scoring feedRank). */
  rank: z.number(),
});
export type DealSummary = z.infer<typeof dealSummarySchema>;

const reasonSchema = z.object({
  code: z.string(),
  /** blocks = rules it out; caps = keeps it below strong; supports = in its favour; note = FYI. */
  effect: z.enum(['blocks', 'caps', 'supports', 'note']),
  detail: z.string(),
});

/** Detail view. `GET /deals/:id`, and the response of every deal action. */
export const dealDetailSchema = dealSummarySchema.extend({
  listing: listingDetailSchema,
  /** Why Rein Drop flagged it (AI explanation, grounded in the listing and the checks). */
  why: z
    .object({
      headline: z.string(),
      summary: z.string(),
      positives: z.array(z.string()),
      concerns: z.array(z.string()),
      nextStep: z.enum(['review', 'ask_seller', 'skip']),
      questionsForSeller: z.array(z.string()),
    })
    .nullable(),
  product: z
    .object({
      name: z.string().nullable(),
      fit: z.enum(['matches', 'conflicts', 'unclear']),
      fitNote: z.string(),
      confidence: dealConfidenceSchema,
    })
    .nullable(),
  risk: z
    .object({
      level: z.enum(['low', 'medium', 'high', 'unknown']),
      condition: z.enum(['new', 'used', 'refurbished', 'for_parts', 'unknown']),
      factors: z.array(z.object({ code: z.string(), severity: z.enum(['low', 'medium', 'high']), note: z.string() })),
      missingInformation: z.array(z.object({ topic: z.string(), question: z.string() })),
      /** Seller history isn't available from any source yet. */
      seller: z.object({ status: z.literal('not_available'), note: z.string() }),
    })
    .nullable(),
  strengthReasons: z.array(reasonSchema),
  confidenceReasons: z.array(reasonSchema),
  /** Deterministic economics behind the price and estimate. */
  economics: z
    .object({
      knownCosts: z.array(z.object({ kind: z.string(), label: z.string(), amount: moneySchema })),
      /** Costs not included anywhere yet (always listed so nothing reads as complete). */
      notIncluded: z.array(z.string()),
      maxPrice: z
        .object({
          limit: moneySchema,
          status: z.enum(['within', 'above', 'unverified']),
          withKnownCosts: z.enum(['within', 'above']).nullable(),
          headroom: moneySchema.nullable(),
        })
        .nullable(),
      target: z.object({ status: z.enum(['met', 'not_met', 'unverified']), detail: z.string() }).nullable(),
    })
    .nullable(),
  /** The hunt's deterministic match checks. */
  matchChecks: z.array(z.object({ check: z.string(), outcome: z.enum(['pass', 'fail', 'unverified', 'not_applicable']), detail: z.string() })),
  /** Alert rules as evaluated with the latest analysis. */
  alert: z
    .object({
      eligible: z.boolean(),
      kind: z.enum(['deal', 'exceptional']).nullable(),
      rules: z.array(z.object({ rule: z.string(), passed: z.boolean(), detail: z.string() })),
    })
    .nullable(),
  decision: z.object({
    seenAt: isoDateTimeSchema.nullable(),
    savedAt: isoDateTimeSchema.nullable(),
    ignoredAt: isoDateTimeSchema.nullable(),
    ignoreReason: z.string().nullable(),
    boughtAt: isoDateTimeSchema.nullable(),
    /** The purchase record created by Bought. */
    inventoryItemId: idSchema.nullable(),
  }),
});
export type DealDetail = z.infer<typeof dealDetailSchema>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** `GET /deals` - ranked by strength then freshness. */
export const listDealsQuerySchema = pageQuerySchema.extend({
  huntId: idSchema.optional(),
  /** Source marketplace. */
  marketplace: marketplaceKeySchema.optional(),
  status: dealStatusFilterSchema.default('open'),
});
export type ListDealsQuery = z.infer<typeof listDealsQuerySchema>;
export type ListDealsQueryInput = z.input<typeof listDealsQuerySchema>;

export const dealPageSchema = pageSchema(dealSummarySchema);

/** `POST /deals/:id/ignore` - "Not for me", with an optional reason. */
export const ignoreDealRequestSchema = z.object({
  reason: z.string().trim().min(1).max(200).optional(),
});
export type IgnoreDealRequest = z.infer<typeof ignoreDealRequestSchema>;

/**
 * `POST /deals/:id/bought` - records the purchase. Price defaults to the listing's asking price
 * and is required when the listing shows none; purchase time defaults to now.
 */
export const markDealBoughtRequestSchema = z
  .object({
    price: moneySchema.refine((m) => m.amountMinor > 0, { message: 'Must be more than zero', path: ['amountMinor'] }).optional(),
    purchasedAt: isoDateTimeSchema.optional(),
    /** Optional purchase costs (tax, shipping to you, repair, ...), in the purchase price's currency. */
    costs: boughtCostsSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.costs?.length) return;
    // Without a price the listing's price is used; the API checks the currency against that.
    const currency = v.price?.currency ?? v.costs[0]!.amount.currency;
    v.costs.forEach((c, i) => {
      if (c.amount.currency !== currency) ctx.addIssue({ code: 'custom', path: ['costs', i, 'amount', 'currency'], message: `Use ${currency}, like the price` });
    });
  });
export type MarkDealBoughtRequest = z.infer<typeof markDealBoughtRequestSchema>;
