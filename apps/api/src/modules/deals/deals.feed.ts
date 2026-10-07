import type { DealStatusFilter, MarketplaceKey } from '@rein-drop/contracts';
import { Prisma, type PrismaClient } from '@rein-drop/db';
import { FEED_RANKING } from '@rein-drop/scoring';
import { ValidationFailedException } from '../../common/errors/app.exception.js';

/**
 * The ranked deal feed query. Order = strength first, freshness second (FEED_RANKING /
 * feedRank in @rein-drop/scoring - this SQL computes the same formula; the integration test
 * checks they agree). Keyset pagination over (rank, id).
 *
 * Rank depends on "now", so the first page pins it in the cursor: later pages use the same
 * instant and the order can't shift while the user scrolls.
 */

export interface FeedCursor {
  asOf: Date;
  /** Rank of the last item, exactly as the database rounded it. */
  rank: string;
  id: string;
}

export interface FeedFilter {
  userId: string;
  huntId?: string;
  marketplace?: MarketplaceKey;
  status: DealStatusFilter;
}

export function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify({ a: cursor.asOf.toISOString(), r: cursor.rank, i: cursor.id })).toString('base64url');
}

export function decodeCursor(text: string): FeedCursor {
  const invalid = () => new ValidationFailedException([{ path: 'query.cursor', message: 'Invalid cursor - start again from the first page' }]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  const { a, r, i } = (parsed ?? {}) as Record<string, unknown>;
  if (typeof a !== 'string' || typeof r !== 'string' || typeof i !== 'string') throw invalid();
  const asOf = new Date(a);
  if (Number.isNaN(asOf.getTime()) || !/^\d{1,4}(\.\d{1,4})?$/.test(r) || !/^[0-9a-f-]{36}$/i.test(i)) throw invalid();
  return { asOf, rank: r, id: i };
}

const AVAILABLE = Prisma.sql`l."status" IN ('ACTIVE', 'UNKNOWN')`;
const OPEN = Prisma.sql`m."status" IN ('NEW', 'SEEN')`;
const SAVED = Prisma.sql`EXISTS (SELECT 1 FROM "SavedDeal" s WHERE s."userId" = h."userId" AND s."listingId" = m."listingId")`;

/** Same precedence as dealStatus() in deals.mapper.ts. */
function statusCondition(status: DealStatusFilter): Prisma.Sql {
  switch (status) {
    case 'open':
      return Prisma.sql`${OPEN} AND ${AVAILABLE}`;
    case 'new':
      return Prisma.sql`m."status" = 'NEW' AND ${AVAILABLE} AND NOT ${SAVED}`;
    case 'seen':
      return Prisma.sql`m."status" = 'SEEN' AND ${AVAILABLE} AND NOT ${SAVED}`;
    case 'saved':
      return Prisma.sql`${OPEN} AND ${AVAILABLE} AND ${SAVED}`;
    case 'ignored':
      return Prisma.sql`m."status" = 'DISMISSED'`;
    case 'bought':
      return Prisma.sql`m."status" = 'BOUGHT'`;
    case 'unavailable':
      return Prisma.sql`(m."status" = 'EXPIRED' OR (${OPEN} AND NOT ${AVAILABLE}))`;
    case 'all':
      return Prisma.sql`TRUE`;
  }
}

/** Ids + ranks of one page, best first. */
export async function queryFeedPage(
  prisma: PrismaClient,
  filter: FeedFilter,
  page: { limit: number; asOf: Date; after: FeedCursor | null },
): Promise<{ id: string; rank: string }[]> {
  const where: Prisma.Sql[] = [Prisma.sql`h."userId" = ${filter.userId}::uuid`, statusCondition(filter.status)];
  // Archived hunts' deals only appear when that hunt is asked for explicitly.
  where.push(filter.huntId ? Prisma.sql`m."huntId" = ${filter.huntId}::uuid` : Prisma.sql`h."status" <> 'ARCHIVED'`);
  if (filter.marketplace) where.push(Prisma.sql`mk."key" = ${filter.marketplace}`);

  const { unscoredScore, freshnessBonusMax, freshnessWindowHours } = FEED_RANKING;
  const ageHours = Prisma.sql`(EXTRACT(EPOCH FROM (${page.asOf}::timestamptz - COALESCE(l."listedAt", l."firstSeenAt"))) / 3600)`;
  const after = page.after
    ? Prisma.sql`WHERE r."rank" < ${page.after.rank}::numeric OR (r."rank" = ${page.after.rank}::numeric AND r."id" < ${page.after.id}::uuid)`
    : Prisma.empty;

  return prisma.$queryRaw<{ id: string; rank: string }[]>(Prisma.sql`
    WITH r AS (
      SELECT m."id",
        ROUND((COALESCE(a."score", ${unscoredScore}) + ${freshnessBonusMax} * GREATEST(0, LEAST(1, 1 - ${ageHours} / ${freshnessWindowHours})))::numeric, 4) AS "rank"
      FROM "HuntMatch" m
      JOIN "Hunt" h ON h."id" = m."huntId"
      JOIN "Listing" l ON l."id" = m."listingId"
      JOIN "Marketplace" mk ON mk."id" = l."marketplaceId"
      LEFT JOIN LATERAL (
        SELECT d."score" FROM "DealAnalysis" d
        WHERE d."huntMatchId" = m."id"
        ORDER BY d."completedAt" DESC NULLS LAST, d."createdAt" DESC
        LIMIT 1
      ) a ON TRUE
      WHERE ${Prisma.join(where, ' AND ')}
    )
    SELECT r."id"::text AS "id", r."rank"::text AS "rank" FROM r
    ${after}
    ORDER BY r."rank" DESC, r."id" DESC
    LIMIT ${page.limit + 1}
  `);
}
