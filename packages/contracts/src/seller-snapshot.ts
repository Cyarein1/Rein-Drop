import { z } from 'zod';
import { isoDateTimeSchema, moneyInputSchema, moneySchema } from './common.js';

/**
 * Seller Snapshot - the five progressive onboarding questions
 * (App Flow Blueprint v1.0, section 4). One question per screen; answers are
 * saved as the user goes so onboarding can resume, and they pre-fill the first
 * Hunt (marketplaces, deal criteria) and personalize the product.
 *
 * Option keys are stable identifiers; labels are the Blueprint's wording.
 * NOTE: question 4's exact wording/options are an open decision (Blueprint
 * section 22) - change the lists here, not in the apps.
 */

export const SELLER_SNAPSHOT_QUESTION_COUNT = 5;

/**
 * Gate asked BEFORE the five questions (product decision, 2026-10-07 - a deliberate
 * deviation from the Blueprint's "maximum five questions"). Only resellers continue
 * to the Seller Snapshot; the non-reseller experience is not designed yet.
 * TODO(product): define what non-resellers (people hunting for something for
 * themselves) get - currently "coming soon".
 */
export const RESELLER_INTENT_COPY = {
  question: 'Are you a reseller?',
  options: {
    yes: 'Yes - I buy to resell',
    no: "No - I'm looking for something for myself",
  },
  comingSoon: {
    title: 'Coming soon',
    body: "Rein Drop is built for resellers right now. Hunting for things for yourself is coming soon - we'll let you know.",
  },
} as const;
export const OTHER_TEXT_MAX_LENGTH = 60;

// Q1 - What do you usually hunt for? (multi-select)
export const HUNT_CATEGORIES = [
  'phones_tablets',
  'computers',
  'gaming',
  'cameras',
  'sneakers_fashion',
  'collectibles',
  'tools',
  'auto_parts',
  'other',
] as const;
export type HuntCategory = (typeof HUNT_CATEGORIES)[number];

// Q2 - Which best describes your reselling right now? (single)
export const RESELLER_STAGES = [
  'getting_started',
  'side_income',
  'regular_reseller',
  'full_time',
  'team_store',
] as const;
export type ResellerStage = (typeof RESELLER_STAGES)[number];

// Q3 - Where do you usually source inventory? (multi-select)
export const SOURCING_CHANNELS = [
  'facebook_marketplace',
  'ebay',
  'local_classifieds',
  'thrift_retail',
  'auctions',
  'other',
] as const;
export type SourcingChannel = (typeof SOURCING_CHANNELS)[number];

// Q4 - What makes a deal worth moving on for you? (single + optional target)
export const DEAL_CRITERIA = [
  'min_profit',
  'min_margin',
  'max_buy_price',
  'fast_resale',
  'case_by_case',
] as const;
export type DealCriterion = (typeof DEAL_CRITERIA)[number];

// Q5 - What would you most like Rein Drop to improve? (single)
export const IMPROVEMENT_GOALS = [
  'find_deals_faster',
  'stop_checking_marketplaces',
  'find_better_margins',
  'miss_fewer_listings',
  'know_what_to_buy',
  'track_profit',
] as const;
export type ImprovementGoal = (typeof IMPROVEMENT_GOALS)[number];

/** Question and option wording, shared by web and mobile. */
export const SELLER_SNAPSHOT_COPY = {
  categories: {
    question: 'What do you usually hunt for?',
    options: {
      phones_tablets: 'Phones & tablets',
      computers: 'Computers',
      gaming: 'Gaming',
      cameras: 'Cameras',
      sneakers_fashion: 'Sneakers/fashion',
      collectibles: 'Collectibles',
      tools: 'Tools',
      auto_parts: 'Auto parts',
      other: 'Other',
    } satisfies Record<HuntCategory, string>,
  },
  stage: {
    question: 'Which best describes your reselling right now?',
    options: {
      getting_started: 'Getting started',
      side_income: 'Side income',
      regular_reseller: 'Regular reseller',
      full_time: 'Full-time / high volume',
      team_store: 'Team / store',
    } satisfies Record<ResellerStage, string>,
  },
  sources: {
    question: 'Where do you usually source inventory?',
    options: {
      facebook_marketplace: 'Facebook Marketplace',
      ebay: 'eBay',
      local_classifieds: 'Local pickup / classifieds',
      thrift_retail: 'Thrift/retail',
      auctions: 'Auctions',
      other: 'Other',
    } satisfies Record<SourcingChannel, string>,
  },
  dealRule: {
    question: 'What makes a deal worth moving on for you?',
    options: {
      min_profit: 'Minimum $ profit',
      min_margin: 'Minimum % margin',
      max_buy_price: 'Buy below a max price',
      fast_resale: 'Fast resale/velocity',
      case_by_case: 'I decide case by case',
    } satisfies Record<DealCriterion, string>,
  },
  improvementGoal: {
    question: 'What would you most like Rein Drop to improve?',
    options: {
      find_deals_faster: 'Find deals faster',
      stop_checking_marketplaces: 'Stop checking marketplaces',
      find_better_margins: 'Find better margins',
      miss_fewer_listings: 'Miss fewer listings',
      know_what_to_buy: 'Know what to buy',
      track_profit: 'Track what actually makes me money',
    } satisfies Record<ImprovementGoal, string>,
  },
} as const;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const uniqueList = <T extends z.ZodType>(item: T, message: string) =>
  z
    .array(item)
    .min(1, message)
    .refine((list) => new Set(list).size === list.length, 'Options must not repeat');

const otherText = z.string().trim().min(1).max(OTHER_TEXT_MAX_LENGTH);

const positiveMoney = moneyInputSchema.refine((m) => m.amountMinor > 0, 'Amount must be greater than 0');

/** Q4 answer. The optional target only exists where it makes sense for the criterion. */
export const dealRuleSchema = z.discriminatedUnion('criterion', [
  z.object({ criterion: z.literal('min_profit'), target: positiveMoney.nullable() }),
  z.object({
    criterion: z.literal('min_margin'),
    /** Whole percent, e.g. 25 = 25% margin. */
    targetPercent: z.number().int().min(1).max(100).nullable(),
  }),
  z.object({ criterion: z.literal('max_buy_price'), target: positiveMoney.nullable() }),
  z.object({ criterion: z.literal('fast_resale') }),
  z.object({ criterion: z.literal('case_by_case') }),
]);
export type DealRule = z.infer<typeof dealRuleSchema>;

const answerFields = {
  categories: uniqueList(z.enum(HUNT_CATEGORIES), 'Choose at least one category'),
  /** Free text when "other" is selected. */
  categoriesOther: otherText.nullable(),
  stage: z.enum(RESELLER_STAGES),
  sources: uniqueList(z.enum(SOURCING_CHANNELS), 'Choose at least one place'),
  sourcesOther: otherText.nullable(),
  dealRule: dealRuleSchema,
  improvementGoal: z.enum(IMPROVEMENT_GOALS),
};

/** "Other" free text is only accepted together with the "other" option it describes. */
function otherTextRules(
  body: {
    categories?: readonly string[] | undefined;
    categoriesOther?: string | null | undefined;
    sources?: readonly string[] | undefined;
    sourcesOther?: string | null | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const message = 'Only allowed when "Other" is selected';
  if (body.categoriesOther && !body.categories?.includes('other')) {
    ctx.addIssue({ code: 'custom', message, path: ['categoriesOther'] });
  }
  if (body.sourcesOther && !body.sources?.includes('other')) {
    ctx.addIssue({ code: 'custom', message, path: ['sourcesOther'] });
  }
}

/**
 * `PATCH /me/seller-snapshot` body - save one or more answers as the user
 * progresses (one question per screen). Omitted questions keep their answer.
 * The five answers are only accepted for resellers: `isReseller` must already be
 * true or be set to true in the same request (otherwise 409 CONFLICT).
 */
export const updateSellerSnapshotRequestSchema = z
  .object({ isReseller: z.boolean(), ...answerFields })
  .partial()
  .refine((body) => Object.values(body).some((v) => v !== undefined), 'Provide at least one answer')
  .superRefine(otherTextRules);
export type UpdateSellerSnapshotRequest = z.infer<typeof updateSellerSnapshotRequestSchema>;

/**
 * `PUT /me/seller-snapshot` body - save all five answers at once (e.g. editing
 * from Settings). Every question is required; "Other" text stays optional.
 * Saving the full snapshot also records `isReseller: true`.
 */
export const saveSellerSnapshotRequestSchema = z
  .object({
    ...answerFields,
    categoriesOther: answerFields.categoriesOther.default(null),
    sourcesOther: answerFields.sourcesOther.default(null),
  })
  .superRefine(otherTextRules);
export type SaveSellerSnapshotRequest = z.infer<typeof saveSellerSnapshotRequestSchema>;
export type SaveSellerSnapshotRequestInput = z.input<typeof saveSellerSnapshotRequestSchema>;

/**
 * `GET`/`PATCH`/`PUT /me/seller-snapshot` response. Unanswered questions are null/empty.
 * `completedAt` is set by the server once all five questions are answered.
 *
 * Deliberately contains no geography: exact location/radius belongs to each Hunt
 * (App Flow Blueprint section 5), not to the seller profile.
 */
export const SELLER_SNAPSHOT_STATUSES = [
  /** "Are you a reseller?" not answered yet. */
  'not_started',
  /** Answered "no" - show the coming-soon experience. */
  'not_reseller',
  /** Reseller with fewer than five answers. */
  'in_progress',
  /** Reseller with all five answers. */
  'complete',
] as const;
export type SellerSnapshotStatus = (typeof SELLER_SNAPSHOT_STATUSES)[number];

export const sellerSnapshotSchema = z.object({
  /** Answer to the gate question; null = not answered. */
  isReseller: z.boolean().nullable(),
  /** Derived by the server - clients route on this instead of re-deriving it. */
  status: z.enum(SELLER_SNAPSHOT_STATUSES),
  categories: z.array(z.enum(HUNT_CATEGORIES)),
  categoriesOther: z.string().nullable(),
  stage: z.enum(RESELLER_STAGES).nullable(),
  sources: z.array(z.enum(SOURCING_CHANNELS)),
  sourcesOther: z.string().nullable(),
  dealRule: dealRuleSchema.nullable(),
  improvementGoal: z.enum(IMPROVEMENT_GOALS).nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema.nullable(),
});
export type SellerSnapshot = z.infer<typeof sellerSnapshotSchema>;

/** How many of the five questions have an answer - drives "2 of 5" progress on every platform. */
export function answeredQuestionCount(
  snapshot: Pick<SellerSnapshot, 'categories' | 'stage' | 'sources' | 'dealRule' | 'improvementGoal'>,
): number {
  return [
    snapshot.categories.length > 0,
    snapshot.stage !== null,
    snapshot.sources.length > 0,
    snapshot.dealRule !== null,
    snapshot.improvementGoal !== null,
  ].filter(Boolean).length;
}

/** The one place the snapshot status is derived (used by the API). */
export function sellerSnapshotStatus(
  isReseller: boolean | null,
  answers: Pick<SellerSnapshot, 'categories' | 'stage' | 'sources' | 'dealRule' | 'improvementGoal'>,
): SellerSnapshotStatus {
  if (isReseller === null) return 'not_started';
  if (!isReseller) return 'not_reseller';
  return answeredQuestionCount(answers) === SELLER_SNAPSHOT_QUESTION_COUNT ? 'complete' : 'in_progress';
}
