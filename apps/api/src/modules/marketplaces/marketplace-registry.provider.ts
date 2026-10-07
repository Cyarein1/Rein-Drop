import type { Provider } from '@nestjs/common';
import { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { createMarketplaceRegistry as createRegistry } from '@rein-drop/marketplace-core/adapters';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';

/**
 * The only API file that touches concrete adapters. Everything else injects `MarketplaceRegistry`
 * and works with the MarketplaceAdapter interface. Which adapters exist per environment is decided
 * by the shared factory in @rein-drop/marketplace-core/adapters (the worker uses it too).
 */
export function createMarketplaceRegistry(config: Pick<ApiConfig, 'nodeEnv' | 'devMarketplaceScenarios'>): MarketplaceRegistry {
  return createRegistry({ nodeEnv: config.nodeEnv, devScenarios: config.devMarketplaceScenarios });
}

export const marketplaceRegistryProvider: Provider = {
  provide: MarketplaceRegistry,
  useFactory: createMarketplaceRegistry,
  inject: [API_CONFIG],
};
