import { describe, expect, it } from 'vitest';
import type { MarketplaceError } from '../../../errors.js';
import { normalizeRawListing } from '../../../raw-listing.js';
import type { MarketplaceSearchCriteria } from '../../../search.js';
import { describeMarketplaceAdapterContract } from '../../../testing/index.js';
import { FacebookAdapter } from '../facebook-adapter.js';
import { APIFY_PROVIDER_ID, ApifyMarketplaceProvider, marketplaceSearchUrl } from './apify-marketplace-provider.js';
import { resolveFacebookSource } from './facebook-config.js';
import { FakeApify, apifyItem } from './fake-apify.test-helper.js';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const criteria: MarketplaceSearchCriteria = { query: 'iphone', location: { text: 'Cape Town', radiusKm: 40 }, conditions: [], maxPrice: null, limit: 20, cursor: null };

function make(api = new FakeApify(), over: Partial<ConstructorParameters<typeof ApifyMarketplaceProvider>[0]> = {}) {
  let t = 1_000;
  const provider = new ApifyMarketplaceProvider({ token: 'apify-test-token', currency: 'ZAR', fetch: api.fetch, now: () => NOW, clock: () => (t += 1500), ...over });
  return { provider, adapter: new FacebookAdapter(provider, () => NOW), api };
}
const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as MarketplaceError);

describeMarketplaceAdapterContract('Facebook via the Apify development provider (fake Apify API)', {
  create: () => make().adapter,
  criteria,
});

describe('Apify Facebook Marketplace provider', () => {
  it('runs the actor synchronously with a bearer token, the documented URL shape and cost caps', async () => {
    const { adapter, api } = make();
    await adapter.search({ ...criteria, query: 'iPhone 13' });
    const run = api.requests[0]!;
    expect(run.method).toBe('POST');
    expect(run.url).toBe(
      'https://api.apify.com/v2/actors/apify~facebook-marketplace-scraper/run-sync-get-dataset-items?maxItems=20&maxTotalChargeUsd=0.078&timeout=240&clean=true&format=json',
    );
    expect(run.url).not.toContain('token');
    expect(run.headers.Authorization).toBe('Bearer apify-test-token');
    expect(run.body).toEqual({
      startUrls: [{ url: 'https://www.facebook.com/marketplace/capetown/search/?query=iPhone%2013' }],
      resultsLimit: 20,
      includeListingDetails: false,
    });
  });

  it('location slug: letters only, lower case, first part of the place', () => {
    expect(marketplaceSearchUrl('Cape Town, South Africa', 'PS5 slim')).toBe('https://www.facebook.com/marketplace/capetown/search/?query=PS5%20slim');
    expect(marketplaceSearchUrl('São Paulo', 'x')).toContain('/marketplace/saopaulo/');
  });

  it('records request / result / cost metadata generically (estimate from the public price)', async () => {
    const { adapter } = make();
    const page = await adapter.search(criteria);
    expect(page.listings).toHaveLength(20);
    expect(page.nextCursor).toBeNull(); // one run = one page
    expect(page.usage).toEqual({
      requests: 1,
      items: 20,
      durationMs: 1500,
      costUsd: 0.052,
      costIsEstimate: true,
      details: { provider: APIFY_PROVIDER_ID, actor: 'apify~facebook-marketplace-scraper', resultsLimit: 20, costCapUsd: 0.078, startUrls: 1, pricePer1000Usd: 2.6 },
    });
  });

  it('normalizes to the marketplace-level Listing - no provider field names leak', async () => {
    const { adapter } = make();
    const raw = (await adapter.search(criteria)).listings[0]!;
    expect(raw).toMatchObject({ marketplace: 'facebook', provider: APIFY_PROVIDER_ID, externalId: '100000000000001' });
    const r = normalizeRawListing(adapter, raw);
    expect(r).toEqual({
      status: 'NORMALIZED',
      listing: {
        marketplace: 'facebook',
        externalId: '100000000000001',
        url: 'https://www.facebook.com/marketplace/item/100000000000001',
        title: 'iPhone 13 128GB #1',
        description: null,
        price: { amountMinor: 401_000, currency: 'ZAR' },
        conditionText: null,
        locationText: 'Cape Town, Western Cape',
        imageUrls: ['https://scontent.xx.fbcdn.net/v/t45/1.jpg'],
        status: 'ACTIVE',
        listedAt: null, // freshness = first seen (no posting time without listing details)
        sourceMetadata: { displayedPrice: 'R4010', salePending: false, deliveryTypes: ['IN_PERSON'] },
      },
    });
    // The seller's name (personal data) is never kept.
    expect(JSON.stringify(r)).not.toContain('Seller 1');
  });

  it('status, photos, currency and unusable records', () => {
    const { provider } = make();
    const norm = (over: Record<string, unknown>) => provider.normalize({ externalId: 'x', payload: apifyItem(2, over) as never, fetchedAt: NOW });
    const ok = (over: Record<string, unknown>) => {
      const r = norm(over);
      if (r.status !== 'NORMALIZED') throw new Error(r.reason);
      return r.listing;
    };
    expect(ok({ is_sold: true }).status).toBe('SOLD');
    expect(ok({ is_live: false }).status).toBe('REMOVED');
    expect(ok({ is_pending: true }).sourceMetadata).toMatchObject({ salePending: true });
    expect(ok({ primary_listing_photo: { something: 'else' } }).imageUrls).toEqual([]); // unknown shape: no image, no failure
    expect(ok({ listing_price: { amount: '65.00', currency: 'USD', formatted_amount: '$65' } }).price).toEqual({ amountMinor: 6500, currency: 'USD' });
    expect(ok({ listing_price: undefined }).price).toBeNull();
    expect(norm({ marketplace_listing_title: '' }).status).toBe('FAILED');
    expect(norm({ listingUrl: 'https://evil.example/x' }).status).toBe('FAILED');
    expect(provider.normalize({ externalId: 'x', payload: { nope: 1 } as never, fetchedAt: NOW }).status).toBe('FAILED');
  });

  it('declares itself slow by nature and offers no single-listing refresh', () => {
    const { adapter } = make();
    expect(adapter.capabilities).toMatchObject({ location: 'required', priceFilter: false, conditionFilter: false, radius: false, fetchListing: false, maxPageSize: 20, expectedLatencyMs: 90_000 });
    expect(adapter.fetchListing).toBeUndefined();
  });

  describe('errors, rate limits and cost limits', () => {
    const run = async (...injected: Parameters<FakeApify['inject']>) => {
      const api = new FakeApify();
      api.inject(...injected);
      return failure(make(api).adapter.search(criteria));
    };

    it('bad token / no access / unknown actor -> NOT_CONFIGURED, never echoing the token', async () => {
      for (const status of [401, 403, 404]) {
        const err = await run({ status, body: { error: { type: 'token-not-valid', message: 'Authentication token is not valid.' } } });
        expect(err).toMatchObject({ code: 'NOT_CONFIGURED', retryable: false });
        expect(err!.message).not.toContain('apify-test-token');
      }
    });

    it('402 out of credit -> RATE_LIMITED for an hour; 429 -> RATE_LIMITED (Retry-After or 10 s)', async () => {
      expect(await run({ status: 402 })).toMatchObject({ code: 'RATE_LIMITED', retryAfter: new Date(NOW.getTime() + 3_600_000) });
      expect(await run({ status: 429, headers: { 'retry-after': '30' } })).toMatchObject({ code: 'RATE_LIMITED', retryAfter: new Date(NOW.getTime() + 30_000) });
      expect(await run({ status: 429 })).toMatchObject({ retryAfter: new Date(NOW.getTime() + 10_000) });
    });

    it('408 (run over 300 s), 5xx and network -> retryable UNAVAILABLE; 400 not retryable; non-JSON invalid', async () => {
      expect(await run({ status: 408 })).toMatchObject({ code: 'UNAVAILABLE', retryable: true, message: expect.stringContaining('300 s') });
      expect(await run({ status: 503 })).toMatchObject({ code: 'UNAVAILABLE', retryable: true });
      expect(await run('network')).toMatchObject({ code: 'UNAVAILABLE', retryable: true });
      expect(await run({ status: 400, body: { error: { type: 'invalid-input', message: 'Input is not valid' } } })).toMatchObject({
        code: 'UNSUPPORTED_CRITERIA',
        details: ['invalid-input: Input is not valid'],
      });
      expect(await run({ status: 201, body: 'not json' })).toMatchObject({ code: 'INVALID_RESPONSE' });
      expect(await run({ status: 201, body: { not: 'a list' } })).toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it('health checks the token and actor without running it', async () => {
      const api = new FakeApify();
      const { adapter } = make(api);
      expect(await adapter.health()).toMatchObject({ status: 'healthy', provider: APIFY_PROVIDER_ID });
      expect(api.requests.every((r) => r.method === 'GET')).toBe(true);
      const bad = new FakeApify();
      bad.inject({ status: 401 });
      expect((await make(bad).adapter.health()).status).toBe('not_configured');
    });
  });
});

describe('Facebook source from the environment', () => {
  it('development provider by default (mock mode preserved)', () => {
    expect(resolveFacebookSource({}, 'development')).toEqual({ apify: null, problems: [] });
    expect(resolveFacebookSource({}, 'production')).toEqual({ apify: null, problems: [] });
  });

  it('apify needs a token and the region currency, and is refused in production', () => {
    expect(resolveFacebookSource({ FACEBOOK_SOURCE: 'apify' }, 'development').problems).toHaveLength(2);
    expect(resolveFacebookSource({ FACEBOOK_SOURCE: 'apify', APIFY_TOKEN: 't', FACEBOOK_APIFY_CURRENCY: 'ZAR', FACEBOOK_APIFY_RESULTS_LIMIT: 10 }, 'test')).toEqual({
      apify: { token: 't', currency: 'ZAR', actor: undefined, resultsLimit: 10, pricePer1000Usd: undefined, timeoutSeconds: undefined },
      problems: [],
    });
    expect(resolveFacebookSource({ FACEBOOK_SOURCE: 'apify', APIFY_TOKEN: 't', FACEBOOK_APIFY_CURRENCY: 'ZAR' }, 'production').problems[0]).toMatch(/development integration/);
  });
});
