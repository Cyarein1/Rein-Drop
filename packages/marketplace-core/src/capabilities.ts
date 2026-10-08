/**
 * What a marketplace source can do. Domain code reads these instead of branching on the
 * marketplace id, so a new source (or a swapped Facebook provider) changes behaviour by
 * declaring different capabilities.
 *
 * Filters are pushdown hints: a source that can't apply one simply doesn't, and Hunt matching
 * re-applies every criterion to the normalized listings. Only `location: 'required'` is a hard
 * rule - such a search is rejected without a location.
 */
export interface MarketplaceCapabilities {
  /** How a search location is used. `required` = local-pickup marketplace. */
  location: 'required' | 'optional' | 'unsupported';
  /** Applies `location.radiusKm`. */
  radius: boolean;
  /** Applies `maxPrice`. */
  priceFilter: boolean;
  /** Applies `conditions`. */
  conditionFilter: boolean;
  /** Can re-fetch a single listing by external id (status / price refresh). */
  fetchListing: boolean;
  /** Most results the source returns per page; requests above it are rejected. */
  maxPageSize: number;
  /**
   * Typical duration of one search request when it is normal for the source to be slow (e.g. a
   * provider that runs a browser). Callers use it for timeouts and to avoid calling the source
   * "slow" for its normal behaviour. Omitted = a fast API.
   */
  expectedLatencyMs?: number;
}

export const LOCATION_MODES = ['required', 'optional', 'unsupported'] as const;

/** Structural problems with a capability declaration (used by the adapter contract tests). */
export function capabilityProblems(c: MarketplaceCapabilities): string[] {
  const problems: string[] = [];
  if (!(LOCATION_MODES as readonly string[]).includes(c.location)) problems.push(`Unknown location mode "${c.location}"`);
  if (c.radius && c.location === 'unsupported') problems.push('Radius needs location support');
  if (!Number.isInteger(c.maxPageSize) || c.maxPageSize < 1) problems.push('maxPageSize must be a positive integer');
  return problems;
}
