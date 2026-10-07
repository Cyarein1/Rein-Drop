import type { MarketplaceAdapter } from './adapter.js';
import { MarketplaceError } from './errors.js';
import type { SourceHealth } from './health.js';
import { MARKETPLACE_IDS, type MarketplaceId } from './ids.js';

/**
 * The adapters available in this process, one per marketplace. Domain code asks the registry
 * for "the eBay adapter" and gets whatever implementation the environment configured.
 */
export class MarketplaceRegistry {
  private readonly adapters = new Map<MarketplaceId, MarketplaceAdapter>();

  constructor(
    adapters: readonly MarketplaceAdapter[],
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.marketplace)) {
        throw new Error(`Two adapters registered for ${adapter.marketplace}`);
      }
      this.adapters.set(adapter.marketplace, adapter);
    }
  }

  has(marketplace: MarketplaceId): boolean {
    return this.adapters.has(marketplace);
  }

  /** The adapter for a marketplace; NOT_CONFIGURED when none is registered. */
  get(marketplace: MarketplaceId): MarketplaceAdapter {
    const adapter = this.adapters.get(marketplace);
    if (!adapter) {
      throw new MarketplaceError('NOT_CONFIGURED', `No adapter is configured for ${marketplace}`, {
        marketplace,
        provider: 'none',
      });
    }
    return adapter;
  }

  list(): MarketplaceAdapter[] {
    return [...this.adapters.values()];
  }

  /** Health of every launch marketplace. Never rejects: a failing check reports `down`. */
  async health(): Promise<SourceHealth[]> {
    return Promise.all(
      MARKETPLACE_IDS.map(async (marketplace): Promise<SourceHealth> => {
        const adapter = this.adapters.get(marketplace);
        const base = { marketplace, checkedAt: this.now(), retryAfter: null };
        if (!adapter) return { ...base, provider: 'none', status: 'not_configured', message: 'No adapter configured' };
        try {
          return await adapter.health();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { ...base, provider: adapter.provider, status: 'down', message: `Health check failed: ${message}` };
        }
      }),
    );
  }
}
