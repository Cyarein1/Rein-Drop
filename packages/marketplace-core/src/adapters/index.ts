/**
 * Concrete marketplace adapters. Import this entry point only where adapters are wired up
 * (the API Marketplaces module, later the worker) - domain code uses the interfaces in
 * `@rein-drop/marketplace-core`.
 */
export { FacebookAdapter } from './facebook/facebook-adapter.js';
export type {
  FacebookDataProvider,
  FacebookNormalizeResult,
  FacebookProviderHealth,
  FacebookProviderPage,
  FacebookProviderRecord,
  FacebookSearchRequest,
} from './facebook/facebook-data-provider.js';
export { DevEbayAdapter } from './dev/dev-ebay-adapter.js';
export { DevFacebookDataProvider, type DevFacebookDataProviderOptions } from './dev/dev-facebook-data-provider.js';
export { DEV_HOST, DEV_SCENARIOS, isDevScenario, type DevScenario, type DevSourceOptions } from './dev/dev-source.js';
export { DEV_CASES, DEV_PRODUCTS, type DevCase, type DevProduct } from './dev/catalogue.js';
export { guardedSearch } from './guard.js';
export { createMarketplaceRegistry, type MarketplaceRegistryOptions } from './registry-factory.js';
