import { z } from 'zod';
import { idSchema, isoDateTimeSchema, moneySchema } from './common.js';
import { dealSummarySchema } from './deals.js';
import { huntActivitySchema, huntStatusSchema } from './hunts.js';

const count = z.number().int().min(0);

/**
 * `GET /me/home` - the returning-user Home (App Flow Blueprint section 8), in priority order:
 * 1 opportunities needing attention, 2 active Hunts and their status, 3 realized profit
 * snapshot, 4 recent opportunities / outcomes, 5 one actionable recommendation or setup issue.
 * Not a KPI wall: each section answers one question.
 */

/** Realized results for one currency (no conversion between currencies). */
export const profitByCurrencySchema = z.object({
  currency: z.string(),
  /** Purchase prices of items bought in the period. */
  spent: moneySchema,
  /** Sale prices of items sold in the period. */
  revenue: moneySchema,
  /**
   * Sale price - purchase price - recorded costs, for items sold in the period. REALIZED only:
   * never estimates, never missed potential.
   */
  realizedProfit: moneySchema,
  sold: count,
});

export const homeRecommendationCodes = [
  'finish_setup',
  'create_first_hunt',
  'start_draft',
  'resume_hunt',
  'source_issue',
  'broaden_hunt',
  'tighten_hunt',
  'enable_push',
] as const;
export type HomeRecommendationCode = (typeof homeRecommendationCodes)[number];

/** Where the recommendation's action goes (each client maps it to its own route). */
export const homeTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('onboarding') }),
  z.object({ kind: z.literal('create_hunt') }),
  z.object({ kind: z.literal('hunt'), huntId: idSchema }),
  z.object({ kind: z.literal('edit_hunt'), huntId: idSchema }),
  z.object({ kind: z.literal('start_hunt'), huntId: idSchema }),
  z.object({ kind: z.literal('notifications') }),
]);
export type HomeTarget = z.infer<typeof homeTargetSchema>;

export const homeSchema = z.object({
  generatedAt: isoDateTimeSchema,
  /** 1. What needs the user now. */
  attention: z.object({
    unreadAlerts: count,
    /** Open deals (new, seen or saved, still available). */
    toReview: count,
    /** The strongest open deals, in feed order (at most 3). */
    top: z.array(dealSummarySchema),
  }),
  /** 2. Is Rein Drop working? */
  hunts: z.object({
    live: count,
    paused: count,
    drafts: count,
    /** Live hunts, most recently activated first (at most 5), with their monitoring state. */
    items: z.array(z.object({ id: idSchema, name: z.string(), status: huntStatusSchema, activity: huntActivitySchema })),
  }),
  /** 3. Am I making money? Realized only (recorded purchases and sales). */
  profit: z.object({
    periodDays: z.number().int().positive(),
    since: isoDateTimeSchema,
    bought: count,
    sold: count,
    /** Bought, not yet sold (in stock or listed), all time. */
    holding: count,
    /** One entry per currency with activity in the period. */
    byCurrency: z.array(profitByCurrencySchema),
    /** False until the first sale is ever recorded. */
    hasSales: z.boolean(),
  }),
  /** 4. Recent opportunities (alerts) and outcomes (purchases, sales), newest first (at most 5). */
  recent: z.array(
    z.object({
      kind: z.enum(['alert', 'bought', 'sold']),
      at: isoDateTimeSchema,
      title: z.string(),
      dealId: idSchema.nullable(),
      amount: moneySchema.nullable(),
    }),
  ),
  /** 5. One thing worth doing next - or null when everything is fine. */
  recommendation: z
    .object({
      code: z.enum(homeRecommendationCodes),
      title: z.string(),
      body: z.string(),
      actionLabel: z.string(),
      target: homeTargetSchema,
      /** setup = something missing; issue = something wrong; suggestion = could be better. */
      kind: z.enum(['setup', 'issue', 'suggestion']),
    })
    .nullable(),
});
export type Home = z.infer<typeof homeSchema>;
export type HomeRecommendation = NonNullable<Home['recommendation']>;
