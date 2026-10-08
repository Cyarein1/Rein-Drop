import { Prisma, type PrismaClient } from '@rein-drop/db';

/**
 * Ingestion diagnostics aggregates, straight from PostgreSQL (decision 0011). System-wide (every
 * user), development only. Every query groups by (marketplace, provider) plus a totals row
 * (GROUPING SETS; `total` = 1 on it).
 *
 * Attribution: search activity by the run's own provider; candidates, analyses and alerts by the
 * search run that first produced the match; listing age by the run that first fetched the listing.
 */

export interface DiagnosticsWindow {
  since: Date;
  until: Date;
}

const inWindow = (column: Prisma.Sql, w: DiagnosticsWindow) => Prisma.sql`${column} >= ${w.since}::timestamptz AND ${column} <= ${w.until}::timestamptz`;

/** Group columns over a CTE exposing "mkey" and "provider". */
const GROUP_COLUMNS = Prisma.sql`GROUPING(x."mkey")::int AS "total", x."mkey" AS "marketplace", x."provider" AS "provider"`;
const GROUP_BY = Prisma.sql`GROUP BY GROUPING SETS ((x."mkey", x."provider"), ())`;

/** p50 / p95 / max / sample count of a nullable ms column (nulls are ignored). */
const stats = (column: Prisma.Sql, prefix: string) => Prisma.sql`
  COUNT(${column})::int AS ${Prisma.raw(`"${prefix}Samples"`)},
  percentile_cont(0.5) WITHIN GROUP (ORDER BY ${column}) AS ${Prisma.raw(`"${prefix}P50"`)},
  percentile_cont(0.95) WITHIN GROUP (ORDER BY ${column}) AS ${Prisma.raw(`"${prefix}P95"`)},
  MAX(${column})::float8 AS ${Prisma.raw(`"${prefix}Max"`)}`;

export interface GroupRow {
  total: number;
  marketplace: string | null;
  provider: string | null;
}

export type StatsRow<P extends string> = { [K in `${P}Samples`]: number } & { [K in `${P}P50` | `${P}P95` | `${P}Max`]: number | null };

export type RunRow = GroupRow &
  StatsRow<'req'> &
  StatsRow<'run'> & {
    runs: number;
    succeeded: number;
    failed: number;
    running: number;
    requests: bigint;
    returned: bigint;
    new: bigint;
    updated: bigint;
    duplicates: bigint;
    unreadable: bigint;
    matched: bigint;
    newMatches: bigint;
    rejected: bigint;
    costUsd: number | null;
    costKnownRuns: number;
    costIsEstimate: boolean | null;
  };

export type RejectionRow = GroupRow & { reason: string; count: bigint };

export type AnalysisRow = GroupRow &
  StatsRow<'ai'> & {
    analyzed: number;
    completed: number;
    failed: number;
    alertEligible: number;
    aiProviders: string[] | null;
    inputTokens: bigint | null;
    outputTokens: bigint | null;
    /** Sum of the tasks' reported cost; null when none reported one. */
    aiCostUsd: number | null;
  };

export type AlertRow = GroupRow & { alerts: number };

export type AgeRow = GroupRow & StatsRow<'age'> & { discovered: number };

export interface HuntCostRow {
  huntId: string;
  name: string | null;
  status: string | null;
  marketplace: string;
  provider: string;
  runs: number;
  costUsd: number | null;
}

/** The match's source: its listing's marketplace and the provider of the run that first produced it. */
const MATCH_SOURCE = Prisma.sql`
  JOIN "Listing" l ON l."id" = m."listingId"
  JOIN "Marketplace" mk ON mk."id" = l."marketplaceId"
  LEFT JOIN "SearchRun" fr ON fr."id" = m."firstSearchRunId"`;
const MATCH_SOURCE_COLUMNS = Prisma.sql`mk."key" AS "mkey", COALESCE(fr."provider", 'unknown') AS "provider"`;

export function diagnosticsQueries(prisma: PrismaClient, w: DiagnosticsWindow) {
  return Promise.all([
    // Search runs: requests, listings, candidates, cost, latency.
    prisma.$queryRaw<RunRow[]>(Prisma.sql`
      WITH x AS (
        SELECT mk."key" AS "mkey", r."provider", r."status"::text AS "status",
          COALESCE((r."sourceUsage" ->> 'requests')::int, r."pagesFetched") AS "requests",
          r."resultCount", r."newListingCount", r."updatedListingCount", r."duplicateCount", r."unreadableCount",
          r."matchedCount", r."newMatchCount", r."rejectedCount",
          (r."sourceUsage" ->> 'costUsd')::float8 AS "cost",
          COALESCE((r."sourceUsage" ->> 'costIsEstimate')::boolean, false) AS "estimate",
          COALESCE(r."requestLatencyMs"::float8, (r."sourceUsage" ->> 'durationMs')::float8) AS "reqMs",
          CASE WHEN r."finishedAt" IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (r."finishedAt" - r."startedAt")) * 1000)::float8 END AS "runMs"
        FROM "SearchRun" r JOIN "Marketplace" mk ON mk."id" = r."marketplaceId"
        WHERE ${inWindow(Prisma.sql`r."startedAt"`, w)}
      )
      SELECT ${GROUP_COLUMNS},
        COUNT(*)::int AS "runs",
        COUNT(*) FILTER (WHERE x."status" = 'SUCCEEDED')::int AS "succeeded",
        COUNT(*) FILTER (WHERE x."status" = 'FAILED')::int AS "failed",
        COUNT(*) FILTER (WHERE x."status" = 'RUNNING')::int AS "running",
        COALESCE(SUM(x."requests"), 0)::bigint AS "requests",
        SUM(x."resultCount")::bigint AS "returned",
        SUM(x."newListingCount")::bigint AS "new",
        SUM(x."updatedListingCount")::bigint AS "updated",
        SUM(x."duplicateCount")::bigint AS "duplicates",
        SUM(x."unreadableCount")::bigint AS "unreadable",
        SUM(x."matchedCount")::bigint AS "matched",
        SUM(x."newMatchCount")::bigint AS "newMatches",
        SUM(x."rejectedCount")::bigint AS "rejected",
        SUM(x."cost")::float8 AS "costUsd",
        COUNT(x."cost")::int AS "costKnownRuns",
        bool_or(x."estimate" AND x."cost" IS NOT NULL) AS "costIsEstimate",
        ${stats(Prisma.sql`x."reqMs"`, 'req')},
        ${stats(Prisma.sql`x."runMs"`, 'run')}
      FROM x ${GROUP_BY}`),

    // Rejections per failed check.
    prisma.$queryRaw<RejectionRow[]>(Prisma.sql`
      WITH x AS (
        SELECT mk."key" AS "mkey", r."provider", j."key" AS "reason", j."value"
        FROM "SearchRun" r
        JOIN "Marketplace" mk ON mk."id" = r."marketplaceId"
        CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(r."rejectionSummary") = 'object' THEN r."rejectionSummary" ELSE '{}'::jsonb END) j
        WHERE ${inWindow(Prisma.sql`r."startedAt"`, w)} AND j."value" ~ '^[0-9]+$'
      )
      SELECT GROUPING(x."mkey")::int AS "total", x."mkey" AS "marketplace", x."provider" AS "provider", x."reason", SUM(x."value"::bigint)::bigint AS "count"
      FROM x GROUP BY GROUPING SETS ((x."mkey", x."provider", x."reason"), (x."reason"))`),

    // AI analyses of candidates.
    prisma.$queryRaw<AnalysisRow[]>(Prisma.sql`
      WITH x AS (
        SELECT ${MATCH_SOURCE_COLUMNS}, d."status"::text AS "status", d."alertEligible", d."provider" AS "ai", d."durationMs"::float8 AS "aiMs",
          u."inputTokens", u."outputTokens", u."costUsd"
        FROM "DealAnalysis" d
        JOIN "HuntMatch" m ON m."id" = d."huntMatchId"
        ${MATCH_SOURCE}
        LEFT JOIN LATERAL (
          SELECT SUM((t."value" -> 'usage' ->> 'inputTokens')::bigint) AS "inputTokens", SUM((t."value" -> 'usage' ->> 'outputTokens')::bigint) AS "outputTokens",
            SUM((t."value" ->> 'costUsd')::float8) AS "costUsd"
          FROM jsonb_each(CASE WHEN jsonb_typeof(d."providerMetadata" -> 'tasks') = 'object' THEN d."providerMetadata" -> 'tasks' ELSE '{}'::jsonb END) t
        ) u ON TRUE
        WHERE ${inWindow(Prisma.sql`d."createdAt"`, w)}
      )
      SELECT ${GROUP_COLUMNS},
        COUNT(*)::int AS "analyzed",
        COUNT(*) FILTER (WHERE x."status" = 'COMPLETED')::int AS "completed",
        COUNT(*) FILTER (WHERE x."status" = 'FAILED')::int AS "failed",
        COUNT(*) FILTER (WHERE x."alertEligible")::int AS "alertEligible",
        array_agg(DISTINCT x."ai") AS "aiProviders",
        SUM(x."inputTokens")::bigint AS "inputTokens",
        SUM(x."outputTokens")::bigint AS "outputTokens",
        SUM(x."costUsd")::float8 AS "aiCostUsd",
        ${stats(Prisma.sql`x."aiMs"`, 'ai')}
      FROM x ${GROUP_BY}`),

    // Alerts for candidates.
    prisma.$queryRaw<AlertRow[]>(Prisma.sql`
      WITH x AS (
        SELECT ${MATCH_SOURCE_COLUMNS}
        FROM "Alert" a
        JOIN "HuntMatch" m ON m."id" = a."huntMatchId"
        ${MATCH_SOURCE}
        WHERE ${inWindow(Prisma.sql`a."createdAt"`, w)}
      )
      SELECT ${GROUP_COLUMNS}, COUNT(*)::int AS "alerts" FROM x ${GROUP_BY}`),

    // Listing age at discovery (first seen - posted), listings first seen in the window.
    prisma.$queryRaw<AgeRow[]>(Prisma.sql`
      WITH x AS (
        SELECT mk."key" AS "mkey", COALESCE(f."provider", 'unknown') AS "provider",
          CASE WHEN l."listedAt" IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (l."firstSeenAt" - l."listedAt")) * 1000)::float8 END AS "ageMs"
        FROM "Listing" l
        JOIN "Marketplace" mk ON mk."id" = l."marketplaceId"
        LEFT JOIN LATERAL (
          SELECT r."provider" FROM "RawListing" rl JOIN "SearchRun" r ON r."id" = rl."searchRunId"
          WHERE rl."listingId" = l."id" ORDER BY rl."fetchedAt" LIMIT 1
        ) f ON TRUE
        WHERE ${inWindow(Prisma.sql`l."firstSeenAt"`, w)}
      )
      SELECT ${GROUP_COLUMNS}, COUNT(*)::int AS "discovered", ${stats(Prisma.sql`x."ageMs"`, 'age')}
      FROM x ${GROUP_BY}`),

    // Each Hunt's share of the runs and their cost (a grouped run is split evenly).
    prisma.$queryRaw<HuntCostRow[]>(Prisma.sql`
      SELECT hid."id"::text AS "huntId", h."name", h."status"::text AS "status", mk."key" AS "marketplace", r."provider",
        COUNT(*)::int AS "runs",
        SUM((r."sourceUsage" ->> 'costUsd')::float8 / cardinality(r."huntIds"))::float8 AS "costUsd"
      FROM "SearchRun" r
      JOIN "Marketplace" mk ON mk."id" = r."marketplaceId"
      CROSS JOIN LATERAL unnest(r."huntIds") AS hid("id")
      LEFT JOIN "Hunt" h ON h."id" = hid."id"
      WHERE ${inWindow(Prisma.sql`r."startedAt"`, w)}
      GROUP BY hid."id", h."name", h."status", mk."key", r."provider"`),
  ]);
}
