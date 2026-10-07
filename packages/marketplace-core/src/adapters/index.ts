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
export { MockMarketplaceAdapter, type MockMarketplaceAdapterOptions } from './mock/mock-marketplace-adapter.js';
export { MockFacebookDataProvider, type MockFacebookDataProviderOptions } from './mock/mock-facebook-data-provider.js';
export { MOCK_HOST } from './mock/mock-catalogue.js';
export { guardedSearch } from './guard.js';
