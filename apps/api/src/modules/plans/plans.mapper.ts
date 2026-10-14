import { ENTITLEMENT_KEYS as K, HUNT_PRIORITIES, type HuntPriority, type Plan, type PlanEntitlements, type PlanPricing } from '@rein-drop/contracts';
import type { Prisma } from '@rein-drop/db';
import { isMarketplaceId } from '@rein-drop/marketplace-core';

export const PLAN_INCLUDE = { entitlements: true } as const satisfies Prisma.PlanInclude;
export type PlanRow = Prisma.PlanGetPayload<{ include: typeof PLAN_INCLUDE }>;
type EntitlementRow = { key: string; limit: number | null; value: string | null };

/**
 * Entitlement rows -> typed entitlements. A missing row means "not granted", so a plan
 * with incomplete data fails closed (0 hunts, no marketplaces) instead of open.
 */
export function toEntitlements(rows: readonly EntitlementRow[]): PlanEntitlements {
  const get = (key: string) => rows.find((r) => r.key === key);
  const active = get(K.activeHuntsMax);
  const hotEnabled = (get(K.hotHuntsEnabled)?.limit ?? 0) > 0;
  const hotMax = get(K.hotHuntsMax);
  const priority = get(K.monitoringPriority)?.value;
  const history = get(K.analyticsHistoryDays);

  return {
    activeHunts: { limit: active ? active.limit : 0 },
    // No row = unlimited (fails open): plans seeded before this limit existed keep saving drafts.
    savedHunts: { limit: get(K.savedHuntsMax)?.limit ?? null },
    marketplaces: rows
      .filter((r) => r.key.startsWith(K.marketplacePrefix))
      .map((r) => r.key.slice(K.marketplacePrefix.length))
      .filter(isMarketplaceId)
      .sort(),
    hotHunts: { available: hotEnabled, limit: hotEnabled ? (hotMax ? hotMax.limit : 0) : 0 },
    monitoringPriority: (HUNT_PRIORITIES as readonly string[]).includes(priority ?? '')
      ? (priority as HuntPriority)
      : 'NORMAL',
    analyticsHistoryDays: history ? history.limit : 0,
    seats: Math.max(1, get(K.seatsMax)?.limit ?? 1),
  };
}

/** `pricing` comes from the billing provider (BillingService.pricing); a free plan is always free. */
export function toPlan(row: PlanRow, pricing: PlanPricing = { status: 'tbd' }): Plan {
  return {
    code: row.code,
    name: row.name,
    family: row.family,
    pricing: row.isFree ? { status: 'free' } : pricing,
    limitsFinal: row.limitsFinal,
    entitlements: toEntitlements(row.entitlements),
  };
}
