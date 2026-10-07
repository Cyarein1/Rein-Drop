import {
  HUNT_CONDITIONS,
  type CreateHuntRequest,
  type Hunt,
  type HuntCondition,
  type HuntEvent,
  type HuntTarget,
  type MarketplaceKey,
} from '@rein-drop/contracts';
import { isMarketplaceId } from '@rein-drop/marketplace-core';
import type { Prisma } from '@rein-drop/db';

export const HUNT_INCLUDE = {
  marketplaces: { include: { marketplace: { select: { key: true } } } },
} as const satisfies Prisma.HuntInclude;

export type HuntRow = Prisma.HuntGetPayload<{ include: typeof HUNT_INCLUDE }>;
export type HuntEventRow = Prisma.HuntEventGetPayload<object>;

/** The criteria a user controls - the editable part of a Hunt, in contract shape. */
export type HuntCriteria = Required<Omit<CreateHuntRequest, 'name'>> & { name: string };

export const CRITERIA_KEYS = [
  'name',
  'query',
  'marketplaces',
  'location',
  'conditions',
  'maxPrice',
  'target',
  'exclusions',
  'priority',
] as const satisfies readonly (keyof HuntCriteria)[];

const isCondition = (v: string): v is HuntCondition => (HUNT_CONDITIONS as readonly string[]).includes(v);

/** DB row -> API contract. Only enabled marketplaces are shown. */
export function toHunt(row: HuntRow): Hunt {
  const marketplaces = row.marketplaces
    .filter((m) => m.isEnabled)
    .map((m) => m.marketplace.key)
    .filter((key): key is MarketplaceKey => isMarketplaceId(key))
    .sort();
  const currency = row.priceCurrency;

  let target: HuntTarget | null = null;
  if (row.targetProfitMinor !== null && currency) {
    target = { kind: 'profit', amount: { amountMinor: row.targetProfitMinor, currency } };
  } else if (row.targetMarginPercent !== null) {
    target = { kind: 'margin', percent: row.targetMarginPercent };
  }

  return {
    id: row.id,
    name: row.name,
    query: row.query,
    status: row.status,
    priority: row.priority,
    marketplaces,
    location: row.locationText ? { text: row.locationText, radiusKm: row.radiusKm } : null,
    conditions: row.conditions.filter(isCondition),
    maxPrice: row.maxPriceMinor !== null && currency ? { amountMinor: row.maxPriceMinor, currency } : null,
    target,
    exclusions: row.exclusions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastEditedAt: row.lastEditedAt?.toISOString() ?? null,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

/** The editable criteria of an existing hunt. */
export function criteriaOf(hunt: Hunt): HuntCriteria {
  return {
    name: hunt.name,
    query: hunt.query,
    marketplaces: hunt.marketplaces,
    location: hunt.location,
    conditions: hunt.conditions,
    maxPrice: hunt.maxPrice,
    target: hunt.target,
    exclusions: hunt.exclusions,
    priority: hunt.priority,
  };
}

/** Criteria -> Hunt columns (marketplaces are stored separately). One currency per hunt. */
export function toHuntColumns(c: HuntCriteria) {
  return {
    name: c.name,
    query: c.query,
    priority: c.priority,
    locationText: c.location?.text ?? null,
    radiusKm: c.location?.radiusKm ?? null,
    conditions: c.conditions,
    maxPriceMinor: c.maxPrice?.amountMinor ?? null,
    priceCurrency: c.maxPrice?.currency ?? (c.target?.kind === 'profit' ? c.target.amount.currency : null),
    targetProfitMinor: c.target?.kind === 'profit' ? c.target.amount.amountMinor : null,
    targetMarginPercent: c.target?.kind === 'margin' ? c.target.percent : null,
    exclusions: c.exclusions,
  } satisfies Partial<Prisma.HuntUncheckedCreateInput>;
}

/** Default name: the query, shortened to the name length limit. */
export function defaultHuntName(query: string): string {
  return query.length <= 100 ? query : `${query.slice(0, 99).trimEnd()}…`;
}

/** Field-level differences between two criteria sets (for EDITED events). */
export function diffCriteria(before: HuntCriteria, after: HuntCriteria): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of CRITERIA_KEYS) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { before: before[key], after: after[key] };
    }
  }
  return changes;
}

export function toHuntEvent(row: HuntEventRow): HuntEvent {
  return {
    id: row.id,
    type: row.type,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    changes: (row.changes as HuntEvent['changes']) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
