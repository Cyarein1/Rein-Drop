/**
 * Marketplace boundary. Domain code depends on this entry point - the adapter interface, the
 * normalized Listing contract, search / health / error types and the registry - never on a
 * marketplace SDK, API or payload.
 *
 * Other entry points:
 * - `@rein-drop/marketplace-core/adapters`: concrete adapters (FacebookAdapter + its
 *   FacebookDataProvider interface, local mock sources). Only the Marketplaces module wires them.
 * - `@rein-drop/marketplace-core/testing`: the adapter contract test suite.
 *
 * TODO(marketplace): real eBay adapter and a real FacebookDataProvider - sources and credentials
 * are not decided yet.
 */

export { MARKETPLACE_IDS, isMarketplaceId, type MarketplaceId } from './ids.js';
export { isJsonValue, jsonValueSchema, type JsonValue } from './json.js';
export {
  LISTING_CONDITIONS,
  LISTING_STATUSES,
  currencyCodeSchema,
  listingMoneySchema,
  normalizedListingSchema,
  type ListingCondition,
  type ListingStatus,
  type Money,
  type NormalizedListing,
} from './listing.js';
export { LOCATION_MODES, capabilityProblems, type MarketplaceCapabilities } from './capabilities.js';
export { SOURCE_HEALTH_STATUSES, type SourceHealth, type SourceHealthStatus } from './health.js';
export {
  MARKETPLACE_ERROR_CODES,
  MarketplaceError,
  isMarketplaceError,
  type MarketplaceErrorCode,
  type MarketplaceErrorOptions,
} from './errors.js';
export {
  applicableCriteria,
  criteriaProblems,
  type CancellationSignal,
  type IgnoredFilter,
  type MarketplaceSearchCriteria,
  type MarketplaceSearchResult,
  type SearchLocation,
  type SearchOptions,
  type SourceUsage,
} from './search.js';
export { normalizeRawListing, rawListingProblems, type NormalizeResult, type RawListingRecord } from './raw-listing.js';
export type { BuyerCost, MarketplaceAdapter } from './adapter.js';
export { MarketplaceRegistry } from './registry.js';
