import { Prisma, type PrismaClient } from '@rein-drop/db';

/**
 * Analytics aggregates, straight from PostgreSQL (no warehouse, no copies). Every query is
 * scoped to one user and one window [since, until].
 *
 * Realized profit here is the same formula as `realizedResult` in @rein-drop/contracts:
 *   sale price - selling costs - purchase price - purchase costs,
 * only for sales where the purchase, the sale and every cost share a currency ("comparable").
 * The integration test checks the SQL against the TypeScript formula.
 */

export interface Window {
  userId: string;
  since: Date;
  until: Date;
}

/** Postgres bigint / numeric come back as bigint / string; amounts here always fit a JS number. */
export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

const inWindow = (column: Prisma.Sql, w: Window) => Prisma.sql`${column} >= ${w.since}::timestamptz AND ${column} <= ${w.until}::timestamptz`;
const HOLDING = Prisma.sql`('IN_STOCK', 'LISTED')`;

/**
 * item: one row per inventory item with its purchase costs (same currency) summed.
 * sold: one row per sale, joined to its item, with selling costs summed and the comparable flag.
 * product: the item's product name (AI-normalized when known, else the title).
 */
function ledger(w: Window): Prisma.Sql {
  return Prisma.sql`
    item AS (
      SELECT i."id", i."currency", i."purchasePriceMinor"::bigint AS "price", i."purchasedAt", i."status"::text AS "status",
        i."huntMatchId", i."listingId", i."title",
        COALESCE(SUM(c."amountMinor") FILTER (WHERE c."currency" = i."currency"), 0)::bigint AS "pcosts",
        COUNT(c."id") FILTER (WHERE c."currency" <> i."currency")::int AS "pcostsOther"
      FROM "InventoryItem" i
      LEFT JOIN "Cost" c ON c."inventoryItemId" = i."id" AND c."saleId" IS NULL
      WHERE i."userId" = ${w.userId}::uuid
      GROUP BY i."id"
    ),
    sale AS (
      SELECT s."id", s."inventoryItemId", s."currency", s."salePriceMinor"::bigint AS "price", s."soldAt", s."marketplaceId",
        COALESCE(SUM(c."amountMinor") FILTER (WHERE c."currency" = s."currency"), 0)::bigint AS "scosts",
        COUNT(c."id") FILTER (WHERE c."currency" <> s."currency")::int AS "scostsOther"
      FROM "Sale" s
      LEFT JOIN "Cost" c ON c."saleId" = s."id"
      WHERE s."userId" = ${w.userId}::uuid
      GROUP BY s."id"
    ),
    sold AS (
      SELECT sale."id", sale."inventoryItemId", sale."currency", sale."price", sale."scosts", sale."soldAt", sale."marketplaceId",
        item."price" AS "buy", item."pcosts", item."huntMatchId", item."listingId",
        (item."currency" = sale."currency" AND item."pcostsOther" = 0 AND sale."scostsOther" = 0) AS "comparable",
        EXTRACT(EPOCH FROM (sale."soldAt" - item."purchasedAt")) / 86400.0 AS "days"
      FROM sale JOIN item ON item."id" = sale."inventoryItemId"
      WHERE ${inWindow(Prisma.sql`sale."soldAt"`, w)}
    ),
    product AS (
      SELECT item."id",
        COALESCE(NULLIF(TRIM(pa."name"), ''), item."title") AS "name"
      FROM item
      LEFT JOIN LATERAL (
        SELECT d."result" -> 'product' ->> 'normalizedName' AS "name"
        FROM "DealAnalysis" d
        WHERE item."huntMatchId" IS NOT NULL AND d."huntMatchId" = item."huntMatchId" AND d."result" IS NOT NULL
        ORDER BY d."completedAt" DESC NULLS LAST, d."createdAt" DESC
        LIMIT 1
      ) pa ON TRUE
    )`;
}

/** Realized aggregate columns over `sold` (use with GROUP BY ..., sold."currency"). */
const REALIZED = Prisma.sql`
  sold."currency" AS "currency",
  COUNT(*)::int AS "sales",
  SUM(sold."price")::bigint AS "revenue",
  SUM(sold."scosts")::bigint AS "sellingCosts",
  COUNT(*) FILTER (WHERE sold."comparable")::int AS "comparable",
  COUNT(*) FILTER (WHERE NOT sold."comparable")::int AS "excluded",
  COALESCE(SUM(sold."price" - sold."scosts" - sold."buy" - sold."pcosts") FILTER (WHERE sold."comparable"), 0)::bigint AS "profit",
  COALESCE(SUM(sold."price") FILTER (WHERE sold."comparable"), 0)::bigint AS "comparableRevenue",
  SUM(sold."days")::float8 AS "daysTotal"`;

export interface RealizedRow {
  currency: string;
  sales: number;
  revenue: bigint;
  sellingCosts: bigint;
  comparable: number;
  excluded: number;
  profit: bigint;
  comparableRevenue: bigint;
  daysTotal: number | null;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function overviewQueries(prisma: PrismaClient, w: Window) {
  return Promise.all([
    prisma.$queryRaw<{ currency: string; buys: number; spent: bigint }[]>(Prisma.sql`
      WITH ${ledger(w)}
      SELECT item."currency", COUNT(*)::int AS "buys", SUM(item."price" + item."pcosts")::bigint AS "spent"
      FROM item WHERE ${inWindow(Prisma.sql`item."purchasedAt"`, w)}
      GROUP BY item."currency" ORDER BY item."currency"`),
    prisma.$queryRaw<RealizedRow[]>(Prisma.sql`
      WITH ${ledger(w)}
      SELECT ${REALIZED} FROM sold GROUP BY sold."currency" ORDER BY sold."currency"`),
    prisma.$queryRaw<{ currency: string; count: number; costBasis: bigint; oldestDays: number }[]>(Prisma.sql`
      WITH ${ledger(w)}
      SELECT item."currency", COUNT(*)::int AS "count", SUM(item."price" + item."pcosts")::bigint AS "costBasis",
        FLOOR(MAX(EXTRACT(EPOCH FROM (${w.until}::timestamptz - item."purchasedAt")) / 86400.0))::int AS "oldestDays"
      FROM item WHERE item."status" IN ${HOLDING}
      GROUP BY item."currency" ORDER BY item."currency"`),
  ]);
}

// ---------------------------------------------------------------------------
// Hunt funnel
// ---------------------------------------------------------------------------

export interface FunnelRow {
  huntId: string;
  name: string;
  status: string;
  found: number;
  alerted: number;
  viewed: number;
  saved: number;
  ignored: number;
  bought: number;
}

export function huntQueries(prisma: PrismaClient, w: Window) {
  return Promise.all([
    prisma.$queryRaw<FunnelRow[]>(Prisma.sql`
      SELECT h."id"::text AS "huntId", h."name", h."status"::text AS "status",
        (SELECT COUNT(*) FROM "HuntMatch" m WHERE m."huntId" = h."id" AND ${inWindow(Prisma.sql`m."matchedAt"`, w)})::int AS "found",
        (SELECT COUNT(*) FROM "Alert" a WHERE a."huntId" = h."id" AND ${inWindow(Prisma.sql`a."createdAt"`, w)})::int AS "alerted",
        (SELECT COUNT(*) FROM "HuntMatch" m WHERE m."huntId" = h."id" AND ${inWindow(Prisma.sql`m."seenAt"`, w)})::int AS "viewed",
        (SELECT COUNT(*) FROM "SavedDeal" s JOIN "HuntMatch" m ON m."id" = s."huntMatchId"
          WHERE m."huntId" = h."id" AND ${inWindow(Prisma.sql`s."createdAt"`, w)})::int AS "saved",
        (SELECT COUNT(*) FROM "HuntMatch" m WHERE m."huntId" = h."id" AND m."status" = 'DISMISSED' AND ${inWindow(Prisma.sql`m."dismissedAt"`, w)})::int AS "ignored",
        (SELECT COUNT(*) FROM "InventoryItem" i JOIN "HuntMatch" m ON m."id" = i."huntMatchId"
          WHERE m."huntId" = h."id" AND ${inWindow(Prisma.sql`i."purchasedAt"`, w)})::int AS "bought"
      FROM "Hunt" h
      WHERE h."userId" = ${w.userId}::uuid
      ORDER BY h."createdAt"`),
    prisma.$queryRaw<(RealizedRow & { huntId: string })[]>(Prisma.sql`
      WITH ${ledger(w)}
      SELECT m."huntId"::text AS "huntId", ${REALIZED}
      FROM sold JOIN "HuntMatch" m ON m."id" = sold."huntMatchId"
      GROUP BY m."huntId", sold."currency"`),
  ]);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const PRODUCT_KEY = Prisma.sql`LOWER(product."name")`;

export function productQueries(prisma: PrismaClient, w: Window) {
  return Promise.all([
    prisma.$queryRaw<{ key: string; name: string; currency: string; bought: number; spent: bigint; holding: number }[]>(Prisma.sql`
      WITH ${ledger(w)}
      SELECT ${PRODUCT_KEY} AS "key", MIN(product."name") AS "name", item."currency",
        COUNT(*) FILTER (WHERE ${inWindow(Prisma.sql`item."purchasedAt"`, w)})::int AS "bought",
        COALESCE(SUM(item."price" + item."pcosts") FILTER (WHERE ${inWindow(Prisma.sql`item."purchasedAt"`, w)}), 0)::bigint AS "spent",
        COUNT(*) FILTER (WHERE item."status" IN ${HOLDING})::int AS "holding"
      FROM item JOIN product ON product."id" = item."id"
      GROUP BY ${PRODUCT_KEY}, item."currency"`),
    prisma.$queryRaw<(RealizedRow & { key: string; name: string })[]>(Prisma.sql`
      WITH ${ledger(w)}
      SELECT ${PRODUCT_KEY} AS "key", MIN(product."name") AS "name", ${REALIZED}
      FROM sold JOIN product ON product."id" = sold."inventoryItemId"
      GROUP BY ${PRODUCT_KEY}, sold."currency"`),
  ]);
}

// ---------------------------------------------------------------------------
// Marketplaces
// ---------------------------------------------------------------------------

/** The marketplace a listing came from; 'other' when there is none. */
const SOURCE_KEY = (listingId: Prisma.Sql) =>
  Prisma.sql`COALESCE((SELECT mk."key" FROM "Listing" l JOIN "Marketplace" mk ON mk."id" = l."marketplaceId" WHERE l."id" = ${listingId}), 'other')`;

export function marketplaceQueries(prisma: PrismaClient, w: Window) {
  return Promise.all([
    prisma.$queryRaw<{ key: string; found: number }[]>(Prisma.sql`
      SELECT mk."key", COUNT(*)::int AS "found"
      FROM "HuntMatch" m JOIN "Hunt" h ON h."id" = m."huntId" JOIN "Listing" l ON l."id" = m."listingId" JOIN "Marketplace" mk ON mk."id" = l."marketplaceId"
      WHERE h."userId" = ${w.userId}::uuid AND ${inWindow(Prisma.sql`m."matchedAt"`, w)}
      GROUP BY mk."key"`),
    prisma.$queryRaw<{ key: string; alerted: number }[]>(Prisma.sql`
      SELECT mk."key", COUNT(*)::int AS "alerted"
      FROM "Alert" a JOIN "HuntMatch" m ON m."id" = a."huntMatchId" JOIN "Listing" l ON l."id" = m."listingId" JOIN "Marketplace" mk ON mk."id" = l."marketplaceId"
      WHERE a."userId" = ${w.userId}::uuid AND ${inWindow(Prisma.sql`a."createdAt"`, w)}
      GROUP BY mk."key"`),
    prisma.$queryRaw<{ key: string; bought: number }[]>(Prisma.sql`
      WITH ${ledger(w)}
      SELECT ${SOURCE_KEY(Prisma.sql`item."listingId"`)} AS "key", COUNT(*)::int AS "bought"
      FROM item WHERE ${inWindow(Prisma.sql`item."purchasedAt"`, w)}
      GROUP BY 1`),
    prisma.$queryRaw<(RealizedRow & { key: string })[]>(Prisma.sql`
      WITH ${ledger(w)}
      SELECT ${SOURCE_KEY(Prisma.sql`sold."listingId"`)} AS "key", ${REALIZED}
      FROM sold GROUP BY 1, sold."currency"`),
    prisma.$queryRaw<{ key: string; currency: string; sales: number; revenue: bigint }[]>(Prisma.sql`
      WITH ${ledger(w)}
      SELECT COALESCE(mk."key", 'other') AS "key", sold."currency", COUNT(*)::int AS "sales", SUM(sold."price")::bigint AS "revenue"
      FROM sold LEFT JOIN "Marketplace" mk ON mk."id" = sold."marketplaceId"
      GROUP BY 1, sold."currency"`),
  ]);
}

// ---------------------------------------------------------------------------
// Missed potential (never part of P/L)
// ---------------------------------------------------------------------------

export const MISSED_ITEMS = 20;
const MISSED_STRENGTHS = Prisma.sql`('strong', 'exceptional')`;

/**
 * Strong / exceptional deals (latest analysis) found in the window, never bought, and no longer
 * open: ignored by the user, expired, or the listing is gone (sold / removed / ended).
 */
function missed(w: Window): Prisma.Sql {
  return Prisma.sql`
    missed AS (
      SELECT m."id", l."title", h."id" AS "huntId", h."name" AS "huntName", mk."key" AS "marketplace", m."matchedAt", a."strength",
        CASE WHEN m."status" = 'DISMISSED' THEN 'ignored' ELSE 'gone' END AS "reason",
        CASE WHEN a."economics" -> 'estimatedUpside' ->> 'status' = 'estimated'
          THEN (a."economics" -> 'estimatedUpside' -> 'typical' ->> 'amountMinor')::bigint END AS "upside",
        CASE WHEN a."economics" -> 'estimatedUpside' ->> 'status' = 'estimated'
          THEN a."economics" -> 'estimatedUpside' -> 'typical' ->> 'currency' END AS "upsideCurrency"
      FROM "HuntMatch" m
      JOIN "Hunt" h ON h."id" = m."huntId"
      JOIN "Listing" l ON l."id" = m."listingId"
      JOIN "Marketplace" mk ON mk."id" = l."marketplaceId"
      JOIN LATERAL (
        SELECT d."strength", d."economics" FROM "DealAnalysis" d
        WHERE d."huntMatchId" = m."id"
        ORDER BY d."completedAt" DESC NULLS LAST, d."createdAt" DESC
        LIMIT 1
      ) a ON TRUE
      WHERE h."userId" = ${w.userId}::uuid
        AND ${inWindow(Prisma.sql`m."matchedAt"`, w)}
        AND a."strength" IN ${MISSED_STRENGTHS}
        AND m."status" <> 'BOUGHT'
        AND (m."status" IN ('DISMISSED', 'EXPIRED') OR l."status" NOT IN ('ACTIVE', 'UNKNOWN'))
    )`;
}

export function missedQueries(prisma: PrismaClient, w: Window) {
  return Promise.all([
    prisma.$queryRaw<{ count: number; gone: number; ignored: number; withEstimate: number }[]>(Prisma.sql`
      WITH ${missed(w)}
      SELECT COUNT(*)::int AS "count",
        COUNT(*) FILTER (WHERE "reason" = 'gone')::int AS "gone",
        COUNT(*) FILTER (WHERE "reason" = 'ignored')::int AS "ignored",
        COUNT("upside")::int AS "withEstimate"
      FROM missed`),
    prisma.$queryRaw<{ currency: string; potential: bigint }[]>(Prisma.sql`
      WITH ${missed(w)}
      SELECT "upsideCurrency" AS "currency", SUM("upside")::bigint AS "potential"
      FROM missed WHERE "upside" IS NOT NULL
      GROUP BY "upsideCurrency" ORDER BY "upsideCurrency"`),
    prisma.$queryRaw<
      { id: string; title: string; huntId: string; huntName: string; marketplace: string; matchedAt: Date; strength: string; reason: string; upside: bigint | null; upsideCurrency: string | null }[]
    >(Prisma.sql`
      WITH ${missed(w)}
      SELECT "id"::text AS "id", "title", "huntId"::text AS "huntId", "huntName", "marketplace", "matchedAt", "strength", "reason", "upside", "upsideCurrency"
      FROM missed
      ORDER BY "upside" DESC NULLS LAST, "matchedAt" DESC
      LIMIT ${MISSED_ITEMS}`),
  ]);
}
