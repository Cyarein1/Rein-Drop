import { MarketplaceRegistry } from '../registry.js';
import type { MarketplaceAdapter } from '../adapter.js';
import { DevEbayAdapter } from './dev/dev-ebay-adapter.js';
import { DevFacebookDataProvider } from './dev/dev-facebook-data-provider.js';
import type { DevScenario } from './dev/dev-source.js';
import { EbayAdapter } from './ebay/ebay-adapter.js';
import type { EbayCredentials } from './ebay/ebay-client.js';
import { FacebookAdapter } from './facebook/facebook-adapter.js';

export interface MarketplaceRegistryOptions {
  nodeEnv: 'development' | 'test' | 'production';
  devScenarios: { ebay: DevScenario; facebook: DevScenario };
  /** Simulated latency per request for the development sources (ms, default 0). */
  devLatencyMs?: { ebay: number; facebook: number };
  /**
   * eBay source: the real Browse API with these credentials (any environment), or - when absent -
   * the development source outside production and nothing in production (not_configured).
   */
  ebayApi?: EbayCredentials | null;
}

/**
 * The one place that decides which adapters a process uses (API and worker both call it).
 * TODO(marketplace): a real FacebookDataProvider once the data source is decided (D12).
 */
export function createMarketplaceRegistry(options: MarketplaceRegistryOptions): MarketplaceRegistry {
  const adapters: MarketplaceAdapter[] = [];
  if (options.ebayApi) adapters.push(new EbayAdapter(options.ebayApi));
  else if (options.nodeEnv !== 'production') adapters.push(new DevEbayAdapter({ scenario: options.devScenarios.ebay, latencyMs: options.devLatencyMs?.ebay }));
  if (options.nodeEnv !== 'production') {
    adapters.push(new FacebookAdapter(new DevFacebookDataProvider({ scenario: options.devScenarios.facebook, latencyMs: options.devLatencyMs?.facebook })));
  }
  return new MarketplaceRegistry(adapters);
}
