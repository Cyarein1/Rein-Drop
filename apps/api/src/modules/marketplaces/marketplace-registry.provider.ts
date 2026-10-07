import type { Provider } from '@nestjs/common';
import { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { DevEbayAdapter, DevFacebookDataProvider, FacebookAdapter } from '@rein-drop/marketplace-core/adapters';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';

/**
 * The only place concrete adapters are chosen. Everything else injects `MarketplaceRegistry`
 * and works with the MarketplaceAdapter interface.
 *
 * Outside production: deterministic development sources (synthetic listings, no network, no
 * credentials). Facebook goes through the real FacebookAdapter with the dev data provider.
 * Scenarios come from EBAY_DEV_SCENARIO / FACEBOOK_DEV_SCENARIO.
 * Production: nothing registered yet, so every source reports `not_configured`.
 * TODO(marketplace): EbayAdapter and a real FacebookDataProvider once sources and credentials are decided.
 */
export function createMarketplaceRegistry(config: Pick<ApiConfig, 'nodeEnv' | 'devMarketplaceScenarios'>): MarketplaceRegistry {
  if (config.nodeEnv === 'production') return new MarketplaceRegistry([]);
  const { ebay, facebook } = config.devMarketplaceScenarios;
  return new MarketplaceRegistry([
    new DevEbayAdapter({ scenario: ebay }),
    new FacebookAdapter(new DevFacebookDataProvider({ scenario: facebook })),
  ]);
}

export const marketplaceRegistryProvider: Provider = {
  provide: MarketplaceRegistry,
  useFactory: createMarketplaceRegistry,
  inject: [API_CONFIG],
};
