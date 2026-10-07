import type { MarketplaceCapabilities } from '../capabilities.js';
import { MarketplaceError, isMarketplaceError } from '../errors.js';
import type { MarketplaceId } from '../ids.js';
import { rawListingProblems } from '../raw-listing.js';
import {
  applicableCriteria,
  criteriaProblems,
  type MarketplaceSearchCriteria,
  type MarketplaceSearchResult,
  type SearchOptions,
} from '../search.js';

interface Source {
  marketplace: MarketplaceId;
  provider: string;
  capabilities: MarketplaceCapabilities;
}

export function abortedError(source: Source, cause?: unknown): MarketplaceError {
  return new MarketplaceError('ABORTED', 'Search was cancelled', { ...source, cause });
}

/**
 * Shared adapter plumbing so every implementation keeps the same promises: reject bad criteria,
 * honour cancellation, drop filters the source can't apply, only ever throw MarketplaceError and
 * never hand back records that break the raw-record contract.
 */
export async function guardedSearch(
  source: Source,
  criteria: MarketplaceSearchCriteria,
  options: SearchOptions | undefined,
  run: (criteria: MarketplaceSearchCriteria) => Promise<MarketplaceSearchResult>,
): Promise<MarketplaceSearchResult> {
  const { marketplace, provider } = source;
  if (options?.signal?.aborted) throw abortedError(source, options.signal.reason);

  const problems = criteriaProblems(source.capabilities, criteria);
  if (problems.length > 0) {
    throw new MarketplaceError('UNSUPPORTED_CRITERIA', `Can't search ${marketplace} with these criteria`, {
      marketplace,
      provider,
      details: problems,
    });
  }

  let result: MarketplaceSearchResult;
  try {
    result = await run(applicableCriteria(source.capabilities, criteria).criteria);
  } catch (err) {
    if (isMarketplaceError(err)) throw err;
    if (options?.signal?.aborted) throw abortedError(source, err);
    throw new MarketplaceError('UNAVAILABLE', `${marketplace} search failed`, { marketplace, provider, cause: err });
  }

  const invalid = result.listings.flatMap((raw, i) =>
    [...rawListingProblems(raw), ...(raw.marketplace === marketplace && raw.provider === provider ? [] : ['wrong source'])].map(
      (p) => `listings.${i}: ${p}`,
    ),
  );
  if (result.listings.length > criteria.limit) invalid.push(`Returned ${result.listings.length} > limit ${criteria.limit}`);
  if (new Set(result.listings.map((r) => r.externalId)).size !== result.listings.length) invalid.push('Duplicate externalId');
  if (invalid.length > 0) {
    throw new MarketplaceError('INVALID_RESPONSE', `${marketplace} returned records we can't use`, {
      marketplace,
      provider,
      details: invalid,
    });
  }
  return result;
}
