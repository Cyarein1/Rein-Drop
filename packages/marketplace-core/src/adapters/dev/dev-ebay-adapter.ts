import { z } from 'zod';
import type { BuyerCost, MarketplaceAdapter } from '../../adapter.js';
import type { MarketplaceCapabilities } from '../../capabilities.js';
import type { SourceHealth } from '../../health.js';
import type { NormalizedListing } from '../../listing.js';
import type { NormalizeResult, RawListingRecord } from '../../raw-listing.js';
import type { MarketplaceSearchCriteria, MarketplaceSearchResult, SearchOptions } from '../../search.js';
import { abortedError, guardedSearch } from '../guard.js';
import {
  DEV_HOST,
  buildDevListing,
  currencyDigits,
  degradedLimit,
  devSearch,
  keysetPage,
  parseDevListingId,
  scenarioError,
  scenarioHealth,
  statusAt,
  type DevListing,
  type DevScenario,
  type DevSourceOptions,
} from './dev-source.js';

/**
 * Development payload format for the eBay dev adapter. Invented for development; it is NOT the
 * eBay API format (a real EbayAdapter will have its own payload and normalizer).
 * Prices are decimal strings, so normalization exercises string -> minor-unit parsing.
 */
const devEbayPayloadSchema = z.object({
  dev: z.literal('ebay'),
  itemRef: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  buyingFormat: z.enum(['FIXED_PRICE', 'AUCTION']),
  /** Fixed price, or the current bid for auctions. */
  price: z.object({ value: z.string().regex(/^\d+(\.\d+)?$/), currency: z.string() }),
  bidCount: z.number().int().nonnegative().nullable(),
  auctionEndsAt: z.iso.datetime().nullable(),
  conditionLabel: z.enum(['New', 'Used', 'Seller refurbished', 'For parts or not working']),
  listingState: z.enum(['ACTIVE', 'SOLD', 'ENDED']),
  listedAt: z.iso.datetime(),
  itemLocation: z.string().nullable(),
  shipping: z.object({ free: z.boolean(), value: z.string().nullable(), currency: z.string() }),
  seller: z.object({ feedbackPercent: z.number(), feedbackCount: z.number().int() }),
  returnsAccepted: z.boolean(),
  imageUrls: z.array(z.string()),
});
type DevEbayPayload = z.infer<typeof devEbayPayloadSchema>;

/**
 * Deterministic development adapter for eBay: realistic synthetic listings from the seeded
 * electronics catalogue, keyset pagination, listings that age / sell as the clock moves, and the
 * controlled scenarios in DEV_SCENARIOS. Implements MarketplaceAdapter exactly - it must pass
 * the same contract suite a real EbayAdapter will. TODO(marketplace): real EbayAdapter.
 */
export class DevEbayAdapter implements MarketplaceAdapter {
  readonly marketplace = 'ebay' as const;
  readonly provider = 'dev';
  /** Development choices, not a statement about the real eBay API's capabilities. */
  readonly capabilities: MarketplaceCapabilities = {
    location: 'optional',
    radius: false,
    priceFilter: true,
    conditionFilter: true,
    fetchListing: true,
    maxPageSize: 50,
  };
  readonly scenario: DevScenario;

  private readonly now: () => Date;
  private readonly epoch: Date;
  private readonly currency: string;
  /** Search context per listing, so a later refresh shows the same currency / location. */
  private readonly context = new Map<string, { currency: string; location: string | null }>();

  constructor(options: DevSourceOptions = {}) {
    this.scenario = options.scenario ?? 'normal';
    this.now = options.now ?? (() => new Date());
    this.epoch = options.epoch ?? this.now();
    this.currency = options.currency ?? 'USD';
  }

  async health(): Promise<SourceHealth> {
    return { marketplace: this.marketplace, provider: this.provider, checkedAt: this.now(), ...scenarioHealth(this.scenario, this.now()) };
  }

  search(criteria: MarketplaceSearchCriteria, options?: SearchOptions): Promise<MarketplaceSearchResult> {
    return guardedSearch(this, criteria, options, async (applied) => {
      const now = this.now();
      const failure = scenarioError(this.scenario, this, now);
      if (failure) throw failure;
      if (this.scenario === 'empty') return { listings: [], nextCursor: null };

      const found = devSearch('ebay', applied, { currency: this.currency, epoch: this.epoch, now });
      const degraded = this.scenario === 'degraded';
      const { page, nextCursor } = keysetPage(found, applied.cursor, degraded ? degradedLimit(applied.limit) : applied.limit, this);
      const location = applied.location?.text ?? null;
      const listings = page.map((listing, i) => {
        this.context.set(listing.id, { currency: listing.currency, location });
        const raw = this.toRaw(this.payload(listing, location, now), now);
        if (this.scenario === 'invalid_response') return { ...raw, externalId: '' };
        if (this.scenario === 'malformed_payloads' && i % 4 === 3) return { ...raw, payload: { dev: 'ebay', itemRef: listing.id, title: 42 } };
        return raw;
      });
      return { listings, nextCursor: degraded ? null : nextCursor };
    });
  }

  async fetchListing(externalId: string, options?: SearchOptions): Promise<RawListingRecord | null> {
    if (options?.signal?.aborted) throw abortedError(this, options.signal.reason);
    const now = this.now();
    const failure = scenarioError(this.scenario, this, now);
    if (failure) throw failure;
    const parsed = parseDevListingId('ebay', externalId);
    if (!parsed) return null;
    const ctx = this.context.get(externalId) ?? { currency: this.currency, location: null };
    const listing = buildDevListing('ebay', parsed.product, parsed.devCase, { currency: ctx.currency, epoch: this.epoch });
    return this.toRaw(this.payload(listing, ctx.location, now), now);
  }

  /** Shipping to the buyer, from the metadata `normalize` wrote. Free shipping is a known zero. */
  buyerCosts(listing: Pick<NormalizedListing, 'price' | 'sourceMetadata'>): BuyerCost[] {
    const meta = listing.sourceMetadata;
    if (!meta) return [];
    if (meta.freeShipping === true && listing.price) {
      return [{ kind: 'shipping', label: 'Free shipping', amount: { amountMinor: 0, currency: listing.price.currency } }];
    }
    const { shippingMinor, shippingCurrency } = meta;
    if (typeof shippingMinor !== 'number' || !Number.isInteger(shippingMinor) || shippingMinor < 0) return [];
    if (typeof shippingCurrency !== 'string' || !/^[A-Z]{3}$/.test(shippingCurrency)) return [];
    return [{ kind: 'shipping', label: 'Shipping', amount: { amountMinor: shippingMinor, currency: shippingCurrency } }];
  }

  normalize(raw: RawListingRecord): NormalizeResult {
    if (raw.marketplace !== this.marketplace) return { status: 'FAILED', reason: `Not an eBay record (${raw.marketplace})` };
    if (raw.provider !== this.provider) {
      return { status: 'SKIPPED', reason: `Recorded by provider "${raw.provider}", not "${this.provider}"` };
    }
    const parsed = devEbayPayloadSchema.safeParse(raw.payload);
    if (!parsed.success) return { status: 'FAILED', reason: 'Payload is not in the eBay development format' };
    const p = parsed.data;
    const price = decimalToMinor(p.price.value, p.price.currency);
    return {
      status: 'NORMALIZED',
      listing: {
        marketplace: this.marketplace,
        externalId: p.itemRef,
        url: `${DEV_HOST}/ebay/itm/${encodeURIComponent(p.itemRef)}`,
        title: p.title,
        description: p.description,
        price: price === null ? null : { amountMinor: price, currency: p.price.currency },
        conditionText: p.conditionLabel,
        locationText: p.itemLocation,
        imageUrls: p.imageUrls,
        status: p.listingState,
        listedAt: new Date(p.listedAt),
        sourceMetadata: {
          synthetic: true,
          buyingFormat: p.buyingFormat,
          bidCount: p.bidCount,
          auctionEndsAt: p.auctionEndsAt,
          freeShipping: p.shipping.free,
          shippingMinor: p.shipping.value === null ? null : decimalToMinor(p.shipping.value, p.shipping.currency),
          shippingCurrency: p.shipping.currency,
          sellerFeedbackPercent: p.seller.feedbackPercent,
          sellerFeedbackCount: p.seller.feedbackCount,
          returnsAccepted: p.returnsAccepted,
        },
      },
    };
  }

  private payload(listing: DevListing, location: string | null, now: Date): DevEbayPayload {
    const { devCase, seed, currency } = listing;
    const digits = currencyDigits(currency);
    const freeShipping = seed % 3 === 0;
    const auction = devCase.auction === true;
    return {
      dev: 'ebay',
      itemRef: listing.id,
      title: listing.title,
      description: listing.description,
      buyingFormat: auction ? 'AUCTION' : 'FIXED_PRICE',
      // eBay listings always show a price (the current bid for auctions).
      price: { value: (listing.priceMajor ?? 1).toFixed(digits), currency },
      bidCount: auction ? 1 + (seed % 9) : null,
      auctionEndsAt: auction && listing.endsAt ? listing.endsAt.toISOString() : null,
      conditionLabel: devCase.faulty
        ? 'For parts or not working'
        : devCase.condition === 'new'
          ? 'New'
          : devCase.condition === 'refurbished'
            ? 'Seller refurbished'
            : 'Used',
      listingState: statusAt(listing, 'ebay', now) as DevEbayPayload['listingState'],
      listedAt: listing.listedAt.toISOString(),
      itemLocation: location,
      shipping: {
        free: freeShipping,
        value: freeShipping ? null : ((listing.product.typicalUsd > 300 ? 15 : 8) + (seed % 5)).toFixed(digits),
        currency,
      },
      seller: { feedbackPercent: 95 + (seed % 50) / 10, feedbackCount: 12 + (seed % 2400) },
      returnsAccepted: !devCase.faulty && seed % 2 === 0,
      imageUrls: [1, 2, 3].slice(0, 1 + (seed % 3)).map((n) => `${DEV_HOST}/img/${listing.id}-${n}.jpg`),
    };
  }

  private toRaw(payload: DevEbayPayload, now: Date): RawListingRecord {
    return { marketplace: this.marketplace, provider: this.provider, externalId: payload.itemRef, payload, fetchedAt: now };
  }
}

/** "249.5" -> 24950 (exact; no floating-point multiplication). Null if it has too many decimals. */
export function decimalToMinor(value: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const [whole = '0', fraction = ''] = value.split('.');
  if (fraction.length > digits) return null;
  return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0');
}
