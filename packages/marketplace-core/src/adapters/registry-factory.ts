import { MarketplaceRegistry } from '../registry.js';
import { DevEbayAdapter } from './dev/dev-ebay-adapter.js';
import { DevFacebookDataProvider } from './dev/dev-facebook-data-provider.js';
import type { DevScenario } from './dev/dev-source.js';
import { FacebookAdapter } from './facebook/facebook-adapter.js';

export interface MarketplaceRegistryOptions {
  nodeEnv: 'development' | 'test' | 'production';
  devScenarios: { ebay: DevScenario; facebook: DevScenario };
}

/**
 * The one place that decides which adapters a process uses (API and worker both call it).
 *
 * Outside production: the deterministic development sources (Facebook through the real
 * FacebookAdapter). Production: nothing registered yet, so every source reports `not_configured`.
 * TODO(marketplace): EbayAdapter and a real FacebookDataProvider once sources and credentials are decided.
 */
export function createMarketplaceRegistry(options: MarketplaceRegistryOptions): MarketplaceRegistry {
  if (options.nodeEnv === 'production') return new MarketplaceRegistry([]);
  return new MarketplaceRegistry([
    new DevEbayAdapter({ scenario: options.devScenarios.ebay }),
    new FacebookAdapter(new DevFacebookDataProvider({ scenario: options.devScenarios.facebook })),
  ]);
}
