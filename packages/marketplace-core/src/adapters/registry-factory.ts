import { MarketplaceRegistry } from '../registry.js';
import type { MarketplaceAdapter } from '../adapter.js';
import { DevEbayAdapter } from './dev/dev-ebay-adapter.js';
import { DevFacebookDataProvider } from './dev/dev-facebook-data-provider.js';
import type { DevScenario } from './dev/dev-source.js';
import { EbayAdapter } from './ebay/ebay-adapter.js';
import type { EbayCredentials } from './ebay/ebay-client.js';
import { ApifyMarketplaceProvider, type ApifyMarketplaceConfig } from './facebook/apify/apify-marketplace-provider.js';
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
  /** Facebook via the Apify development provider (outside production only), else the development provider. */
  facebookApify?: ApifyMarketplaceConfig | null;
}

/**
 * The one place that decides which adapters a process uses (API and worker both call it).
 * Facebook: the development provider, or the Apify development integration (docs/providers/
 * facebook-apify.md). TODO(marketplace): a production Facebook data source once D12 is decided.
 */
export function createMarketplaceRegistry(options: MarketplaceRegistryOptions): MarketplaceRegistry {
  const adapters: MarketplaceAdapter[] = [];
  if (options.ebayApi) adapters.push(new EbayAdapter(options.ebayApi));
  else if (options.nodeEnv !== 'production') adapters.push(new DevEbayAdapter({ scenario: options.devScenarios.ebay, latencyMs: options.devLatencyMs?.ebay }));
  if (options.nodeEnv !== 'production') {
    adapters.push(
      new FacebookAdapter(
        options.facebookApify
          ? new ApifyMarketplaceProvider(options.facebookApify)
          : new DevFacebookDataProvider({ scenario: options.devScenarios.facebook, latencyMs: options.devLatencyMs?.facebook }),
      ),
    );
  }
  return new MarketplaceRegistry(adapters);
}
