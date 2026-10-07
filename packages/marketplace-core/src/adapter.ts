import type { MarketplaceCapabilities } from './capabilities.js';
import type { SourceHealth } from './health.js';
import type { MarketplaceId } from './ids.js';
import type { NormalizeResult, RawListingRecord } from './raw-listing.js';
import type { MarketplaceSearchCriteria, MarketplaceSearchResult, SearchOptions } from './search.js';

/**
 * The boundary between Rein Drop and a marketplace. Domain modules (Hunts, matching, deals, the
 * worker) talk to this interface only - never to eBay / Facebook SDKs or payloads.
 *
 * Rules every implementation must follow (checked by the adapter contract tests in
 * `@rein-drop/marketplace-core/testing`):
 * - `search` rejects only with MarketplaceError; criteria that break a hard capability rule
 *   reject with UNSUPPORTED_CRITERIA; an aborted signal rejects with ABORTED.
 * - `search` returns at most `criteria.limit` records with unique external ids, all valid
 *   RawListingRecords for this marketplace and provider; cursors never repeat a listing.
 * - `normalize` is pure and never throws: unreadable payloads return FAILED.
 * - `fetchListing` exists exactly when `capabilities.fetchListing` is true.
 * - `health` never rejects.
 */
export interface MarketplaceAdapter {
  readonly marketplace: MarketplaceId;
  /** Which implementation this is, e.g. `mock`. Stamped on every raw record. */
  readonly provider: string;
  readonly capabilities: MarketplaceCapabilities;

  health(): Promise<SourceHealth>;
  search(criteria: MarketplaceSearchCriteria, options?: SearchOptions): Promise<MarketplaceSearchResult>;
  /** Re-fetch one listing; null when the source no longer has it. */
  fetchListing?(externalId: string, options?: SearchOptions): Promise<RawListingRecord | null>;
  /** Raw record -> normalized Listing. Use `normalizeRawListing()` rather than calling this directly. */
  normalize(raw: RawListingRecord): NormalizeResult;
}
