import type { MarketplaceAdapter } from '../../adapter.js';
import type { MarketplaceCapabilities } from '../../capabilities.js';
import type { SourceHealth } from '../../health.js';
import type { NormalizeResult, RawListingRecord } from '../../raw-listing.js';
import type { MarketplaceSearchCriteria, MarketplaceSearchResult, SearchOptions } from '../../search.js';
import { MarketplaceError, isMarketplaceError } from '../../errors.js';
import { abortedError, guardedSearch } from '../guard.js';
import type { FacebookDataProvider, FacebookProviderRecord } from './facebook-data-provider.js';

/**
 * Facebook Marketplace adapter. Marketplace rules live here; the data comes from a pluggable
 * FacebookDataProvider, so changing provider is a constructor argument, not a code change.
 */
export class FacebookAdapter implements MarketplaceAdapter {
  readonly marketplace = 'facebook' as const;
  readonly provider: string;
  readonly capabilities: MarketplaceCapabilities;
  readonly fetchListing?: (externalId: string, options?: SearchOptions) => Promise<RawListingRecord | null>;

  constructor(
    private readonly data: FacebookDataProvider,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.provider = data.id;
    // Local pickup: a search without a location is meaningless.
    this.capabilities = { ...data.capabilities, location: 'required' };

    const fetch = data.fetchListing?.bind(data);
    if (fetch && data.capabilities.fetchListing) {
      this.fetchListing = async (externalId, options) => {
        if (options?.signal?.aborted) throw abortedError(this, options.signal.reason);
        try {
          const record = await fetch(externalId, options);
          return record ? this.toRaw(record) : null;
        } catch (err) {
          throw this.wrap(err, options);
        }
      };
    }
  }

  async health(): Promise<SourceHealth> {
    const base = { marketplace: this.marketplace, provider: this.provider };
    try {
      const h = await this.data.health();
      return { ...base, status: h.status, message: h.message, retryAfter: h.retryAfter, checkedAt: this.now() };
    } catch (err) {
      const message = `Health check failed: ${err instanceof Error ? err.message : String(err)}`;
      return { ...base, status: 'down', message, retryAfter: null, checkedAt: this.now() };
    }
  }

  search(criteria: MarketplaceSearchCriteria, options?: SearchOptions): Promise<MarketplaceSearchResult> {
    return guardedSearch(this, criteria, options, async (applied) => {
      // guardedSearch has already rejected a missing location (capability `required`).
      const location = applied.location!;
      try {
        const page = await this.data.search({ ...applied, location }, options);
        return { listings: page.records.map((r) => this.toRaw(r)), nextCursor: page.nextCursor, ...(page.partial ? { partial: true } : {}) };
      } catch (err) {
        throw this.wrap(err, options);
      }
    });
  }

  normalize(raw: RawListingRecord): NormalizeResult {
    if (raw.marketplace !== this.marketplace) {
      return { status: 'FAILED', reason: `Not a Facebook record (${raw.marketplace})` };
    }
    if (raw.provider !== this.provider) {
      // Recorded by a previous provider: its payload format is unknown to this one.
      return {
        status: 'SKIPPED',
        reason: `Recorded by provider "${raw.provider}"; the current provider "${this.provider}" can't read it`,
      };
    }
    const result = this.data.normalize({ externalId: raw.externalId, payload: raw.payload, fetchedAt: raw.fetchedAt });
    return result.status === 'NORMALIZED'
      ? { status: 'NORMALIZED', listing: { ...result.listing, marketplace: this.marketplace } }
      : result;
  }

  private toRaw(record: FacebookProviderRecord): RawListingRecord {
    return { marketplace: this.marketplace, provider: this.provider, ...record };
  }

  /** Providers may throw anything; callers only ever see MarketplaceError. */
  private wrap(err: unknown, options?: SearchOptions): MarketplaceError {
    if (isMarketplaceError(err)) return err;
    if (options?.signal?.aborted) return abortedError(this, err);
    return new MarketplaceError('UNAVAILABLE', `Facebook data provider "${this.provider}" failed`, {
      marketplace: this.marketplace,
      provider: this.provider,
      cause: err,
    });
  }
}
