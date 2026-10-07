import type { HuntActivity, MarketplaceKey } from '@rein-drop/contracts';
import { Prisma, type PrismaClient } from '@rein-drop/db';

interface CountRow {
  huntId: string;
  deals: number;
  toReview: number;
  new: number;
  saved: number;
  bought: number;
}

/**
 * Monitoring state (per enabled marketplace, from the worker's polling metadata) and simple
 * performance counts for some or all of a user's hunts. Read-only composition over HuntMatch,
 * Listing, SavedDeal and Alert - two queries plus one for the hunts, whatever the number of hunts.
 */
export async function loadHuntActivity(prisma: PrismaClient, userId: string, huntIds?: string[]): Promise<HuntActivity[]> {
  const hunts = await prisma.hunt.findMany({
    where: { userId, ...(huntIds ? { id: { in: huntIds } } : {}) },
    select: {
      id: true,
      status: true,
      marketplaces: {
        where: { isEnabled: true },
        select: { lastPolledAt: true, lastPollStatus: true, consecutiveFailures: true, nextPollAt: true, marketplace: { select: { key: true } } },
        orderBy: { marketplace: { key: 'asc' } },
      },
    },
  });
  if (hunts.length === 0) return [];
  const ids = hunts.map((h) => h.id);

  const [counts, alerts] = await Promise.all([
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT m."huntId"::text AS "huntId",
        count(*) FILTER (WHERE m."status" <> 'EXPIRED')::int AS "deals",
        count(*) FILTER (WHERE m."status" IN ('NEW', 'SEEN') AND l."status" IN ('ACTIVE', 'UNKNOWN'))::int AS "toReview",
        count(*) FILTER (WHERE m."status" = 'NEW' AND l."status" IN ('ACTIVE', 'UNKNOWN'))::int AS "new",
        count(*) FILTER (WHERE m."status" IN ('NEW', 'SEEN') AND EXISTS (
          SELECT 1 FROM "SavedDeal" s WHERE s."userId" = ${userId}::uuid AND s."listingId" = m."listingId"))::int AS "saved",
        count(*) FILTER (WHERE m."status" = 'BOUGHT')::int AS "bought"
      FROM "HuntMatch" m
      JOIN "Listing" l ON l."id" = m."listingId"
      WHERE m."huntId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY m."huntId"`),
    prisma.alert.groupBy({ by: ['huntId'], where: { userId, huntId: { in: ids } }, _count: { _all: true } }),
  ]);
  const countsBy = new Map(counts.map((c) => [c.huntId, c]));
  const alertsBy = new Map(alerts.map((a) => [a.huntId, a._count._all]));

  return hunts.map((hunt) => {
    const marketplaces = hunt.marketplaces.map((m) => ({
      marketplace: m.marketplace.key as MarketplaceKey,
      lastCheckedAt: m.lastPolledAt?.toISOString() ?? null,
      lastCheck: m.lastPollStatus === 'SUCCEEDED' ? ('ok' as const) : m.lastPollStatus === 'FAILED' ? ('failed' as const) : null,
      failingChecks: m.consecutiveFailures,
      nextCheckAt: hunt.status === 'LIVE' ? (m.nextPollAt?.toISOString() ?? null) : null,
    }));
    const checked = marketplaces.map((m) => m.lastCheckedAt).filter((d): d is string => d !== null).sort();
    const c = countsBy.get(hunt.id);
    return {
      huntId: hunt.id,
      scanning: hunt.status === 'LIVE' && marketplaces.some((m) => m.lastCheckedAt === null),
      lastCheckedAt: checked.at(-1) ?? null,
      marketplaces,
      counts: {
        deals: c?.deals ?? 0,
        toReview: c?.toReview ?? 0,
        new: c?.new ?? 0,
        alerts: alertsBy.get(hunt.id) ?? 0,
        saved: c?.saved ?? 0,
        bought: c?.bought ?? 0,
      },
    };
  });
}
