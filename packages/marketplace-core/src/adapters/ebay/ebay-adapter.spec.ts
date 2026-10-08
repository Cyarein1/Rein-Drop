import { describe, expect, it } from 'vitest';
import { MarketplaceError } from '../../errors.js';
import { normalizeRawListing } from '../../raw-listing.js';
import type { MarketplaceSearchCriteria } from '../../search.js';
import { describeMarketplaceAdapterContract } from '../../testing/index.js';
import { EBAY_PROVIDER, EbayAdapter } from './ebay-adapter.js';
import { retryAfterOf } from './ebay-client.js';
import { FakeEbayServer, fakeItem, parseUrl } from './fake-ebay-server.test-helper.js';

const btoa = (globalThis as unknown as { btoa(s: string): string }).btoa;

const NOW = new Date('2026-10-08T12:30:00.000Z');
const CREDS = { clientId: 'test-client-id', clientSecret: 'test-client-secret', environment: 'production' as const, marketplaceId: 'EBAY_US' };
const criteria: MarketplaceSearchCriteria = { query: 'iphone', location: { text: 'Cape Town', radiusKm: 40 }, conditions: [], maxPrice: null, limit: 10, cursor: null };

const make = (server = new FakeEbayServer(), over: Partial<ConstructorParameters<typeof EbayAdapter>[0]> = {}) => {
  const adapter = new EbayAdapter({ ...CREDS, fetch: server.fetch, now: () => NOW, ...over });
  return { adapter, server };
};
const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as MarketplaceError);
const searchUrls = (s: FakeEbayServer) => s.requests.filter((r) => r.url.includes('/item_summary/search')).map((r) => parseUrl(r.url));

describeMarketplaceAdapterContract('eBay Browse API (fake eBay server)', {
  create: () => make().adapter,
  criteria,
});

describe('eBay Browse adapter', () => {
  it('authenticates with an application token (client credentials) and reuses it', async () => {
    const { adapter, server } = make();
    await adapter.search(criteria);
    await adapter.search(criteria);
    const token = server.requests.filter((r) => r.url.endsWith('/identity/v1/oauth2/token'));
    expect(token).toHaveLength(1);
    expect(token[0]).toMatchObject({ method: 'POST', url: 'https://api.ebay.com/identity/v1/oauth2/token' });
    expect(token[0]!.headers.Authorization).toBe(`Basic ${btoa('test-client-id:test-client-secret')}`);
    expect(token[0]!.body).toBe('grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope');
    const search = server.requests.find((r) => r.url.includes('/item_summary/search'))!;
    expect(search.headers).toMatchObject({ Authorization: 'Bearer token-1', 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' });
  });

  it('sandbox uses the sandbox host', async () => {
    const { adapter, server } = make(new FakeEbayServer(), { environment: 'sandbox' });
    await adapter.search(criteria);
    expect(server.requests.every((r) => r.url.startsWith('https://api.sandbox.ebay.com/'))).toBe(true);
  });

  it('asks for the newest listings first, with the filters the site can apply', async () => {
    const { adapter, server } = make();
    await adapter.search({ ...criteria, conditions: ['used', 'refurbished'], maxPrice: { amountMinor: 31_000, currency: 'USD' } });
    const url = searchUrls(server)[0]!;
    expect(url.pathname).toBe('/buy/browse/v1/item_summary/search');
    expect(Object.fromEntries(url.params)).toEqual({
      q: 'iphone',
      limit: '10',
      offset: '0',
      sort: 'newlyListed',
      filter: 'price:[..310.00],priceCurrency:USD,conditionIds:{3000|4000|5000|6000|2000|2010|2020|2030|2500}',
    });
  });

  it('a max price in another currency is not pushed down (matching re-applies it)', async () => {
    const { adapter, server } = make();
    await adapter.search({ ...criteria, maxPrice: { amountMinor: 450_000, currency: 'ZAR' } });
    expect(searchUrls(server)[0]!.params.has('filter')).toBe(false);
  });

  it('pages with an opaque offset cursor and stops at the last page', async () => {
    const { adapter } = make(new FakeEbayServer(25));
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await adapter.search({ ...criteria, cursor });
      ids.push(...page.listings.map((l) => l.externalId));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(ids).size).toBe(25);
    await expect(failure(adapter.search({ ...criteria, cursor: 'garbage' }))).resolves.toMatchObject({ code: 'UNSUPPORTED_CRITERIA' });
  });

  it("never asks past eBay's 10,000-result cap", async () => {
    const { adapter, server } = make();
    expect(await adapter.search({ ...criteria, cursor: 'o:10000' })).toEqual({ listings: [], nextCursor: null });
    expect(searchUrls(server)).toHaveLength(0);
    // Last allowed page: limit shrinks so offset + limit = 10,000, and there is no next page.
    const { adapter: a2, server: s2 } = make(new FakeEbayServer(0));
    await a2.search({ ...criteria, cursor: 'o:9995' });
    expect(searchUrls(s2)[0]!.params.get('limit')).toBe('5');
  });

  it('normalizes an eBay item: id, link, price, condition, location, images, freshness, shipping', async () => {
    const { adapter } = make();
    const raw = (await adapter.search(criteria)).listings[0]!;
    expect(raw).toMatchObject({ marketplace: 'ebay', provider: EBAY_PROVIDER, externalId: 'v1|110000000001|0', fetchedAt: NOW });
    const result = normalizeRawListing(adapter, raw);
    expect(result).toEqual({
      status: 'NORMALIZED',
      listing: {
        marketplace: 'ebay',
        externalId: 'v1|110000000001|0',
        url: 'https://www.ebay.com/itm/110000000001',
        title: 'Apple iPhone 13 256GB unlocked #1',
        description: 'Phone number 1, works perfectly.',
        price: { amountMinor: 30_150, currency: 'USD' },
        conditionText: 'Used',
        locationText: 'Austin, Texas, US',
        imageUrls: ['https://i.ebayimg.com/images/g/1/s-l1600.jpg', 'https://i.ebayimg.com/images/g/1b/s-l1600.jpg'],
        status: 'ACTIVE',
        listedAt: new Date('2026-10-08T11:00:00.000Z'),
        sourceMetadata: {
          legacyItemId: '110000000001',
          conditionId: '3000',
          buyingOptions: ['FIXED_PRICE'],
          bidCount: null,
          auctionEndsAt: null,
          freeShipping: false,
          shippingMinor: 1299,
          shippingCurrency: 'USD',
          shippingCostType: 'FIXED',
          sellerFeedbackPercent: 99.5,
          sellerFeedbackScore: 1201,
          site: 'EBAY_US',
        },
      },
    });
    expect(adapter.buyerCosts!(result.status === 'NORMALIZED' ? result.listing : (null as never))).toEqual([{ kind: 'shipping', label: 'Shipping', amount: { amountMinor: 1299, currency: 'USD' } }]);
  });

  it('auctions show the current bid; free shipping is a known zero; out of stock = sold; ended = ended', () => {
    const { adapter } = make();
    const norm = (payload: Record<string, unknown>) => {
      const r = adapter.normalize({ marketplace: 'ebay', provider: EBAY_PROVIDER, externalId: String(payload.itemId), payload: payload as never, fetchedAt: NOW });
      if (r.status !== 'NORMALIZED') throw new Error(r.reason);
      return r.listing;
    };
    const auction = norm(fakeItem(4, { buyingOptions: ['AUCTION'], currentBidPrice: { value: '120.00', currency: 'USD' }, bidCount: 7, itemEndDate: '2026-10-10T00:00:00.000Z' }));
    expect(auction.price).toEqual({ amountMinor: 12_000, currency: 'USD' });
    expect(auction.sourceMetadata).toMatchObject({ bidCount: 7, auctionEndsAt: '2026-10-10T00:00:00.000Z', freeShipping: true, shippingMinor: null });
    expect(adapter.buyerCosts!(auction)).toEqual([{ kind: 'shipping', label: 'Free shipping', amount: { amountMinor: 0, currency: 'USD' } }]);
    expect(norm(fakeItem(5, { estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'OUT_OF_STOCK' }] })).status).toBe('SOLD');
    expect(norm(fakeItem(5, { itemEndDate: '2026-10-08T12:00:00.000Z' })).status).toBe('ENDED');
    expect(norm(fakeItem(5, { itemCreationDate: undefined })).listedAt).toBeNull();
  });

  it('unusable records are FAILED, never thrown; another provider is SKIPPED', () => {
    const { adapter } = make();
    const r = (payload: unknown, provider = EBAY_PROVIDER) => adapter.normalize({ marketplace: 'ebay', provider, externalId: 'x', payload: payload as never, fetchedAt: NOW });
    expect(r(fakeItem(1, { title: '' })).status).toBe('FAILED');
    expect(r(fakeItem(1, { itemWebUrl: 'javascript:alert(1)' })).status).toBe('FAILED');
    expect(r({ nope: true }).status).toBe('FAILED');
    expect(r(fakeItem(1), 'dev').status).toBe('SKIPPED');
  });

  it('fetchListing re-reads one item; gone from eBay = null', async () => {
    const { adapter } = make();
    const raw = await adapter.fetchListing!('v1|110000000003|0');
    expect(raw?.externalId).toBe('v1|110000000003|0');
    const r = adapter.normalize(raw!);
    expect(r.status === 'NORMALIZED' && r.listing.description).toBe('Phone number 3, works perfectly.');
    expect(await adapter.fetchListing!('v1|999|0')).toBeNull();
  });

  describe('errors and rate limits', () => {
    it('429 -> RATE_LIMITED, honouring Retry-After (seconds or date), else a default wait', async () => {
      const server = new FakeEbayServer();
      server.inject({ status: 429, headers: { 'retry-after': '120' }, body: { errors: [{ errorId: 2001, message: 'Too many requests' }] } });
      const err = await failure(make(server).adapter.search(criteria));
      expect(err).toMatchObject({ code: 'RATE_LIMITED', retryable: true, retryAfter: new Date(NOW.getTime() + 120_000) });
      expect(err!.message).toContain('Too many requests');
      expect(retryAfterOf({ headers: { get: () => 'Thu, 08 Oct 2026 13:00:00 GMT' } }, NOW)).toEqual(new Date('2026-10-08T13:00:00.000Z'));
      expect(retryAfterOf({ headers: { get: () => null } }, NOW)).toEqual(new Date(NOW.getTime() + 60_000));
    });

    it('5xx and network failures are retryable UNAVAILABLE; 400 is not retryable', async () => {
      const server = new FakeEbayServer();
      server.inject({ status: 503 }, 'network', { status: 400, body: { errors: [{ errorId: 12002, message: 'Invalid filter' }] } });
      const { adapter } = make(server);
      expect(await failure(adapter.search(criteria))).toMatchObject({ code: 'UNAVAILABLE', retryable: true });
      expect(await failure(adapter.search(criteria))).toMatchObject({ code: 'UNAVAILABLE', retryable: true });
      expect(await failure(adapter.search(criteria))).toMatchObject({ code: 'UNSUPPORTED_CRITERIA', retryable: false, details: ['12002 Invalid filter'] });
    });

    it('an expired / revoked token is refreshed once', async () => {
      const server = new FakeEbayServer();
      server.inject({ status: 401, body: { errors: [{ errorId: 1001, message: 'Invalid access token' }] } });
      const { adapter } = make(server);
      expect((await adapter.search(criteria)).listings.length).toBeGreaterThan(0);
      expect(server.tokensIssued).toBe(2);
    });

    it('rejected credentials = NOT_CONFIGURED, never leaking the secret', async () => {
      const server = new FakeEbayServer();
      server.rejectCredentials = true;
      const { adapter } = make(server);
      const err = await failure(adapter.search(criteria));
      expect(err).toMatchObject({ code: 'NOT_CONFIGURED', retryable: false });
      expect(JSON.stringify({ m: err!.message, d: err!.details })).not.toContain('test-client-secret');
      expect(await adapter.health()).toMatchObject({ status: 'not_configured' });
    });

    it('unreadable responses are INVALID_RESPONSE', async () => {
      const server = new FakeEbayServer();
      server.inject({ status: 200, body: 'not json' });
      expect(await failure(make(server).adapter.search(criteria))).toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it('health is healthy when a token can be obtained, without spending search quota', async () => {
      const { adapter, server } = make();
      expect(await adapter.health()).toMatchObject({ marketplace: 'ebay', provider: EBAY_PROVIDER, status: 'healthy' });
      expect(searchUrls(server)).toHaveLength(0);
    });
  });
});
