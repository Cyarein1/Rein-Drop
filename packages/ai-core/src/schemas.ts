import { z } from 'zod';

/**
 * Structured outputs of every AI task. Providers must return exactly these shapes; anything else
 * is rejected (see validation.ts). Bump AI_SCHEMA_VERSION when a shape changes.
 */
export const AI_SCHEMA_VERSION = 1;

const money = z.object({ amountMinor: z.number().int().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) });
const shortText = z.string().trim().min(1).max(300);

// ---------------------------------------------------------------------------
// Evidence: every claim points at something the listing actually says
// ---------------------------------------------------------------------------

/** Free-text fields a quote can come from. The quote must appear in that field verbatim. */
export const TEXT_FIELDS = ['title', 'description', 'conditionText'] as const;
/** Structured facts a claim can rest on. `value` must equal the canonical value (see facts.ts). */
export const FACT_FIELDS = ['price', 'listedAt', 'photoCount', 'description'] as const;

export const evidenceSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('text'), field: z.enum(TEXT_FIELDS), quote: z.string().min(1).max(300) }),
  z.object({ source: z.literal('listing_field'), field: z.enum(FACT_FIELDS), value: z.string().max(100) }),
]);
export type Evidence = z.infer<typeof evidenceSchema>;

const groundedValue = z.object({ value: shortText, evidence: evidenceSchema });

// ---------------------------------------------------------------------------
// Task 1: product extraction / normalization
// ---------------------------------------------------------------------------

export const PRODUCT_CATEGORIES = ['phone', 'tablet', 'console', 'audio', 'computer', 'camera', 'other'] as const;
export const PRODUCT_ATTRIBUTES = ['storage', 'memory', 'edition', 'color', 'connectivity'] as const;

export const productExtractionSchema = z
  .object({
    category: z.enum(PRODUCT_CATEGORIES).nullable(),
    brand: groundedValue.nullable(),
    model: groundedValue.nullable(),
    attributes: z.array(groundedValue.extend({ name: z.enum(PRODUCT_ATTRIBUTES) })).max(10),
    /** Built only from brand / model / attribute values above; null when nothing was found. */
    normalizedName: shortText.nullable(),
    /** Whether the extracted product is what the hunt asked for. */
    queryFit: z.enum(['matches', 'conflicts', 'unclear']),
    queryFitNote: shortText,
    confidence: z.enum(['low', 'medium', 'high']),
  })
  .strict();
export type ProductExtraction = z.infer<typeof productExtractionSchema>;

// ---------------------------------------------------------------------------
// Task 2: qualitative condition / risk reasoning
// ---------------------------------------------------------------------------

export const RISK_CODES = [
  'damage_mentioned',
  'not_working',
  'locked_or_blacklisted',
  'sold_as_is',
  'missing_accessories',
  'vague_description',
  'no_photos',
  'no_price',
  'stale_listing',
] as const;
export type RiskCode = (typeof RISK_CODES)[number];

export const QUESTION_TOPICS = ['photos', 'battery', 'lock_status', 'accessories', 'condition', 'price', 'availability'] as const;

export const conditionRiskSchema = z
  .object({
    conditionCategory: z.enum(['new', 'used', 'refurbished', 'for_parts', 'unknown']),
    conditionEvidence: evidenceSchema.nullable(),
    riskLevel: z.enum(['low', 'medium', 'high', 'unknown']),
    riskFactors: z
      .array(
        z.object({ code: z.enum(RISK_CODES), severity: z.enum(['low', 'medium', 'high']), note: shortText, evidence: evidenceSchema }),
      )
      .max(RISK_CODES.length),
    /** What a buyer should ask before committing (the listing doesn't say). */
    missingInformation: z.array(z.object({ topic: z.enum(QUESTION_TOPICS), question: shortText })).max(QUESTION_TOPICS.length),
    /**
     * Seller history is not available from any source yet, so it can only be reported as such.
     * TODO(ai): allow an assessment once a seller-facts source exists (and is passed in).
     */
    seller: z.object({ status: z.literal('not_available'), note: shortText }),
  })
  .strict();
export type ConditionRiskAssessment = z.infer<typeof conditionRiskSchema>;

// ---------------------------------------------------------------------------
// Task 3: deal explanation
// ---------------------------------------------------------------------------

export const pointSchema = z.object({
  text: shortText,
  basis: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('match_check'), check: z.string().min(1) }),
    z.object({ kind: z.literal('risk_factor'), code: z.enum(RISK_CODES) }),
    z.object({ kind: z.literal('product'), field: z.enum(['brand', 'model', 'queryFit']) }),
    z.object({ kind: z.literal('listing_field'), field: z.enum(FACT_FIELDS) }),
  ]),
});
export type ExplanationPoint = z.infer<typeof pointSchema>;

export const dealExplanationSchema = z
  .object({
    headline: z.string().trim().min(1).max(140),
    summary: z.string().trim().min(1).max(600),
    positives: z.array(pointSchema).max(8),
    concerns: z.array(pointSchema).max(8),
    /**
     * No comparable-sales source exists yet, so value / profit can't be estimated.
     * TODO(ai): allow `estimated` once comparables are passed in as evidence.
     */
    valuation: z.object({ status: z.literal('unavailable'), reason: shortText }),
    nextStep: z.enum(['review', 'ask_seller', 'skip']),
    questionsForSeller: z.array(shortText).max(6),
  })
  .strict();
export type DealExplanation = z.infer<typeof dealExplanationSchema>;

// ---------------------------------------------------------------------------
// Metadata returned with every task result
// ---------------------------------------------------------------------------

export const aiResultMetaSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  modelVersion: z.string().min(1),
  /** Prompt / rule-set version of this task, e.g. "product-extraction@1". */
  promptVersion: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  latencyMs: z.number().int().nonnegative(),
  /** Token usage when the provider reports it (null for the mock). */
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).nullable(),
  /** Provider request / trace id, for support. */
  requestId: z.string().nullable(),
});
export type AIResultMeta = z.infer<typeof aiResultMetaSchema>;

export { money as moneySchema };
