import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';

/**
 * INTERNAL development diagnostics: ingestion economics and freshness per marketplace source
 * (decision 0011). System-wide (every user's Hunts), so it is NOT customer analytics: served only
 * outside production (`GET /dev/diagnostics/ingestion`, 404 in production).
 *
 * Answers: what does one active Hunt cost, how fresh are results, how much noise is filtered.
 * Everything is computed live from SearchRun / Listing / HuntMatch / DealAnalysis / Alert rows.
 */

export const DIAGNOSTICS_MAX_HOURS = 24 * 90;

/** `?hours=24` (rolling window ending now), or an explicit `?since=&until=` test window. */
export const ingestionDiagnosticsQuerySchema = z
  .object({
    hours: z.coerce.number().int().min(1).max(DIAGNOSTICS_MAX_HOURS).default(24),
    /** Start of an explicit window (overrides `hours`). */
    since: isoDateTimeSchema.optional(),
    /** End of an explicit window; defaults to now. */
    until: isoDateTimeSchema.optional(),
  })
  .refine((q) => !q.until || q.since, { message: 'until needs since', path: ['until'] })
  .refine((q) => !q.since || new Date(q.since).getTime() < (q.until ? new Date(q.until).getTime() : Date.now()), {
    message: 'since must be before until',
    path: ['since'],
  })
  .refine((q) => !q.since || (q.until ? new Date(q.until).getTime() : Date.now()) - new Date(q.since).getTime() <= DIAGNOSTICS_MAX_HOURS * 3_600_000, {
    message: `The window can be at most ${DIAGNOSTICS_MAX_HOURS / 24} days`,
    path: ['since'],
  });
export type IngestionDiagnosticsQuery = z.infer<typeof ingestionDiagnosticsQuerySchema>;
export type IngestionDiagnosticsQueryInput = z.input<typeof ingestionDiagnosticsQuerySchema>;

const count = z.number().int().nonnegative();

/** Distribution of a duration, ms. Null percentiles when there are no samples. */
export const durationStatsSchema = z.object({
  samples: count,
  p50Ms: z.number().nullable(),
  p95Ms: z.number().nullable(),
  maxMs: z.number().nullable(),
});
export type DurationStats = z.infer<typeof durationStatsSchema>;

export const sourceDiagnosticsSchema = z.object({
  /** Marketplace key; "all" on the totals row. */
  marketplace: z.string(),
  /** Adapter / data provider that ran the searches (e.g. "dev", "ebay-browse", "apify-marketplace"); "all" on totals. */
  provider: z.string(),
  /** Search runs started in the window. */
  runs: z.object({ total: count, succeeded: count, failed: count, running: count }),
  /** Requests sent to the source (reported usage; pages fetched when a run reported none). */
  requests: count,
  /** Distinct Hunts these searches served (grouped searches serve several). */
  huntsServed: count,
  listings: z.object({
    /** Results returned by the source (every run, repeats included). */
    returned: count,
    /** Listings Rein Drop had never seen before. */
    new: count,
    /** Already-known listings refreshed. */
    updated: count,
    /** Skipped as duplicates of another listing. */
    duplicates: count,
    /** Records that failed or were skipped during normalization. */
    unreadable: count,
  }),
  candidates: z.object({
    /** (Hunt, listing) pairs checked by the deterministic matcher, repeats included. */
    evaluated: count,
    /** Pairs that matched (repeats included). */
    matched: count,
    /** Matches seen for the first time (new candidates). */
    newMatches: count,
    /** Pairs rejected by a deterministic check. */
    rejected: count,
    /** Rejections per failed check, most frequent first. */
    rejectionReasons: z.array(z.object({ reason: z.string(), count })),
  }),
  analysis: z.object({
    /** AI analyses of this source's candidates made in the window. */
    analyzed: count,
    completed: count,
    failed: count,
    /** Analyses that made the candidate alert-eligible. */
    alertEligible: count,
    /** AIProvider ids that ran them. */
    aiProviders: z.array(z.string()),
    /** Token totals; null when no provider reported usage (e.g. the mock). */
    inputTokens: count.nullable(),
    outputTokens: count.nullable(),
    duration: durationStatsSchema,
  }),
  /** Alerts created for this source's candidates in the window. */
  alerts: count,
  latency: z.object({
    /** Slowest source request per run, measured by the worker. */
    request: durationStatsSchema,
    /** Whole search run: fetch, normalize, deduplicate, match. */
    run: durationStatsSchema,
  }),
  /** Time from the seller posting to Rein Drop first seeing it, for listings first seen in the window. */
  listingAge: z.object({
    discovered: count,
    /** Listings whose source exposes a posting time (the rest can't be measured). */
    withPostedTime: count,
    age: durationStatsSchema,
  }),
  cost: z.object({
    /** Source cost in USD; null when no run reported one (free, quota-based or unknown). */
    providerUsd: z.number().nullable(),
    /** True when any of it is computed from published pricing rather than billed. */
    providerIsEstimate: z.boolean(),
    runsWithKnownCost: count,
    runsWithUnknownCost: count,
    /** AI cost in USD as the AI provider reported it (Foundry with pricing configured); null = unknown. */
    aiUsd: z.number().nullable(),
    perRunUsd: z.number().nullable(),
    perNewMatchUsd: z.number().nullable(),
    perAlertUsd: z.number().nullable(),
    /** Known cost / Hunts served / window days: what one active Hunt costs per day on this source. */
    perHuntDayUsd: z.number().nullable(),
  }),
});
export type SourceDiagnostics = z.infer<typeof sourceDiagnosticsSchema>;

/** One Hunt's share of the search cost (a grouped run's cost is split evenly between its Hunts). */
export const huntCostSchema = z.object({
  huntId: z.string(),
  name: z.string(),
  status: z.string(),
  marketplace: z.string(),
  provider: z.string(),
  runs: count,
  costUsd: z.number().nullable(),
  perDayUsd: z.number().nullable(),
});
export type HuntCost = z.infer<typeof huntCostSchema>;

export const HUNT_COST_ITEMS = 50;

export const ingestionDiagnosticsSchema = z.object({
  window: z.object({ since: isoDateTimeSchema, until: isoDateTimeSchema, hours: z.number().positive() }),
  /** One row per (marketplace, provider) that searched in the window. */
  sources: z.array(sourceDiagnosticsSchema),
  /** All sources together. */
  total: sourceDiagnosticsSchema,
  /** Most expensive Hunt/source pairs first (at most HUNT_COST_ITEMS). */
  hunts: z.array(huntCostSchema),
  generatedAt: isoDateTimeSchema,
});
export type IngestionDiagnostics = z.infer<typeof ingestionDiagnosticsSchema>;
