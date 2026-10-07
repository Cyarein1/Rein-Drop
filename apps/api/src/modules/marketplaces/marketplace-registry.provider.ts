import type { Provider } from '@nestjs/common';
import { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { FacebookAdapter, MockFacebookDataProvider, MockMarketplaceAdapter } from '@rein-drop/marketplace-core/adapters';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';

/**
 * The only place concrete adapters are chosen. Everything else injects `MarketplaceRegistry`
 * and works with the MarketplaceAdapter interface.
 *
 * Outside production: deterministic mock sources (no network, no credentials).
 * Production: nothing registered yet, so every source reports `not_configured`.
 * TODO(marketplace): EbayAdapter and a real FacebookDataProvider once sources and credentials are decided.
 */
export function createMarketplaceRegistry(config: Pick<ApiConfig, 'nodeEnv'>): MarketplaceRegistry {
  if (config.nodeEnv === 'production') return new MarketplaceRegistry([]);
  return new MarketplaceRegistry([
    new MockMarketplaceAdapter({ marketplace: 'ebay' }),
    new FacebookAdapter(new MockFacebookDataProvider()),
  ]);
}

export const marketplaceRegistryProvider: Provider = {
  provide: MarketplaceRegistry,
  useFactory: createMarketplaceRegistry,
  inject: [API_CONFIG],
};
