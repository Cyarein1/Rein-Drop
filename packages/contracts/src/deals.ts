import { z } from 'zod';
import { idSchema, isoDateTimeSchema, pageQuerySchema, pageSchema } from './common.js';
import { listingDetailSchema, listingSummarySchema } from './listings.js';

/**
 * A "deal" is a listing surfaced to the seller by one of their hunts - i.e. a
 * HuntMatch, together with its listing and the latest AI analysis.
 * `id` is the HuntMatch id.
 */

/**
 * Mirrors the HuntMatchStatus database enum (checked by a test in apps/api).
 * EXPIRED = the system found the listing no longer matches (sold, price raised, duplicate).
 */
export const DEAL_MATCH_STATUSES = ['NEW', 'SEEN', 'DISMISSED', 'EXPIRED'] as const;
export const dealMatchStatusSchema = z.enum(DEAL_MATCH_STATUSES);
export type DealMatchStatus = z.infer<typeof dealMatchStatusSchema>;

/** Mirrors the DealAnalysisStatus database enum (checked by a test in apps/api). */
export const DEAL_ANALYSIS_STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const;
export const dealAnalysisStatusSchema = z.enum(DEAL_ANALYSIS_STATUSES);
export type DealAnalysisStatus = z.infer<typeof dealAnalysisStatusSchema>;

const dealAnalysisSummarySchema = z.object({
  status: dealAnalysisStatusSchema,
  completedAt: isoDateTimeSchema.nullable(),
});

/** Card/list view. `GET /deals`. */
export const dealSummarySchema = z.object({
  id: idSchema,
  hunt: z.object({ id: idSchema, name: z.string() }),
  matchStatus: dealMatchStatusSchema,
  matchedAt: isoDateTimeSchema,
  isSaved: z.boolean(),
  listing: listingSummarySchema,
  /** Latest analysis, or null if none has been requested yet. */
  analysis: dealAnalysisSummarySchema.nullable(),
});
export type DealSummary = z.infer<typeof dealSummarySchema>;

/** Detail view. `GET /deals/:id`. */
export const dealDetailSchema = dealSummarySchema.extend({
  listing: listingDetailSchema,
  analysis: dealAnalysisSummarySchema
    .extend({
      /**
       * TODO(ai): structured analysis output is defined together with the
       * AIProvider interface. Until then it is opaque and must not be relied on.
       */
      result: z.unknown().nullable(),
    })
    .nullable(),
});
export type DealDetail = z.infer<typeof dealDetailSchema>;

/** `GET /deals` query. */
export const listDealsQuerySchema = pageQuerySchema.extend({
  huntId: idSchema.optional(),
  matchStatus: dealMatchStatusSchema.optional(),
});
export type ListDealsQuery = z.infer<typeof listDealsQuerySchema>;
export type ListDealsQueryInput = z.input<typeof listDealsQuerySchema>;

export const dealPageSchema = pageSchema(dealSummarySchema);
