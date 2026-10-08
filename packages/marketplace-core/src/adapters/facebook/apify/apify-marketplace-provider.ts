import { z } from 'zod';
import { MarketplaceError } from '../../../errors.js';
import type { JsonValue } from '../../../json.js';
import type { ListingStatus } from '../../../listing.js';
import type { CancellationSignal, SearchOptions, SourceUsage } from '../../../search.js';
import type { FetchLike, HttpResponse } from '../../http.js';
import { decimalToMinor } from '../../money.js';
import type {
  FacebookDataProvider,
  FacebookNormalizeResult,
  FacebookProviderHealth,
  FacebookProviderPage,
  FacebookProviderRecord,
  FacebookSearchRequest,
} from '../facebook-data-provider.js';

/**
 * DEVELOPMENT Facebook data provider: Apify's "Facebook Marketplace Scraper" actor through the
 * Apify API v2 (`run-sync-get-dataset-items`). Documented in docs/providers/facebook-apify.md -
 * authentication, query capabilities, freshness, pagination, rate / cost behaviour, limitations.
 * Not approved for production (terms - D12).
 *
 * The provider owns its payload end to end: Apify field names never leave this file - normalize()
 * returns the marketplace-level Listing, and search() reports usage / cost generically.
 */
export const APIFY_PROVIDER_ID = 'apify-marketplace';
export const APIFY_DEFAULT_ACTOR = 'apify~facebook-marketplace-scraper';
/** Apify's public pay-per-result price for the actor (USD per 1,000 listings). */
export const APIFY_DEFAULT_PRICE_PER_1000_USD = 2.6;
/** The synchronous endpoint waits at most this long (Apify returns 408 after). */
export const APIFY_SYNC_LIMIT_SECONDS = 300;

export interface ApifyMarketplaceConfig {
  token: string;
  /** ISO currency of the searched region (the output has no currency code). */
  currency: string;
  actor?: string;
  resultsLimit?: number;
  pricePer1000Usd?: number;
  timeoutSeconds?: number;
}

export interface ApifyMarketplaceOptions extends ApifyMarketplaceConfig {
  fetch?: FetchLike;
  now?: () => Date;
  /** Wall clock for durations (default: Date.now). */
  clock?: () => number;
}

const API = 'https://api.apify.com/v2';
const PAYMENT_WAIT_MS = 60 * 60_000;
const RATE_LIMIT_WAIT_MS = 10_000;

/** The actor's documented output, read leniently (unknown fields ignored). */
const itemSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    listingUrl: z.string().optional(),
    marketplace_listing_title: z.string().optional(),
    listing_price: z
      .object({ amount: z.union([z.string(), z.number()]).optional(), formatted_amount: z.string().optional(), currency: z.string().optional() })
      .passthrough()
      .optional(),
    location: z
      .object({ reverse_geocode: z.object({ city: z.string().optional(), state: z.string().optional() }).passthrough().optional() })
      .passthrough()
      .optional(),
    primary_listing_photo: z.unknown().optional(),
    is_live: z.boolean().optional(),
    is_sold: z.boolean().optional(),
    is_pending: z.boolean().optional(),
    delivery_types: z.array(z.string()).optional(),
  })
  .passthrough();
type ApifyItem = z.infer<typeof itemSchema>;

export class ApifyMarketplaceProvider implements FacebookDataProvider {
  readonly id = APIFY_PROVIDER_ID;
  readonly capabilities;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly clock: () => number;
  private readonly actor: string;
  private readonly resultsLimit: number;
  private readonly pricePer1000: number;
  private readonly timeoutSeconds: number;

  constructor(private readonly options: ApifyMarketplaceOptions) {
    const f = options.fetch ?? (globalThis as unknown as { fetch?: FetchLike }).fetch;
    if (!f) throw new Error('No fetch implementation available');
    this.fetchImpl = f;
    this.now = options.now ?? (() => new Date());
    this.clock = options.clock ?? (() => Date.now());
    this.actor = options.actor ?? APIFY_DEFAULT_ACTOR;
    this.resultsLimit = Math.min(100, Math.max(1, options.resultsLimit ?? 20));
    this.pricePer1000 = options.pricePer1000Usd ?? APIFY_DEFAULT_PRICE_PER_1000_USD;
    this.timeoutSeconds = Math.min(APIFY_SYNC_LIMIT_SECONDS - 10, Math.max(30, options.timeoutSeconds ?? 240));
    this.capabilities = {
      radius: false,
      priceFilter: false,
      conditionFilter: false,
      fetchListing: false,
      maxPageSize: this.resultsLimit,
      // A run starts a browser and loads Facebook: tens of seconds is normal.
      expectedLatencyMs: 90_000,
    };
  }

  private get source() {
    return { marketplace: 'facebook' as const, provider: this.id };
  }

  /** Checks the token and actor without running it (no cost). */
  async health(): Promise<FacebookProviderHealth> {
    try {
      const res = await this.request('GET', `${API}/actors/${encodeURIComponent(this.actor)}`);
      if (res.status >= 200 && res.status < 300) return { status: 'healthy', message: null, retryAfter: null };
      const err = await this.failure(res);
      if (err.code === 'NOT_CONFIGURED') return { status: 'not_configured', message: err.message, retryAfter: null };
      if (err.code === 'RATE_LIMITED') return { status: 'degraded', message: err.message, retryAfter: err.retryAfter };
      return { status: 'down', message: err.message, retryAfter: null };
    } catch (err) {
      return { status: 'down', message: err instanceof Error ? err.message : String(err), retryAfter: null };
    }
  }

  async search(request: FacebookSearchRequest, options?: SearchOptions): Promise<FacebookProviderPage> {
    const limit = Math.min(request.limit, this.resultsLimit);
    const startUrl = marketplaceSearchUrl(request.location.text, request.query);
    const costCap = round((limit * this.pricePer1000) / 1000 * 1.5, 4);
    const params = [`maxItems=${limit}`, `maxTotalChargeUsd=${costCap}`, `timeout=${this.timeoutSeconds}`, 'clean=true', 'format=json'];
    const started = this.clock();
    const res = await this.request('POST', `${API}/actors/${encodeURIComponent(this.actor)}/run-sync-get-dataset-items?${params.join('&')}`, options?.signal, {
      startUrls: [{ url: startUrl }],
      resultsLimit: limit,
      includeListingDetails: false,
    });
    if (res.status < 200 || res.status >= 300) throw await this.failure(res);
    const body = this.parse(await res.text());
    if (!Array.isArray(body)) throw new MarketplaceError('INVALID_RESPONSE', 'Apify returned something other than a list of items', this.source);

    const fetchedAt = this.now();
    const seen = new Set<string>();
    const records: FacebookProviderRecord[] = [];
    for (const item of body.slice(0, limit)) {
      const parsed = itemSchema.safeParse(item);
      const id = parsed.success ? parsed.data.id.trim() : '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      records.push({ externalId: id, payload: item as JsonValue, fetchedAt });
    }
    const usage: SourceUsage = {
      requests: 1,
      items: body.length,
      durationMs: Math.max(0, Math.round(this.clock() - started)),
      // Pay per result: estimated from the configured public price (billing is Apify's).
      costUsd: round((body.length * this.pricePer1000) / 1000, 6),
      costIsEstimate: true,
      details: { provider: this.id, actor: this.actor, resultsLimit: limit, costCapUsd: costCap, startUrls: 1, pricePer1000Usd: this.pricePer1000 },
    };
    // One run = one "page": the actor always scrapes from the top of the search.
    return { records, nextCursor: null, usage };
  }

  /** Apify actor output -> marketplace-level Listing (no Apify field names leave this method). */
  normalize(record: FacebookProviderRecord): FacebookNormalizeResult {
    const parsed = itemSchema.safeParse(record.payload);
    if (!parsed.success) return { status: 'FAILED', reason: 'Payload is not an Apify Marketplace item' };
    const item = parsed.data;
    const title = item.marketplace_listing_title?.trim();
    if (!title) return { status: 'FAILED', reason: 'Listing has no title' };
    const url = listingUrlOf(item);
    if (!url) return { status: 'FAILED', reason: 'Listing has no Facebook link' };

    const currency = item.listing_price?.currency && /^[A-Z]{3}$/.test(item.listing_price.currency) ? item.listing_price.currency : this.options.currency;
    const amount = item.listing_price?.amount;
    const minor = amount === undefined ? null : decimalToMinor(typeof amount === 'number' ? amount.toFixed(2) : amount.trim(), currency);
    const city = item.location?.reverse_geocode?.city?.trim();
    const state = item.location?.reverse_geocode?.state?.trim();
    const image = photoUrlOf(item.primary_listing_photo);
    return {
      status: 'NORMALIZED',
      listing: {
        externalId: item.id,
        url,
        title,
        description: null,
        price: minor === null ? null : { amountMinor: minor, currency },
        conditionText: null,
        locationText: [city, state].filter(Boolean).join(', ') || null,
        imageUrls: image ? [image] : [],
        status: statusOf(item),
        listedAt: null,
        sourceMetadata: {
          displayedPrice: item.listing_price?.formatted_amount ?? null,
          salePending: item.is_pending ?? false,
          deliveryTypes: item.delivery_types ?? [],
        },
      },
    };
  }

  private async request(method: 'GET' | 'POST', url: string, signal?: CancellationSignal, body?: unknown): Promise<HttpResponse> {
    if (signal?.aborted) throw new MarketplaceError('ABORTED', 'Search was cancelled', this.source);
    try {
      return await this.fetchImpl(url, {
        method,
        // Bearer header (Apify's recommendation) - the token never goes in a URL.
        headers: { Authorization: `Bearer ${this.options.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw new MarketplaceError('ABORTED', 'Search was cancelled', { ...this.source, cause: err });
      throw new MarketplaceError('UNAVAILABLE', 'Could not reach Apify', { ...this.source, cause: err });
    }
  }

  private parse(text: string): unknown {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new MarketplaceError('INVALID_RESPONSE', 'Apify returned a response that is not JSON', this.source);
    }
  }

  /** Apify HTTP failure -> MarketplaceError ({ error: { type, message } } bodies; never the token). */
  private async failure(res: HttpResponse): Promise<MarketplaceError> {
    let detail = '';
    try {
      const body = JSON.parse(await res.text()) as { error?: { type?: string; message?: string } };
      detail = [body.error?.type, body.error?.message].filter(Boolean).join(': ');
    } catch {
      // not JSON
    }
    const message = `Apify returned HTTP ${res.status}${detail ? ` (${detail})` : ''}`;
    const details = detail ? [detail] : [];
    const now = this.now().getTime();
    switch (true) {
      case res.status === 401 || res.status === 403 || res.status === 404:
        return new MarketplaceError('NOT_CONFIGURED', `${message} - check APIFY_TOKEN and the actor id`, { ...this.source, details });
      case res.status === 402:
        // Out of credit / over the spending limit: nothing will work for a while.
        return new MarketplaceError('RATE_LIMITED', `${message} - Apify credit or spending limit reached`, { ...this.source, details, retryAfter: new Date(now + PAYMENT_WAIT_MS) });
      case res.status === 429: {
        const header = Number(res.headers.get('retry-after'));
        return new MarketplaceError('RATE_LIMITED', message, { ...this.source, details, retryAfter: new Date(now + (Number.isFinite(header) && header > 0 ? header * 1000 : RATE_LIMIT_WAIT_MS)) });
      }
      case res.status === 408 || res.status >= 500:
        return new MarketplaceError('UNAVAILABLE', res.status === 408 ? `${message} - the run took longer than ${APIFY_SYNC_LIMIT_SECONDS} s` : message, { ...this.source, details });
      default:
        return new MarketplaceError('UNSUPPORTED_CRITERIA', message, { ...this.source, details });
    }
  }
}

/**
 * The Marketplace search URL for a free-text place: the documented `/marketplace/<city>/search/
 * ?query=` shape, with the city slug guessed as letters only, lower case ("Cape Town" ->
 * "capetown"). TODO(geo): real place ids once geocoding exists (decision 0001).
 */
export function marketplaceSearchUrl(location: string, query: string): string {
  const slug = location
    .split(',')[0]!
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return `https://www.facebook.com/marketplace/${slug || 'category'}/search/?query=${encodeURIComponent(query.trim())}`;
}

function listingUrlOf(item: ApifyItem): string | null {
  const url = item.listingUrl ?? `https://www.facebook.com/marketplace/item/${item.id}`;
  return /^https:\/\/(www\.|m\.)?facebook\.com\//.test(url) ? url : null;
}

/** The cover photo's URL when it has one of the shapes Facebook uses; otherwise none. */
function photoUrlOf(photo: unknown): string | null {
  if (!photo || typeof photo !== 'object') return null;
  const p = photo as { image?: { uri?: unknown }; photo_image_url?: unknown; uri?: unknown };
  const candidate = p.image?.uri ?? p.photo_image_url ?? p.uri;
  return typeof candidate === 'string' && candidate.startsWith('https://') ? candidate : null;
}

function statusOf(item: ApifyItem): ListingStatus {
  if (item.is_sold) return 'SOLD';
  if (item.is_live === false) return 'REMOVED';
  return 'ACTIVE';
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
