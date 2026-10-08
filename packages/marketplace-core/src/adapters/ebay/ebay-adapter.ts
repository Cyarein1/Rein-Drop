import type { BuyerCost, MarketplaceAdapter } from '../../adapter.js';
import type { MarketplaceCapabilities } from '../../capabilities.js';
import { MarketplaceError, isMarketplaceError } from '../../errors.js';
import type { SourceHealth } from '../../health.js';
import type { JsonValue } from '../../json.js';
import type { ListingStatus, NormalizedListing } from '../../listing.js';
import type { NormalizeResult, RawListingRecord } from '../../raw-listing.js';
import type { MarketplaceSearchCriteria, MarketplaceSearchResult, SearchOptions } from '../../search.js';
import { guardedSearch } from '../guard.js';
import { currencyDigits, decimalToMinor } from '../money.js';
import { EBAY_CONDITION_IDS, EBAY_MAX_RESULTS, EBAY_SITE_CURRENCY, ebayItemSummarySchema, ebaySearchPageSchema, type EbayItemSummary } from './ebay-browse-schema.js';
import { EbayClient, type EbayClientOptions } from './ebay-client.js';

/**
 * Real eBay source: the official Buy > Browse API v1 (`GET /item_summary/search`,
 * `GET /item/{item_id}`) with an application token from the configured credentials.
 * Decision 0010. TODO(marketplace): eBay API licence / production keyset approval and call
 * quotas are the user's to confirm (D12).
 *
 * - Freshness: results sorted `newlyListed`; `listedAt` = eBay `itemCreationDate`.
 * - Source ids: `externalId` = eBay `itemId`; `legacyItemId` kept in metadata.
 * - Pagination: eBay offset / limit, as an opaque cursor; stops at eBay's 10,000-result cap.
 * - Filters: max price only when it's in the site's currency (eBay requires price + currency
 *   to match the site); conditions via eBay condition ids. Location isn't pushed down (eBay
 *   ships; the free-text Hunt location has no eBay equivalent) - Hunt matching re-applies all.
 */
export const EBAY_PROVIDER = 'ebay-browse';

export interface EbayAdapterOptions extends Omit<EbayClientOptions, 'provider'> {
  /** Results per request (eBay allows 1-200). */
  maxPageSize?: number;
}

const PATH = '/buy/browse/v1';
const DESCRIPTION_MAX = 5_000;

export class EbayAdapter implements MarketplaceAdapter {
  readonly marketplace = 'ebay' as const;
  readonly provider = EBAY_PROVIDER;
  readonly capabilities: MarketplaceCapabilities;
  private readonly client: EbayClient;
  private readonly now: () => Date;

  constructor(private readonly options: EbayAdapterOptions) {
    this.client = new EbayClient({ ...options, provider: EBAY_PROVIDER });
    this.now = options.now ?? (() => new Date());
    this.capabilities = {
      location: 'unsupported',
      radius: false,
      priceFilter: true,
      conditionFilter: true,
      fetchListing: true,
      maxPageSize: Math.min(200, Math.max(1, options.maxPageSize ?? 200)),
    };
  }

  /** Cheap check: can we get (or reuse) an application token? Never rejects. */
  async health(): Promise<SourceHealth> {
    const base = { marketplace: this.marketplace, provider: this.provider, checkedAt: this.now() };
    try {
      await this.client.accessToken();
      return { ...base, status: 'healthy', message: null, retryAfter: null };
    } catch (err) {
      if (isMarketplaceError(err) && err.code === 'NOT_CONFIGURED') return { ...base, status: 'not_configured', message: err.message, retryAfter: null };
      if (isMarketplaceError(err) && err.code === 'RATE_LIMITED') return { ...base, status: 'degraded', message: err.message, retryAfter: err.retryAfter };
      return { ...base, status: 'down', message: err instanceof Error ? err.message : String(err), retryAfter: null };
    }
  }

  search(criteria: MarketplaceSearchCriteria, options?: SearchOptions): Promise<MarketplaceSearchResult> {
    return guardedSearch(this, criteria, options, async (applied) => {
      const offset = decodeOffset(applied.cursor, this);
      if (offset >= EBAY_MAX_RESULTS) return { listings: [], nextCursor: null };
      const limit = Math.min(applied.limit, EBAY_MAX_RESULTS - offset);
      const params = [`q=${encodeURIComponent(applied.query.trim())}`, `limit=${limit}`, `offset=${offset}`, 'sort=newlyListed'];
      const filter = this.filterFor(applied);
      if (filter) params.push(`filter=${encodeURIComponent(filter)}`);

      const body = await this.client.getJson(`${PATH}/item_summary/search?${params.join('&')}`, options?.signal);
      if (body === null) return { listings: [], nextCursor: null };
      const page = ebaySearchPageSchema.safeParse(body);
      if (!page.success) throw new MarketplaceError('INVALID_RESPONSE', 'eBay search returned an unreadable page', this);

      const fetchedAt = this.now();
      const seen = new Set<string>();
      const listings: RawListingRecord[] = [];
      for (const item of page.data.itemSummaries ?? []) {
        // Keep eBay's record as received; normalize() decides whether it's usable.
        const id = typeof item === 'object' && item !== null && typeof (item as { itemId?: unknown }).itemId === 'string' ? (item as { itemId: string }).itemId : null;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        listings.push({ marketplace: this.marketplace, provider: this.provider, externalId: id, payload: item as JsonValue, fetchedAt });
      }
      const nextOffset = offset + limit;
      const more = Boolean(page.data.next) && listings.length > 0 && nextOffset < EBAY_MAX_RESULTS && nextOffset < (page.data.total ?? Infinity);
      // eBay Browse is quota-based (calls per day), not billed per call: no cost, one call counted.
      const usage = { requests: 1, items: listings.length, durationMs: null, costUsd: null, costIsEstimate: false, details: { provider: this.provider, site: this.options.marketplaceId, offset } };
      return { listings, nextCursor: more ? encodeOffset(nextOffset) : null, usage };
    });
  }

  /** Re-reads one listing (`GET /item/{item_id}`); null when eBay no longer has it. */
  async fetchListing(externalId: string, options?: SearchOptions): Promise<RawListingRecord | null> {
    const body = await this.client.getJson(`${PATH}/item/${encodeURIComponent(externalId)}`, options?.signal);
    if (body === null) return null;
    if (typeof body !== 'object' || body === null || typeof (body as { itemId?: unknown }).itemId !== 'string') {
      throw new MarketplaceError('INVALID_RESPONSE', 'eBay returned an unreadable item', this);
    }
    return { marketplace: this.marketplace, provider: this.provider, externalId: (body as { itemId: string }).itemId, payload: body as JsonValue, fetchedAt: this.now() };
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

  /** eBay ItemSummary / Item -> Listing. Pure: time-dependent status uses the record's fetchedAt. */
  normalize(raw: RawListingRecord): NormalizeResult {
    if (raw.marketplace !== this.marketplace) return { status: 'FAILED', reason: `Not an eBay record (${raw.marketplace})` };
    if (raw.provider !== this.provider) return { status: 'SKIPPED', reason: `Recorded by provider "${raw.provider}", not "${this.provider}"` };
    const parsed = ebayItemSummarySchema.safeParse(raw.payload);
    if (!parsed.success) return { status: 'FAILED', reason: 'Payload is not an eBay Browse item' };
    const item = parsed.data;
    const title = item.title?.trim();
    if (!title) return { status: 'FAILED', reason: 'eBay item has no title' };
    const url = httpUrl(item.itemWebUrl);
    if (!url) return { status: 'FAILED', reason: 'eBay item has no web URL' };

    const auctionOnly = item.buyingOptions?.includes('AUCTION') && !item.buyingOptions.includes('FIXED_PRICE');
    const shown = auctionOnly && item.currentBidPrice ? item.currentBidPrice : item.price;
    const priceMinor = shown ? decimalToMinor(shown.value, shown.currency) : null;
    const shipping = item.shippingOptions?.[0];
    const shippingMinor = shipping?.shippingCost ? decimalToMinor(shipping.shippingCost.value, shipping.shippingCost.currency) : null;

    return {
      status: 'NORMALIZED',
      listing: {
        marketplace: this.marketplace,
        externalId: item.itemId,
        url,
        title,
        description: descriptionOf(item),
        price: priceMinor === null || !shown || !/^[A-Z]{3}$/.test(shown.currency) ? null : { amountMinor: priceMinor, currency: shown.currency },
        conditionText: item.condition?.trim() || null,
        locationText: locationOf(item),
        imageUrls: [item.image, ...(item.additionalImages ?? [])].map((i) => httpUrl(i?.imageUrl)).filter((u): u is string => u !== null).slice(0, 12),
        status: statusOf(item, raw.fetchedAt),
        listedAt: dateOf(item.itemCreationDate),
        sourceMetadata: {
          legacyItemId: item.legacyItemId ?? null,
          conditionId: item.conditionId ?? null,
          buyingOptions: item.buyingOptions ?? [],
          bidCount: item.bidCount ?? null,
          auctionEndsAt: auctionOnly ? (item.itemEndDate ?? null) : null,
          freeShipping: shippingMinor === 0,
          shippingMinor: shippingMinor !== null && shippingMinor > 0 ? shippingMinor : null,
          shippingCurrency: shipping?.shippingCost?.currency ?? null,
          shippingCostType: shipping?.shippingCostType ?? null,
          sellerFeedbackPercent: item.seller?.feedbackPercentage ? Number(item.seller.feedbackPercentage) : null,
          sellerFeedbackScore: item.seller?.feedbackScore ?? null,
          site: this.options.marketplaceId,
        },
      },
    };
  }

  /** eBay `filter` expression for what this site can apply. */
  private filterFor(c: MarketplaceSearchCriteria): string | null {
    const parts: string[] = [];
    const siteCurrency = EBAY_SITE_CURRENCY[this.options.marketplaceId];
    if (c.maxPrice && siteCurrency === c.maxPrice.currency) {
      const digits = currencyDigits(siteCurrency);
      parts.push(`price:[..${(c.maxPrice.amountMinor / 10 ** digits).toFixed(digits)}]`, `priceCurrency:${siteCurrency}`);
    }
    const ids = c.conditions.flatMap((cond) => EBAY_CONDITION_IDS[cond] ?? []);
    if (ids.length > 0) parts.push(`conditionIds:{${ids.join('|')}}`);
    return parts.length > 0 ? parts.join(',') : null;
  }
}

const CURSOR_PREFIX = 'o:';
const encodeOffset = (offset: number) => `${CURSOR_PREFIX}${offset}`;
function decodeOffset(cursor: string | null, source: { marketplace: 'ebay'; provider: string }): number {
  if (cursor === null) return 0;
  const n = cursor.startsWith(CURSOR_PREFIX) ? Number(cursor.slice(CURSOR_PREFIX.length)) : Number.NaN;
  if (!Number.isInteger(n) || n < 0) throw new MarketplaceError('UNSUPPORTED_CRITERIA', 'Invalid eBay page cursor', { ...source, details: ['cursor'] });
  return n;
}

function httpUrl(value: string | undefined): string | null {
  if (!value) return null;
  return /^https?:\/\/[^\s]+$/i.test(value) ? value : null;
}

function dateOf(value: string | undefined): Date | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

function locationOf(item: EbayItemSummary): string | null {
  const l = item.itemLocation;
  if (!l) return null;
  const text = [l.city, l.stateOrProvince, l.country].filter((p): p is string => typeof p === 'string' && p.trim() !== '').join(', ');
  return text || null;
}

/** Short description when given; else the item description with HTML removed (GET /item). */
function descriptionOf(item: EbayItemSummary): string | null {
  const text = item.shortDescription ?? (item.description ? item.description.replace(/<[^>]*>/g, ' ') : null);
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, DESCRIPTION_MAX) : null;
}

/** Out of stock = sold; past its end date = ended; otherwise active (search only returns live items). */
function statusOf(item: EbayItemSummary, at: Date): ListingStatus {
  if (item.estimatedAvailabilities?.some((a) => a.estimatedAvailabilityStatus === 'OUT_OF_STOCK')) return 'SOLD';
  const end = dateOf(item.itemEndDate);
  if (end && end.getTime() <= at.getTime()) return 'ENDED';
  return 'ACTIVE';
}
