import { z } from 'zod';
import type { MarketplaceAdapter } from '../../adapter.js';
import type { MarketplaceCapabilities } from '../../capabilities.js';
import type { MarketplaceErrorCode } from '../../errors.js';
import type { SourceHealth, SourceHealthStatus } from '../../health.js';
import type { MarketplaceId } from '../../ids.js';
import { LISTING_CONDITIONS } from '../../listing.js';
import type { NormalizeResult, RawListingRecord } from '../../raw-listing.js';
import type { MarketplaceSearchCriteria, MarketplaceSearchResult, SearchOptions } from '../../search.js';
import { abortedError, guardedSearch } from '../guard.js';
import { MOCK_HOST, mockCatalogue, mockFailure, mockPage, type MockItem } from './mock-catalogue.js';

export interface MockMarketplaceAdapterOptions {
  marketplace: MarketplaceId;
  provider?: string;
  capabilities?: Partial<MarketplaceCapabilities>;
  /** Listings per query before filters (default 24). 0 exercises empty states. */
  totalResults?: number;
  /** Currency when the search has no max price (default USD). */
  currency?: string;
  /** Reported health (default healthy). */
  health?: SourceHealthStatus;
  /** Make every search fail with this code, to exercise error states. */
  failSearchWith?: MarketplaceErrorCode;
  now?: () => Date;
}

/** The mock payload format. Only this adapter reads it. */
const mockPayloadSchema = z.object({
  mock: z.literal(true),
  itemRef: z.string().min(1),
  heading: z.string(),
  price: z.object({ minor: z.number().int().nonnegative(), currency: z.string() }).nullable(),
  conditionLabel: z.enum(LISTING_CONDITIONS),
  place: z.string(),
  photoUrls: z.array(z.string()),
  state: z.enum(['active', 'sold']),
  listedAt: z.iso.datetime(),
});
type MockPayload = z.infer<typeof mockPayloadSchema>;

const CONDITION_LABEL = { new: 'New', used: 'Used', refurbished: 'Refurbished' } as const;

/**
 * Deterministic in-memory marketplace for local development (no network, no credentials).
 * Used for eBay until a real adapter exists. TODO(marketplace): EbayAdapter.
 */
export class MockMarketplaceAdapter implements MarketplaceAdapter {
  readonly marketplace: MarketplaceId;
  readonly provider: string;
  readonly capabilities: MarketplaceCapabilities;
  readonly fetchListing?: (externalId: string, options?: SearchOptions) => Promise<RawListingRecord | null>;

  private readonly seen = new Map<string, MockPayload>();
  private readonly now: () => Date;

  constructor(private readonly options: MockMarketplaceAdapterOptions) {
    this.marketplace = options.marketplace;
    this.provider = options.provider ?? 'mock';
    this.now = options.now ?? (() => new Date());
    this.capabilities = {
      location: 'optional',
      radius: true,
      priceFilter: true,
      conditionFilter: true,
      fetchListing: true,
      maxPageSize: 50,
      ...options.capabilities,
    };
    if (this.capabilities.fetchListing) {
      this.fetchListing = async (externalId, opts) => {
        if (opts?.signal?.aborted) throw abortedError(this, opts.signal.reason);
        const payload = this.seen.get(externalId);
        return payload ? this.toRaw(payload) : null;
      };
    }
  }

  async health(): Promise<SourceHealth> {
    const status = this.options.health ?? 'healthy';
    return {
      marketplace: this.marketplace,
      provider: this.provider,
      status,
      checkedAt: this.now(),
      message: status === 'healthy' ? null : `Mock source reporting ${status}`,
      retryAfter: null,
    };
  }

  search(criteria: MarketplaceSearchCriteria, options?: SearchOptions): Promise<MarketplaceSearchResult> {
    return guardedSearch(this, criteria, options, async (applied) => {
      if (this.options.failSearchWith) throw mockFailure(this.options.failSearchWith, this, this.now());
      const items = mockCatalogue(`mock-${this.marketplace}`, applied, {
        totalResults: this.options.totalResults ?? 24,
        currency: this.options.currency ?? 'USD',
      });
      const { page, nextCursor } = mockPage(items, applied, this);
      const listings = page.map((item) => {
        const payload = toPayload(item);
        this.seen.set(payload.itemRef, payload);
        return this.toRaw(payload);
      });
      return { listings, nextCursor };
    });
  }

  normalize(raw: RawListingRecord): NormalizeResult {
    if (raw.marketplace !== this.marketplace) return { status: 'FAILED', reason: `Not a ${this.marketplace} record` };
    if (raw.provider !== this.provider) {
      return { status: 'SKIPPED', reason: `Recorded by provider "${raw.provider}", not "${this.provider}"` };
    }
    const parsed = mockPayloadSchema.safeParse(raw.payload);
    if (!parsed.success) return { status: 'FAILED', reason: 'Payload is not in the mock format' };
    const p = parsed.data;
    return {
      status: 'NORMALIZED',
      listing: {
        marketplace: this.marketplace,
        externalId: p.itemRef,
        url: `${MOCK_HOST}/${this.marketplace}/listing/${encodeURIComponent(p.itemRef)}`,
        title: p.heading,
        description: null,
        price: p.price ? { amountMinor: p.price.minor, currency: p.price.currency } : null,
        conditionText: CONDITION_LABEL[p.conditionLabel],
        locationText: p.place || null,
        imageUrls: p.photoUrls,
        status: p.state === 'sold' ? 'SOLD' : 'ACTIVE',
        listedAt: new Date(p.listedAt),
        sourceMetadata: { mock: true },
      },
    };
  }

  private toRaw(payload: MockPayload): RawListingRecord {
    return {
      marketplace: this.marketplace,
      provider: this.provider,
      externalId: payload.itemRef,
      payload,
      fetchedAt: this.now(),
    };
  }
}

function toPayload(item: MockItem): MockPayload {
  return {
    mock: true,
    itemRef: item.ref,
    heading: item.title,
    price: item.priceMinor === null ? null : { minor: item.priceMinor, currency: item.currency },
    conditionLabel: item.condition,
    place: item.place,
    photoUrls: [item.photo],
    state: item.sold ? 'sold' : 'active',
    listedAt: item.listedAt.toISOString(),
  };
}
