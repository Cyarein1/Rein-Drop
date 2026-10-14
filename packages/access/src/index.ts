import { ENTITLEMENT_KEYS } from '@rein-drop/contracts';
import type { Prisma, PrismaClient, SubscriptionStatus } from '@rein-drop/db';

/**
 * Account access, decided on the server only (decision 0018 phase A). Shared by the API (requests,
 * billing webhooks) and the worker (monitoring, scheduled access sweep) so both apply exactly the
 * same rules - hiding a feature in an app is never the enforcement.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Statuses that grant the plan's entitlements. PAST_DUE keeps access while the provider retries the
 * renewal payment (D36). UNPAID (retries exhausted), INCOMPLETE, PAUSED, CANCELED and EXPIRED don't.
 */
export const ENTITLED_STATUSES: SubscriptionStatus[] = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

/** A subscription that grants access right now: entitled status, period not over, plan active. */
export const currentSubscriptionWhere = (userId: string, now = new Date()): Prisma.SubscriptionWhereInput => ({
  userId,
  status: { in: ENTITLED_STATUSES },
  OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
  plan: { isActive: true },
});

/** The plan the user is on now: their current subscription's plan, otherwise the free plan (null if unseeded). */
export async function effectivePlanId(db: Db, userId: string, now = new Date()): Promise<string | null> {
  const sub = await db.subscription.findFirst({ where: currentSubscriptionWhere(userId, now), orderBy: { createdAt: 'desc' }, select: { planId: true } });
  if (sub) return sub.planId;
  return (await db.plan.findFirst({ where: { isFree: true, isActive: true }, select: { id: true } }))?.id ?? null;
}

/** Live Hunts the user's plan allows now; null = unlimited. 0 when plans aren't seeded (nothing is monitored). */
export async function activeHuntLimit(db: Db, userId: string, now = new Date()): Promise<number | null> {
  const planId = await effectivePlanId(db, userId, now);
  if (!planId) return 0;
  const entitlement = await db.entitlement.findUnique({ where: { planId_key: { planId, key: ENTITLEMENT_KEYS.activeHuntsMax } }, select: { limit: true } });
  return entitlement ? entitlement.limit : 0;
}

/**
 * Pauses the user's LIVE Hunts above their plan's live limit - the most recently started first, the
 * longest-running stay live. A system action recorded in each Hunt's history ({ reason:
 * 'plan_limit' }); nothing is deleted. Idempotent. Takes the same per-user lock as going live, so an
 * activation can't slip in between the count and the pause. Returns the paused Hunt ids.
 */
export async function enforceActiveHuntLimit(prisma: PrismaClient, userId: string, now = new Date()): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const limit = await activeHuntLimit(tx, userId, now);
    if (limit === null) return [];
    const live = await tx.hunt.findMany({
      where: { userId, status: 'LIVE' },
      orderBy: [{ activatedAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const over = live.slice(limit).map((h) => h.id);
    if (over.length === 0) return [];
    await tx.hunt.updateMany({ where: { id: { in: over }, status: 'LIVE' }, data: { status: 'PAUSED', pausedAt: now } });
    await tx.huntEvent.createMany({
      data: over.map((huntId) => ({ huntId, type: 'PAUSED' as const, fromStatus: 'LIVE' as const, toStatus: 'PAUSED' as const, actorUserId: null, changes: { reason: 'plan_limit' } })),
    });
    return over;
  });
}

export interface AccessSweepResult {
  usersChecked: number;
  pausedHuntIds: string[];
}

/**
 * Every user with LIVE Hunts, checked against their plan now. Catches what no webhook announces: a
 * paid period that simply ran out, a lapsed development plan, a plan whose limit was lowered.
 * `onlyUserIds` scopes it (tests).
 */
export async function sweepActiveHuntLimits(prisma: PrismaClient, now = new Date(), onlyUserIds?: readonly string[]): Promise<AccessSweepResult> {
  const owners = await prisma.hunt.findMany({
    where: { status: 'LIVE', ...(onlyUserIds ? { userId: { in: [...onlyUserIds] } } : {}) },
    distinct: ['userId'],
    select: { userId: true },
  });
  const pausedHuntIds: string[] = [];
  for (const { userId } of owners) pausedHuntIds.push(...(await enforceActiveHuntLimit(prisma, userId, now)));
  return { usersChecked: owners.length, pausedHuntIds };
}
