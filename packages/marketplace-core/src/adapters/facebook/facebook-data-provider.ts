import type { MarketplaceCapabilities } from '../../capabilities.js';
import type { SourceHealthStatus } from '../../health.js';
import type { JsonValue } from '../../json.js';
import type { NormalizedListing } from '../../listing.js';
import type { MarketplaceSearchCriteria, SearchLocation, SearchOptions } from '../../search.js';

/**
 * Where FacebookAdapter gets Facebook Marketplace data from. Facebook has no general public
 * listings API, so the source is a separate decision (TODO(marketplace): provider TBD) and must be
 * swappable without touching FacebookAdapter or anything above it.
 *
 * A provider owns its payload format end to end: it fetches records and is the only code that
 * reads them back (`normalize`). FacebookAdapter adds the marketplace rules (location required,
 * provider stamping, error and health wrapping).
 */
export interface FacebookDataProvider {
  /** Stable, unique id, e.g. `mock`. Stored on every raw record it produces. */
  readonly id: string;
  /** Location is always required on Facebook, so providers don't declare it. */
  readonly capabilities: Omit<MarketplaceCapabilities, 'location'>;

  health(): Promise<FacebookProviderHealth>;
  search(request: FacebookSearchRequest, options?: SearchOptions): Promise<FacebookProviderPage>;
  fetchListing?(externalId: string, options?: SearchOptions): Promise<FacebookProviderRecord | null>;
  /** Pure; never throws - unreadable payloads return FAILED. */
  normalize(record: FacebookProviderRecord): FacebookNormalizeResult;
}

/** Search criteria with the location guaranteed (local-pickup marketplace). */
export type FacebookSearchRequest = Omit<MarketplaceSearchCriteria, 'location'> & { location: SearchLocation };

export interface FacebookProviderRecord {
  externalId: string;
  payload: JsonValue;
  fetchedAt: Date;
}

export interface FacebookProviderPage {
  records: FacebookProviderRecord[];
  nextCursor: string | null;
}

export interface FacebookProviderHealth {
  status: SourceHealthStatus;
  message: string | null;
  retryAfter: Date | null;
}

export type FacebookNormalizeResult =
  | { status: 'NORMALIZED'; listing: Omit<NormalizedListing, 'marketplace'> }
  | { status: 'FAILED' | 'SKIPPED'; reason: string };
