import { describe, expect, it } from 'vitest';
import type { MarketplaceAdapter } from '../../adapter.js';
import type { MarketplaceError } from '../../errors.js';
import type { NormalizedListing } from '../../listing.js';
import { normalizeRawListing } from '../../raw-listing.js';
import type { MarketplaceSearchCriteria } from '../../search.js';
import { FacebookAdapter } from '../facebook/facebook-adapter.js';
import { DEV_CASES, DEV_PRODUCTS, matchingProducts } from './catalogue.js';
import { DevEbayAdapter } from './dev-ebay-adapter.js';
import { DevFacebookDataProvider } from './dev-facebook-data-provider.js';
import { DEV_SCENARIOS, devListingId, type DevScenario, type DevSourceOptions } from './dev-source.js';

const EPOCH = new Date('2026-10-07T08:00:00Z');
const MIN = 60_000;

/** A controllable clock starting at EPOCH. */
function clock() {
  let t = EPOCH.getTime();
  return { now: () => new Date(t), advance: (minutes: number) => (t += minutes * MIN) };
}

const base: MarketplaceSearchCriteria = {
  query: 'iphone 13',
  location: { text: 'Cape Town', radiusKm: null },
  conditions: [],
  maxPrice: null,
  /** Facebook dev provider's max page size. */
  limit: 24,
  cursor: null,
};

type Which = 'ebay' | 'facebook';
/** Clock pinned to EPOCH unless a test passes its own. */
const make = (which: Which, options: DevSourceOptions = {}): MarketplaceAdapter => {
  const opts = { epoch: EPOCH, now: () => EPOCH, ...options };
  return which === 'ebay' ? new DevEbayAdapter(opts) : new FacebookAdapter(new DevFacebookDataProvider(opts), opts.now);
};

async function listings(adapter: MarketplaceAdapter, criteria: Partial<MarketplaceSearchCriteria> = {}): Promise<NormalizedListing[]> {
  const { listings: raws } = await adapter.search({ ...base, ...criteria });
  return raws.map((raw) => {
    const result = normalizeRawListing(adapter, raw);
    if (result.status !== 'NORMALIZED') throw new Error(result.reason);
    return result.listing;
  });
}

const caseOf = (l: NormalizedListing) => DEV_CASES.find((c) => l.externalId.endsWith(`-${c.key}`))!.key;

describe('seeded catalogue', () => {
  it('covers phones and other electronics', () => {
    const categories = new Set(DEV_PRODUCTS.map((p) => p.category));
    expect(DEV_PRODUCTS.filter((p) => p.category === 'phones').length).toBeGreaterThanOrEqual(5);
    expect([...categories].sort()).toEqual(['audio', 'cameras', 'computers', 'consoles', 'phones', 'tablets']);
  });

  it('matches queries by words and prefixes, and nothing for unknown products', () => {
    expect(matchingProducts('iphone').map((p) => p.key)).toEqual(['iphone12', 'iphone13', 'iphone14pro']);
    expect(matchingProducts('galax s23').map((p) => p.key)).toEqual(['galaxys23']);
    expect(matchingProducts('PS5').map((p) => p.key)).toEqual(['ps5disc']);
    expect(matchingProducts('headphones').map((p) => p.key)).toEqual(['airpodspro2', 'sonyxm4']);
    expect(matchingProducts('toaster')).toEqual([]);
  });

  it.each(['ebay', 'facebook'] as const)('every seeded %s listing normalizes into a valid Listing', async (which) => {
    const adapter = make(which);
    let count = 0;
    for (const product of DEV_PRODUCTS) {
      for (const devCase of DEV_CASES.filter((c) => c.marketplaces.includes(which))) {
        const raw = await adapter.fetchListing!(devListingId(which, product, devCase));
        expect(raw, `${product.key}/${devCase.key}`).not.toBeNull();
        expect(normalizeRawListing(adapter, raw!).status).toBe('NORMALIZED');
        count += 1;
      }
    }
    expect(count).toBeGreaterThanOrEqual(DEV_PRODUCTS.length * 9);
  });
});

describe('price and condition cases', () => {
  it('eBay: deal < fair < overpriced, plus new, refurbished, for-parts and auction listings', async () => {
    const byCase = new Map((await listings(make('ebay'))).map((l) => [caseOf(l), l]));
    const price = (key: string) => byCase.get(key)!.price!.amountMinor;
    expect(price('deal')).toBeLessThan(price('fair'));
    expect(price('fair')).toBeLessThan(price('overpriced'));
    expect(price('for-parts')).toBeLessThan(price('deal'));
    expect(byCase.get('new-sealed')!.conditionText).toBe('New');
    expect(byCase.get('refurbished')!.conditionText).toBe('Seller refurbished');
    expect(byCase.get('for-parts')!.conditionText).toBe('For parts or not working');
    expect(byCase.get('auction')!.sourceMetadata).toMatchObject({ buyingFormat: 'AUCTION', bidCount: expect.any(Number) });
    expect(byCase.get('fair')!.sourceMetadata).toMatchObject({
      synthetic: true,
      buyingFormat: 'FIXED_PRICE',
      sellerFeedbackPercent: expect.any(Number),
      freeShipping: expect.any(Boolean),
    });
  });

  it('eBay: states its shipping as a buyer cost (free shipping is a known zero); unreadable metadata gives none', async () => {
    const adapter = make('ebay') as DevEbayAdapter;
    const all = await listings(adapter);
    const costs = all.map((l) => adapter.buyerCosts(l));
    expect(costs.every((c) => c.length === 1 && c[0]!.kind === 'shipping' && c[0]!.amount.currency === 'USD')).toBe(true);
    expect(costs.some((c) => c[0]!.label === 'Free shipping' && c[0]!.amount.amountMinor === 0)).toBe(true);
    expect(costs.some((c) => c[0]!.label === 'Shipping' && c[0]!.amount.amountMinor > 0)).toBe(true);
    expect(adapter.buyerCosts({ price: null, sourceMetadata: null })).toEqual([]);
    expect(adapter.buyerCosts({ price: null, sourceMetadata: { shippingMinor: '12', shippingCurrency: 'USD' } })).toEqual([]);
    // Facebook delivery charges aren't stated by the source.
    expect(make('facebook').buyerCosts).toBeUndefined();
  });

  it('Facebook: "message me" listings have no price; distance and delivery are in source metadata', async () => {
    const all = await listings(make('facebook'));
    const noPrice = all.find((l) => caseOf(l) === 'no-price')!;
    expect(noPrice.price).toBeNull();
    expect(noPrice.locationText).toBe('Cape Town');
    expect(noPrice.sourceMetadata).toMatchObject({ synthetic: true, distanceKm: expect.any(Number), deliveryAvailable: expect.any(Boolean) });
    expect(new Set(all.map((l) => l.conditionText))).toContain('For parts');
  });

  it('prices look local (ZAR, rounded like people type them) and fall back to USD for other currencies', async () => {
    const zar = await listings(make('ebay', { currency: 'ZAR' }));
    const fair = zar.find((l) => caseOf(l) === 'fair')!.price!;
    expect(fair.currency).toBe('ZAR');
    expect(fair.amountMinor % 5_000).toBe(0); // whole R50 steps
    expect(fair.amountMinor).toBeGreaterThan(300_000);

    const jpy = await listings(make('ebay', { currency: 'JPY' }));
    expect(new Set(jpy.map((l) => l.price?.currency))).toEqual(new Set(['USD']));
  });

  it('applies max price and condition filters it is given', async () => {
    const max = { amountMinor: 30_000, currency: 'USD' };
    const cheap = await listings(make('ebay'), { maxPrice: max });
    expect(cheap.length).toBeGreaterThan(0);
    expect(cheap.every((l) => l.price!.amountMinor <= 30_000)).toBe(true);

    const used = await listings(make('ebay'), { conditions: ['refurbished'] });
    expect(used.map(caseOf)).toEqual(['refurbished']);
  });

  it('Facebook honours the search radius', async () => {
    const near = await listings(make('facebook'), { query: 'iphone', location: { text: 'Durban', radiusKm: 10 } });
    const far = await listings(make('facebook'), { query: 'iphone', location: { text: 'Durban', radiusKm: 60 } });
    expect(near.length).toBeLessThan(far.length);
    expect(near.every((l) => (l.sourceMetadata!.distanceKm as number) <= 10)).toBe(true);
  });

  it('is deterministic: same clock, same listings', async () => {
    const a = await listings(make('facebook'), { query: 'iphone' });
    const b = await listings(make('facebook'), { query: 'iphone' });
    expect(a).toEqual(b);
  });
});

describe('freshness', () => {
  it('lists newest first with ages measured from the epoch', async () => {
    const all = await listings(make('ebay'));
    const times = all.map((l) => l.listedAt!.getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x));
    expect(all.some((l) => EPOCH.getTime() - l.listedAt!.getTime() < 60 * MIN)).toBe(true);
    expect(all.some((l) => EPOCH.getTime() - l.listedAt!.getTime() > 30 * 24 * 60 * MIN)).toBe(true);
  });

  it('eBay: hot listings sell, deals sell later and auctions end; refresh shows the new status', async () => {
    const c = clock();
    const adapter = make('ebay', { now: c.now });
    const id = (key: string) => `dev-ebay-iphone13-${key}`;
    const status = async (key: string) => {
      const result = normalizeRawListing(adapter, (await adapter.fetchListing!(id(key)))!);
      return result.status === 'NORMALIZED' ? result.listing.status : result.status;
    };

    expect((await listings(adapter)).map(caseOf)).toContain('just-listed-hot');
    c.advance(15);
    expect((await listings(adapter)).map(caseOf)).not.toContain('just-listed-hot');
    expect(await status('just-listed-hot')).toBe('SOLD');
    expect(await status('deal')).toBe('ACTIVE');
    c.advance(3 * 60);
    expect(await status('deal')).toBe('SOLD');
    expect(await status('auction')).toBe('ENDED');
    expect(await status('fair')).toBe('ACTIVE');
  });

  it('Facebook: withdrawn listings come back as REMOVED', async () => {
    const c = clock();
    const adapter = make('facebook', { now: c.now });
    c.advance(3 * 24 * 60);
    const raw = await adapter.fetchListing!('dev-facebook-pixel7-new-sealed');
    const result = normalizeRawListing(adapter, raw!);
    expect(result).toMatchObject({ status: 'NORMALIZED', listing: { status: 'REMOVED' } });
  });

  it('keyset pages never repeat or skip a listing even when one sells between pages', async () => {
    const c = clock();
    const adapter = make('ebay', { now: c.now });
    const first = await adapter.search({ ...base, query: 'iphone', limit: 5 });
    c.advance(15); // the hot listings sell in between
    const seen = new Set(first.listings.map((r) => r.externalId));
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await adapter.search({ ...base, query: 'iphone', limit: 5, cursor });
      for (const r of page.listings) {
        expect(seen.has(r.externalId)).toBe(false);
        seen.add(r.externalId);
      }
      cursor = page.nextCursor;
    }
    const stillActive = await adapter.search({ ...base, query: 'iphone', limit: 50 }); // eBay allows 50
    for (const r of stillActive.listings) expect(seen.has(r.externalId)).toBe(true);
  });
});

describe.each(['ebay', 'facebook'] as const)('%s development scenarios', (which) => {
  const now = () => EPOCH;
  const health = async (scenario: DevScenario) => (await make(which, { scenario, now }).health()).status;
  const failure = (scenario: DevScenario) =>
    make(which, { scenario, now })
      .search(base)
      .then(
        () => null,
        (e: unknown) => e as MarketplaceError,
      );

  it('covers every scenario', () => {
    expect(DEV_SCENARIOS).toHaveLength(8);
  });

  it('normal: healthy with results', async () => {
    expect(await health('normal')).toBe('healthy');
    expect((await listings(make(which))).length).toBeGreaterThan(0);
  });

  it('empty: healthy, no results', async () => {
    expect(await health('empty')).toBe('healthy');
    expect(await make(which, { scenario: 'empty' }).search(base)).toEqual({ listings: [], nextCursor: null });
  });

  it('degraded: health degraded, a short first page and no more pages', async () => {
    expect(await health('degraded')).toBe('degraded');
    const result = await make(which, { scenario: 'degraded' }).search({ ...base, query: 'iphone', limit: 10 });
    expect(result.listings.length).toBe(5);
    expect(result.nextCursor).toBeNull();
  });

  it('rate_limited: retryable error with retryAfter', async () => {
    expect(await health('rate_limited')).toBe('degraded');
    const err = await failure('rate_limited');
    expect(err).toMatchObject({ code: 'RATE_LIMITED', retryable: true, retryAfter: new Date(EPOCH.getTime() + MIN) });
  });

  it('unavailable: down, retryable error', async () => {
    expect(await health('unavailable')).toBe('down');
    expect(await failure('unavailable')).toMatchObject({ code: 'UNAVAILABLE', retryable: true });
  });

  it('not_configured: not retryable', async () => {
    expect(await health('not_configured')).toBe('not_configured');
    expect(await failure('not_configured')).toMatchObject({ code: 'NOT_CONFIGURED', retryable: false });
  });

  it('invalid_response: the adapter refuses records it cannot use', async () => {
    expect(await failure('invalid_response')).toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
  });

  it('malformed_payloads: unreadable records FAIL normalization, the rest normalize', async () => {
    const adapter = make(which, { scenario: 'malformed_payloads' });
    const { listings: raws } = await adapter.search({ ...base, query: 'iphone', limit: 12 });
    const statuses = raws.map((r) => normalizeRawListing(adapter, r).status);
    expect(statuses.filter((s) => s === 'FAILED')).toHaveLength(3);
    expect(statuses.filter((s) => s === 'NORMALIZED')).toHaveLength(raws.length - 3);
  });
});
