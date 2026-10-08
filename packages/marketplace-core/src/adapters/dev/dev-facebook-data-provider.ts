import { z } from 'zod';
import type { MarketplaceCapabilities } from '../../capabilities.js';
import type { SearchOptions } from '../../search.js';
import type {
  FacebookDataProvider,
  FacebookNormalizeResult,
  FacebookProviderHealth,
  FacebookProviderPage,
  FacebookProviderRecord,
  FacebookSearchRequest,
} from '../facebook/facebook-data-provider.js';
import {
  DEV_HOST,
  buildDevListing,
  currencyDigits,
  degradedLimit,
  devDelay,
  devLatency,
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

export interface DevFacebookDataProviderOptions extends DevSourceOptions {
  /** Provider id (default `dev`). A second id simulates swapping providers. */
  id?: string;
  capabilities?: Partial<Omit<MarketplaceCapabilities, 'location'>>;
}

/**
 * Development payload format. Invented for development - not the format of any real Facebook
 * data source. Asking prices are whole major units, as people type them on Marketplace.
 */
const payloadSchema = z.object({
  dev: z.literal('facebook'),
  listingRef: z.string().min(1),
  headline: z.string().min(1),
  body: z.string(),
  ask: z.object({ amount: z.number().nonnegative(), currency: z.string() }).nullable(),
  conditionLabel: z.enum(['New', 'Used - like new', 'Used - good', 'Used - fair', 'Refurbished', 'For parts']),
  area: z.string(),
  distanceKm: z.number().nonnegative(),
  deliveryAvailable: z.boolean(),
  state: z.enum(['available', 'sold', 'removed']),
  postedAt: z.iso.datetime(),
  photos: z.array(z.string()),
  sellerJoinedYear: z.number().int(),
});
type Payload = z.infer<typeof payloadSchema>;

const USED_LABELS = ['Used - like new', 'Used - good', 'Used - fair'] as const;

/**
 * Deterministic development FacebookDataProvider: the same seeded catalogue as the eBay dev
 * adapter, local-pickup flavour (distance from the searched area, radius filtering, no-price
 * "message me" listings, removed listings). Used through the real FacebookAdapter, so the
 * production Facebook path is what gets exercised. TODO(marketplace): real provider TBD.
 */
export class DevFacebookDataProvider implements FacebookDataProvider {
  readonly id: string;
  readonly capabilities: Omit<MarketplaceCapabilities, 'location'>;
  readonly scenario: DevScenario;

  private readonly now: () => Date;
  private readonly epoch: Date;
  private readonly currency: string;
  private readonly latencyMs: number;
  /** Requests so far (the flaky scenario fails every other one). */
  private calls = 0;
  private readonly context = new Map<string, { currency: string; area: string }>();

  constructor(options: DevFacebookDataProviderOptions = {}) {
    this.id = options.id ?? 'dev';
    this.scenario = options.scenario ?? 'normal';
    this.now = options.now ?? (() => new Date());
    this.epoch = options.epoch ?? this.now();
    this.currency = options.currency ?? 'USD';
    this.latencyMs = options.latencyMs ?? 0;
    this.capabilities = {
      radius: true,
      priceFilter: true,
      conditionFilter: true,
      fetchListing: true,
      maxPageSize: 24,
      ...options.capabilities,
    };
  }

  async health(): Promise<FacebookProviderHealth> {
    return scenarioHealth(this.scenario, this.now());
  }

  async search(request: FacebookSearchRequest, options?: SearchOptions): Promise<FacebookProviderPage> {
    if (options?.signal?.aborted) throw new Error('aborted');
    await devDelay(devLatency(this.scenario, this.latencyMs), options?.signal);
    const now = this.now();
    const source = { marketplace: 'facebook' as const, provider: this.id };
    const failure = scenarioError(this.scenario, source, now, ++this.calls);
    if (failure) throw failure;
    if (this.scenario === 'empty') return { records: [], nextCursor: null };

    const radius = request.location.radiusKm;
    const found = devSearch('facebook', request, { currency: this.currency, epoch: this.epoch, now }).filter(
      (l) => radius === null || distanceKm(l) <= radius,
    );
    const degraded = this.scenario === 'degraded';
    const { page, nextCursor } = keysetPage(found, request.cursor, degraded ? degradedLimit(request.limit) : request.limit, source);
    const records = page.map((listing, i) => {
      this.context.set(listing.id, { currency: listing.currency, area: request.location.text });
      const record = this.toRecord(this.payload(listing, request.location.text, now), now);
      if (this.scenario === 'invalid_response') return { ...record, externalId: '' };
      if (this.scenario === 'malformed_payloads' && i % 4 === 3) return { ...record, payload: { dev: 'facebook', listingRef: listing.id } };
      return record;
    });
    // Development data is free: usage is recorded so every source reports the same way.
    const usage = { requests: 1, items: records.length, durationMs: null, costUsd: 0, costIsEstimate: false, details: { provider: this.id } };
    return degraded ? { records, nextCursor: null, partial: true, usage } : { records, nextCursor, usage };
  }

  async fetchListing(externalId: string, options?: SearchOptions): Promise<FacebookProviderRecord | null> {
    await devDelay(devLatency(this.scenario, this.latencyMs), options?.signal);
    const now = this.now();
    const failure = scenarioError(this.scenario, { marketplace: 'facebook', provider: this.id }, now, ++this.calls);
    if (failure) throw failure;
    const parsed = parseDevListingId('facebook', externalId);
    if (!parsed) return null;
    const ctx = this.context.get(externalId) ?? { currency: this.currency, area: 'Unknown area' };
    const listing = buildDevListing('facebook', parsed.product, parsed.devCase, { currency: ctx.currency, epoch: this.epoch });
    return this.toRecord(this.payload(listing, ctx.area, now), now);
  }

  normalize(record: FacebookProviderRecord): FacebookNormalizeResult {
    const parsed = payloadSchema.safeParse(record.payload);
    if (!parsed.success) return { status: 'FAILED', reason: `Payload is not in the "${this.id}" development format` };
    const p = parsed.data;
    return {
      status: 'NORMALIZED',
      listing: {
        externalId: p.listingRef,
        url: `${DEV_HOST}/facebook/item/${encodeURIComponent(p.listingRef)}`,
        title: p.headline,
        description: p.body,
        price: p.ask ? { amountMinor: Math.round(p.ask.amount * 10 ** currencyDigits(p.ask.currency)), currency: p.ask.currency } : null,
        conditionText: p.conditionLabel,
        locationText: p.area,
        imageUrls: p.photos,
        status: p.state === 'sold' ? 'SOLD' : p.state === 'removed' ? 'REMOVED' : 'ACTIVE',
        listedAt: new Date(p.postedAt),
        sourceMetadata: {
          synthetic: true,
          provider: this.id,
          distanceKm: p.distanceKm,
          deliveryAvailable: p.deliveryAvailable,
          sellerJoinedYear: p.sellerJoinedYear,
        },
      },
    };
  }

  private payload(listing: DevListing, area: string, now: Date): Payload {
    const { devCase, seed } = listing;
    const status = statusAt(listing, 'facebook', now);
    return {
      dev: 'facebook',
      listingRef: listing.id,
      headline: listing.title,
      body: listing.description,
      ask: listing.priceMajor === null ? null : { amount: listing.priceMajor, currency: listing.currency },
      conditionLabel: devCase.faulty
        ? 'For parts'
        : devCase.condition === 'new'
          ? 'New'
          : devCase.condition === 'refurbished'
            ? 'Refurbished'
            : USED_LABELS[seed % USED_LABELS.length]!,
      area,
      distanceKm: distanceKm(listing),
      deliveryAvailable: seed % 4 === 0,
      state: status === 'SOLD' ? 'sold' : status === 'REMOVED' ? 'removed' : 'available',
      postedAt: listing.listedAt.toISOString(),
      photos: [1, 2, 3, 4].slice(0, 1 + (seed % 4)).map((n) => `${DEV_HOST}/img/${listing.id}-${n}.jpg`),
      sellerJoinedYear: 2009 + (seed % 16),
    };
  }

  private toRecord(payload: Payload, now: Date): FacebookProviderRecord {
    return { externalId: payload.listingRef, payload, fetchedAt: now };
  }
}

/** Deterministic distance from the searched area: 1-60 km. */
function distanceKm(listing: DevListing): number {
  return 1 + (listing.seed % 60);
}
