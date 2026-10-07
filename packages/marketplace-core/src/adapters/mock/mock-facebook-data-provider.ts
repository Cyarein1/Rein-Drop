import { z } from 'zod';
import type { MarketplaceCapabilities } from '../../capabilities.js';
import type { MarketplaceErrorCode } from '../../errors.js';
import type { SourceHealthStatus } from '../../health.js';
import { LISTING_CONDITIONS } from '../../listing.js';
import type { SearchOptions } from '../../search.js';
import type {
  FacebookDataProvider,
  FacebookNormalizeResult,
  FacebookProviderHealth,
  FacebookProviderPage,
  FacebookProviderRecord,
  FacebookSearchRequest,
} from '../facebook/facebook-data-provider.js';
import { MOCK_HOST, mockCatalogue, mockFailure, mockPage, type MockItem } from './mock-catalogue.js';

export interface MockFacebookDataProviderOptions {
  /** Provider id (default `mock`). Give a second instance another id to simulate a swap. */
  id?: string;
  capabilities?: Partial<FacebookDataProvider['capabilities']>;
  totalResults?: number;
  currency?: string;
  health?: SourceHealthStatus;
  failSearchWith?: MarketplaceErrorCode;
  now?: () => Date;
}

/**
 * Mock payload format - deliberately different from MockMarketplaceAdapter's, so swapping
 * providers is exercised for real. Not the shape of any real Facebook data source.
 */
const payloadSchema = z.object({
  ref: z.string().min(1),
  caption: z.string(),
  ask: z.object({ minor: z.number().int().nonnegative(), currency: z.string() }).nullable(),
  state: z.enum(LISTING_CONDITIONS),
  where: z.string(),
  pics: z.array(z.string()),
  sold: z.boolean(),
  postedEpochS: z.number().int(),
});
type Payload = z.infer<typeof payloadSchema>;

/** Local-development FacebookDataProvider (no network). TODO(marketplace): real provider TBD. */
export class MockFacebookDataProvider implements FacebookDataProvider {
  readonly id: string;
  readonly capabilities: Omit<MarketplaceCapabilities, 'location'>;
  private readonly seen = new Map<string, Payload>();
  private readonly now: () => Date;

  constructor(private readonly options: MockFacebookDataProviderOptions = {}) {
    this.id = options.id ?? 'mock';
    this.now = options.now ?? (() => new Date());
    this.capabilities = {
      radius: true,
      priceFilter: true,
      conditionFilter: false,
      fetchListing: true,
      maxPageSize: 30,
      ...options.capabilities,
    };
  }

  async health(): Promise<FacebookProviderHealth> {
    const status = this.options.health ?? 'healthy';
    return { status, message: status === 'healthy' ? null : `Mock provider reporting ${status}`, retryAfter: null };
  }

  async search(request: FacebookSearchRequest, options?: SearchOptions): Promise<FacebookProviderPage> {
    const source = { marketplace: 'facebook' as const, provider: this.id };
    if (options?.signal?.aborted) throw new Error('aborted');
    if (this.options.failSearchWith) throw mockFailure(this.options.failSearchWith, source, this.now());
    const items = mockCatalogue(`mock-fb-${this.id}`, request, {
      totalResults: this.options.totalResults ?? 24,
      currency: this.options.currency ?? 'USD',
    });
    const { page, nextCursor } = mockPage(items, request, source);
    const records = page.map((item) => {
      const payload = toPayload(item);
      this.seen.set(payload.ref, payload);
      return this.toRecord(payload);
    });
    return { records, nextCursor };
  }

  async fetchListing(externalId: string): Promise<FacebookProviderRecord | null> {
    const payload = this.seen.get(externalId);
    return payload ? this.toRecord(payload) : null;
  }

  normalize(record: FacebookProviderRecord): FacebookNormalizeResult {
    const parsed = payloadSchema.safeParse(record.payload);
    if (!parsed.success) return { status: 'FAILED', reason: `Payload is not in the "${this.id}" provider format` };
    const p = parsed.data;
    return {
      status: 'NORMALIZED',
      listing: {
        externalId: p.ref,
        url: `${MOCK_HOST}/facebook/${encodeURIComponent(this.id)}/item/${encodeURIComponent(p.ref)}`,
        title: p.caption,
        description: null,
        price: p.ask ? { amountMinor: p.ask.minor, currency: p.ask.currency } : null,
        conditionText: p.state,
        locationText: p.where || null,
        imageUrls: p.pics,
        status: p.sold ? 'SOLD' : 'ACTIVE',
        listedAt: new Date(p.postedEpochS * 1000),
        sourceMetadata: { mock: true, provider: this.id },
      },
    };
  }

  private toRecord(payload: Payload): FacebookProviderRecord {
    return { externalId: payload.ref, payload, fetchedAt: this.now() };
  }
}

function toPayload(item: MockItem): Payload {
  return {
    ref: item.ref,
    caption: item.title,
    ask: item.priceMinor === null ? null : { minor: item.priceMinor, currency: item.currency },
    state: item.condition,
    where: item.place,
    pics: [item.photo],
    sold: item.sold,
    postedEpochS: Math.floor(item.listedAt.getTime() / 1000),
  };
}
