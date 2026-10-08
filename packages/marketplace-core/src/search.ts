import type { JsonValue } from './json.js';
import type { MarketplaceCapabilities } from './capabilities.js';
import type { ListingCondition, Money } from './listing.js';
import type { RawListingRecord } from './raw-listing.js';

/** Where to look. Free text until geocoding lands (TODO(geo), decision 0001). */
export interface SearchLocation {
  text: string;
  radiusKm: number | null;
}

/**
 * Marketplace-neutral search request, built from a Hunt's criteria. Exclusions and target
 * economics are not here: they are applied by Hunt matching, not by sources.
 */
export interface MarketplaceSearchCriteria {
  query: string;
  location: SearchLocation | null;
  /** Empty = any condition. */
  conditions: readonly ListingCondition[];
  maxPrice: Money | null;
  /** Page size; at most `capabilities.maxPageSize`. */
  limit: number;
  /** Opaque cursor from a previous result's `nextCursor`; null for the first page. */
  cursor: string | null;
}

/**
 * The part of an AbortSignal adapters read. Structural, so this package needs no DOM / Node
 * typings; a real `AbortSignal` fits.
 */
export interface CancellationSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
}

export interface SearchOptions {
  signal?: CancellationSignal;
}

export interface MarketplaceSearchResult {
  /** Raw records, to be stored and then normalized. */
  listings: RawListingRecord[];
  /** Null when there are no more pages. */
  nextCursor: string | null;
  /**
   * True when the source says it returned fewer results than exist (a degraded source). The
   * listings are still valid; callers record the poll as degraded rather than fully successful.
   */
  partial?: boolean;
  /** What the request(s) behind this page cost, when the source reports it (see SourceUsage). */
  usage?: SourceUsage;
}

/**
 * Generic per-search usage: requests, results, time and cost. Provider-specific detail goes in
 * `details` (it is stored on the search run, never on Hunts or Listings).
 */
export interface SourceUsage {
  requests: number;
  /** Results the provider returned (and may have charged for). */
  items: number;
  durationMs: number | null;
  /** Cost in USD; null when the source is free / quota-based or unknown. */
  costUsd: number | null;
  /** True when costUsd is computed from published pricing rather than billed. */
  costIsEstimate: boolean;
  details: { [key: string]: JsonValue };
}

/** Hard-rule violations that make a search impossible for this source (empty = searchable). */
export function criteriaProblems(capabilities: MarketplaceCapabilities, criteria: MarketplaceSearchCriteria): string[] {
  const problems: string[] = [];
  if (criteria.query.trim() === '') problems.push('query: Describe what to search for');
  if (!Number.isInteger(criteria.limit) || criteria.limit < 1 || criteria.limit > capabilities.maxPageSize) {
    problems.push(`limit: Must be between 1 and ${capabilities.maxPageSize}`);
  }
  if (capabilities.location === 'required' && criteria.location === null) {
    problems.push('location: This marketplace needs a location');
  }
  return problems;
}

export type IgnoredFilter = 'location' | 'radius' | 'maxPrice' | 'conditions';

/**
 * Drops the filters a source can't apply, and reports them, so Hunt matching knows what it must
 * check itself. Adapters search with the returned criteria.
 */
export function applicableCriteria(
  capabilities: MarketplaceCapabilities,
  criteria: MarketplaceSearchCriteria,
): { criteria: MarketplaceSearchCriteria; ignored: IgnoredFilter[] } {
  const ignored: IgnoredFilter[] = [];
  let location = criteria.location;
  if (location && capabilities.location === 'unsupported') {
    ignored.push('location');
    location = null;
  } else if (location && location.radiusKm !== null && !capabilities.radius) {
    ignored.push('radius');
    location = { ...location, radiusKm: null };
  }
  let maxPrice = criteria.maxPrice;
  if (maxPrice && !capabilities.priceFilter) {
    ignored.push('maxPrice');
    maxPrice = null;
  }
  let conditions = criteria.conditions;
  if (conditions.length > 0 && !capabilities.conditionFilter) {
    ignored.push('conditions');
    conditions = [];
  }
  return { criteria: { ...criteria, location, maxPrice, conditions }, ignored };
}
