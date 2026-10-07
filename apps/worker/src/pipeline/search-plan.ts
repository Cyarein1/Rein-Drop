import { createHash } from 'node:crypto';
import {
  LISTING_CONDITIONS,
  isMarketplaceId,
  type ListingCondition,
  type MarketplaceId,
} from '@rein-drop/marketplace-core';

export const SEARCH_QUEUE = 'marketplace-search';
export const SEARCH_JOB_TYPE = 'marketplace.search';

/** One LIVE hunt on one marketplace that is due for a search (a claimed HuntMarketplace row). */
export interface DueTarget {
  huntId: string;
  userId: string;
  marketplace: string;
  query: string;
  locationText: string | null;
  radiusKm: number | null;
  conditions: string[];
  maxPriceMinor: number | null;
  priceCurrency: string | null;
}

/** The search criteria a job carries (MarketplaceSearchCriteria minus paging). JSON-safe. */
export type SearchSpec = {
  query: string;
  location: { text: string; radiusKm: number | null } | null;
  conditions: ListingCondition[];
  maxPrice: { amountMinor: number; currency: string } | null;
};

export type SearchJobPayload = {
  marketplace: MarketplaceId;
  groupKey: string;
  criteria: SearchSpec;
  /** Hunts this one search serves (sorted). */
  huntIds: string[];
  plannedAt: string;
};

export interface PlannedSearch {
  dedupeKey: string;
  payload: SearchJobPayload;
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Hunts are grouped when one marketplace search can serve them all: same marketplace, query,
 * location and radius. Price and condition filters are merged (widest wins) because Hunt
 * matching re-applies every hunt's own criteria to the results.
 */
export function groupKeyFor(target: DueTarget): string {
  return JSON.stringify([
    target.marketplace,
    normalize(target.query),
    target.locationText ? normalize(target.locationText) : null,
    target.radiusKm,
  ]);
}

function mergeCriteria(targets: readonly DueTarget[]): SearchSpec {
  const [first] = targets;
  const conditionSets = targets.map((t) => t.conditions.filter((c): c is ListingCondition => (LISTING_CONDITIONS as readonly string[]).includes(c)));
  // Any hunt accepting every condition means the search must too.
  const conditions = conditionSets.some((set) => set.length === 0) ? [] : [...new Set(conditionSets.flat())].sort();
  const prices = targets.map((t) => (t.maxPriceMinor !== null && t.priceCurrency ? { amountMinor: t.maxPriceMinor, currency: t.priceCurrency } : null));
  const sameCurrency = prices.every((p) => p !== null && p.currency === prices[0]!.currency);
  return {
    query: first!.query.trim(),
    location: first!.locationText ? { text: first!.locationText.trim(), radiusKm: first!.radiusKm } : null,
    conditions,
    maxPrice: sameCurrency ? { amountMinor: Math.max(...prices.map((p) => p!.amountMinor)), currency: prices[0]!.currency } : null,
  };
}

/**
 * Turns claimed targets into search jobs, one per group. The dedupe key covers the group, the
 * exact hunts in it and the polling window, so a scheduler that runs twice in the same window
 * enqueues nothing new, while a hunt that becomes due later still gets its own job.
 */
export function planSearchJobs(targets: readonly DueTarget[], now: Date, pollIntervalMs: number): PlannedSearch[] {
  const groups = new Map<string, DueTarget[]>();
  for (const target of targets) {
    if (!isMarketplaceId(target.marketplace)) continue;
    const key = groupKeyFor(target);
    groups.set(key, [...(groups.get(key) ?? []), target]);
  }
  const window = Math.floor(now.getTime() / pollIntervalMs);
  return [...groups.entries()].map(([groupKey, members]) => {
    const sorted = [...members].sort((a, b) => (a.huntId < b.huntId ? -1 : 1));
    const huntIds = sorted.map((t) => t.huntId);
    const marketplace = sorted[0]!.marketplace as MarketplaceId;
    const digest = createHash('sha256').update(`${groupKey}|${huntIds.join(',')}`).digest('hex').slice(0, 32);
    return {
      dedupeKey: `${marketplace}:${digest}:${window}`,
      payload: { marketplace, groupKey, criteria: mergeCriteria(sorted), huntIds, plannedAt: now.toISOString() },
    };
  });
}
