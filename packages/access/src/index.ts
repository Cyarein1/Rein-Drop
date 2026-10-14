import { ENTITLEMENT_KEYS, FAMILIES_GRANTING, type Product } from '@rein-drop/contracts';
import type { Prisma, PrismaClient, SubscriptionStatus } from '@rein-drop/db';
import { DEFAULT_ACCESS_POLICY, evaluateSubscription, type AccessPolicy, type AccessState } from './rules.js';

export { DEFAULT_ACCESS_POLICY, evaluateSubscription, type AccessPolicy, type AccessState, type SubscriptionAccess, type SubscriptionFacts } from './rules.js';

/**
 * Account access, decided on the server only (decision 0018). Shared by the API (requests, billing
 * webhooks, GET /me/access) and the worker (monitoring, scheduled access sweep) so both apply the
 * same rules - hiding a feature in an app is never the enforcement.
 *
 * Access is per ACCOUNT (the user), per PRODUCT (Source / Sell): a SOURCE plan grants Source, SELL
 * grants Sell, COMPLETE grants both. Never per device.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** Statuses that grant a plan while the period runs. PAST_DUE: the provider is retrying (D36). */
export const ENTITLED_STATUSES: SubscriptionStatus[] = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

/** A subscription that is current right now in the strict sense (no grace): used for plan-choice rules. */
export const currentSubscriptionWhere = (userId: string, now = new Date()): Prisma.SubscriptionWhereInput => ({
  userId,
  status: { in: ENTITLED_STATUSES },
  OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
  plan: { isActive: true },
});

export interface ResolvedSubscription {
  id: string;
  status: SubscriptionStatus;
  provider: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  graceEndsAt: Date | null;
}

export interface ResolvedProductAccess {
  product: Product;
  state: AccessState;
  /** Features of the product are usable now (Source at Free counts). */
  hasAccess: boolean;
  /** From a paid / trial subscription (not Free). */
  paid: boolean;
  /** The plan whose entitlements apply; null = none (suspended, or Sell without a plan). */
  planId: string | null;
  /** The subscription behind it - or the most recent one, explaining why access ended. */
  subscription: ResolvedSubscription | null;
}

export interface AccessOptions {
  now?: Date;
  policy?: AccessPolicy;
}

/** True when Rein Drop has suspended the account. */
export async function isSuspended(db: Db, userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { accessSuspendedAt: true } });
  return Boolean(user?.accessSuspendedAt);
}

/**
 * The account's effective access to a product right now. The newest subscription that grants it
 * wins (a stale or older one never overrides it); without one, Source falls back to the Free plan
 * and the most recent subscription explains the state (expired, canceled ...).
 */
export async function resolveProductAccess(db: Db, userId: string, product: Product, options: AccessOptions = {}): Promise<ResolvedProductAccess> {
  const now = options.now ?? new Date();
  const policy = options.policy ?? DEFAULT_ACCESS_POLICY;
  if (await isSuspended(db, userId)) {
    return { product, state: 'suspended', hasAccess: false, paid: false, planId: null, subscription: null };
  }
  const subs = await db.subscription.findMany({
    where: { userId, plan: { isActive: true, family: { in: [...FAMILIES_GRANTING[product]] } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, status: true, provider: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, canceledAt: true, updatedAt: true, planId: true, plan: { select: { isFree: true } } },
  });
  const summary = (s: (typeof subs)[number], graceEndsAt: Date | null): ResolvedSubscription => ({
    id: s.id,
    status: s.status,
    provider: s.provider,
    currentPeriodEnd: s.currentPeriodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    graceEndsAt,
  });

  for (const s of subs) {
    const access = evaluateSubscription(s, now, policy);
    if (!access.entitled) continue;
    const free = s.plan.isFree;
    return { product, state: free ? 'free' : access.state, hasAccess: true, paid: !free, planId: s.planId, subscription: summary(s, access.graceEndsAt) };
  }

  const latest = subs.find((s) => !s.plan.isFree);
  const latestState = latest ? evaluateSubscription(latest, now, policy).state : null;
  if (product === 'source') {
    const free = await db.plan.findFirst({ where: { isFree: true, isActive: true, family: { in: [...FAMILIES_GRANTING.source] } }, select: { id: true } });
    return {
      product,
      // Never had a paid plan (or never paid): plain Free. Otherwise say how the paid access ended.
      state: latestState && latestState !== 'none' ? latestState : 'free',
      hasAccess: Boolean(free),
      paid: false,
      planId: free?.id ?? null,
      subscription: latest && latestState !== 'none' ? summary(latest, null) : null,
    };
  }
  return { product, state: latestState && latestState !== 'none' ? latestState : 'none', hasAccess: false, paid: false, planId: null, subscription: latest && latestState !== 'none' ? summary(latest, null) : null };
}

/** The Source plan the account is on now (Free fallback); null when suspended or plans aren't seeded. */
export async function effectivePlanId(db: Db, userId: string, now = new Date(), policy: AccessPolicy = DEFAULT_ACCESS_POLICY): Promise<string | null> {
  return (await resolveProductAccess(db, userId, 'source', { now, policy })).planId;
}

/** True when the account has the product right now (Sell needs a Sell / Complete plan). */
export async function hasProduct(db: Db, userId: string, product: Product, options: AccessOptions = {}): Promise<boolean> {
  return (await resolveProductAccess(db, userId, product, options)).hasAccess;
}

async function limitOf(db: Db, planId: string, key: string): Promise<{ found: boolean; limit: number | null }> {
  const row = await db.entitlement.findUnique({ where: { planId_key: { planId, key } }, select: { limit: true } });
  return row ? { found: true, limit: row.limit } : { found: false, limit: null };
}

/** Live Hunts the account's plan allows now; null = unlimited. 0 when suspended / unseeded (nothing is monitored). */
export async function activeHuntLimit(db: Db, userId: string, now = new Date(), policy: AccessPolicy = DEFAULT_ACCESS_POLICY): Promise<number | null> {
  const planId = await effectivePlanId(db, userId, now, policy);
  if (!planId) return 0;
  const { found, limit } = await limitOf(db, planId, ENTITLEMENT_KEYS.activeHuntsMax);
  return found ? limit : 0; // a missing row fails closed
}

/**
 * Saved (non-archived) Hunts the plan allows; null = unlimited. A plan without the row (seeded before
 * this limit existed) is unlimited - fails OPEN on purpose so existing accounts never lose the
 * ability to save drafts before the catalogue is re-seeded. Suspended = 0.
 */
export async function savedHuntLimit(db: Db, userId: string, now = new Date(), policy: AccessPolicy = DEFAULT_ACCESS_POLICY): Promise<number | null> {
  const planId = await effectivePlanId(db, userId, now, policy);
  if (!planId) return 0;
  return (await limitOf(db, planId, ENTITLEMENT_KEYS.savedHuntsMax)).limit;
}

/**
 * Pauses the account's LIVE Hunts above its plan's live limit - the most recently started first, the
 * longest-running stay live. A system action recorded in each Hunt's history ({ reason:
 * 'plan_limit' }, or 'account_suspended'); nothing is deleted. Idempotent. Takes the same per-user
 * lock as going live, so an activation can't slip in between the count and the pause.
 */
export async function enforceActiveHuntLimit(prisma: PrismaClient, userId: string, now = new Date(), policy: AccessPolicy = DEFAULT_ACCESS_POLICY): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const suspended = await isSuspended(tx, userId);
    const limit = suspended ? 0 : await activeHuntLimit(tx, userId, now, policy);
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
      data: over.map((huntId) => ({ huntId, type: 'PAUSED' as const, fromStatus: 'LIVE' as const, toStatus: 'PAUSED' as const, actorUserId: null, changes: { reason: suspended ? 'account_suspended' : 'plan_limit' } })),
    });
    return over;
  });
}

export interface AccessSweepResult {
  usersChecked: number;
  pausedHuntIds: string[];
}

/**
 * Every account with LIVE Hunts, checked against its access now. Catches what no webhook announces:
 * a paid period that simply ran out, a grace period that ended, a suspension, a lowered limit.
 * `onlyUserIds` scopes it (tests).
 */
export async function sweepActiveHuntLimits(prisma: PrismaClient, now = new Date(), onlyUserIds?: readonly string[], policy: AccessPolicy = DEFAULT_ACCESS_POLICY): Promise<AccessSweepResult> {
  const owners = await prisma.hunt.findMany({
    where: { status: 'LIVE', ...(onlyUserIds ? { userId: { in: [...onlyUserIds] } } : {}) },
    distinct: ['userId'],
    select: { userId: true },
  });
  const pausedHuntIds: string[] = [];
  for (const { userId } of owners) pausedHuntIds.push(...(await enforceActiveHuntLimit(prisma, userId, now, policy)));
  return { usersChecked: owners.length, pausedHuntIds };
}
