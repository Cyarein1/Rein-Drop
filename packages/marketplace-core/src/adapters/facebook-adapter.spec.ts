import { describe, expect, it, vi } from 'vitest';
import { MarketplaceError } from '../errors.js';
import { normalizeRawListing } from '../raw-listing.js';
import type { MarketplaceSearchCriteria } from '../search.js';
import { FacebookAdapter, DevFacebookDataProvider } from './index.js';

const criteria: MarketplaceSearchCriteria = {
  query: 'PS5',
  location: { text: 'Durban', radiusKm: 60 },
  conditions: ['used'],
  maxPrice: null,
  limit: 5,
  cursor: null,
};

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e as MarketplaceError,
  );

describe('FacebookAdapter', () => {
  it('swaps data providers without changing the adapter', async () => {
    const a = new FacebookAdapter(new DevFacebookDataProvider({ id: 'provider-a' }));
    const b = new FacebookAdapter(new DevFacebookDataProvider({ id: 'provider-b' }));

    const fromA = (await a.search(criteria)).listings;
    const fromB = (await b.search(criteria)).listings;
    expect(fromA.every((r) => r.marketplace === 'facebook' && r.provider === 'provider-a')).toBe(true);
    expect(fromB.every((r) => r.provider === 'provider-b')).toBe(true);
    expect(normalizeRawListing(b, fromB[0]!).status).toBe('NORMALIZED');

    // Records kept from the old provider are skipped, not misread, by the new one.
    const old = normalizeRawListing(b, fromA[0]!);
    expect(old).toEqual({ status: 'SKIPPED', reason: expect.stringContaining('provider-a') });
  });

  it('always requires a location and never calls the provider without one', async () => {
    const provider = new DevFacebookDataProvider();
    const search = vi.spyOn(provider, 'search');
    const adapter = new FacebookAdapter(provider);

    expect(adapter.capabilities.location).toBe('required');
    const err = await rejection(adapter.search({ ...criteria, location: null }));
    expect(err).toBeInstanceOf(MarketplaceError);
    expect(err.code).toBe('UNSUPPORTED_CRITERIA');
    expect(err.details).toContain('location: This marketplace needs a location');
    expect(search).not.toHaveBeenCalled();
  });

  it("drops filters the provider can't apply before calling it", async () => {
    const provider = new DevFacebookDataProvider({ capabilities: { conditionFilter: false, radius: false } });
    const search = vi.spyOn(provider, 'search');
    await new FacebookAdapter(provider).search(criteria);
    const request = search.mock.calls[0]![0];
    expect(request.conditions).toEqual([]);
    expect(request.location).toEqual({ text: 'Durban', radiusKm: null });
  });

  it('wraps unexpected provider errors as retryable UNAVAILABLE and keeps the cause', async () => {
    const provider = new DevFacebookDataProvider();
    const boom = new Error('socket hang up');
    vi.spyOn(provider, 'search').mockRejectedValue(boom);
    const err = await rejection(new FacebookAdapter(provider).search(criteria));
    expect(err.code).toBe('UNAVAILABLE');
    expect(err.retryable).toBe(true);
    expect(err.provider).toBe('dev');
    expect(err.cause).toBe(boom);
  });

  it('passes MarketplaceErrors through (e.g. rate limits with retryAfter)', async () => {
    const now = new Date('2026-10-07T10:00:00Z');
    const adapter = new FacebookAdapter(new DevFacebookDataProvider({ scenario: 'rate_limited', now: () => now }));
    const err = await rejection(adapter.search(criteria));
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryable).toBe(true);
    expect(err.retryAfter).toEqual(new Date('2026-10-07T10:01:00Z'));
  });

  it('rejects provider output that breaks the raw-record contract', async () => {
    const provider = new DevFacebookDataProvider();
    vi.spyOn(provider, 'search').mockResolvedValue({
      records: [{ externalId: '', payload: {}, fetchedAt: new Date() }],
      nextCursor: null,
    });
    const err = await rejection(new FacebookAdapter(provider).search(criteria));
    expect(err.code).toBe('INVALID_RESPONSE');
    expect(err.retryable).toBe(false);
  });

  it('fails normalization when the provider produces an invalid Listing', async () => {
    const provider = new DevFacebookDataProvider();
    const adapter = new FacebookAdapter(provider);
    const [raw] = (await adapter.search(criteria)).listings;
    vi.spyOn(provider, 'normalize').mockReturnValue({
      status: 'NORMALIZED',
      listing: {
        externalId: raw!.externalId,
        url: 'javascript:alert(1)',
        title: 'x',
        description: null,
        price: null,
        conditionText: null,
        locationText: null,
        imageUrls: [],
        status: 'ACTIVE',
        listedAt: null,
        sourceMetadata: null,
      },
    });
    const result = normalizeRawListing(adapter, raw!);
    expect(result).toEqual({ status: 'FAILED', reason: expect.stringContaining('url') });
  });

  it('reports provider health, and down when the check itself fails', async () => {
    const now = new Date('2026-10-07T10:00:00Z');
    const degraded = new FacebookAdapter(new DevFacebookDataProvider({ scenario: 'degraded' }), () => now);
    expect(await degraded.health()).toMatchObject({ marketplace: 'facebook', provider: 'dev', status: 'degraded', checkedAt: now });

    const provider = new DevFacebookDataProvider();
    vi.spyOn(provider, 'health').mockRejectedValue(new Error('timeout'));
    expect(await new FacebookAdapter(provider).health()).toMatchObject({ status: 'down', message: expect.stringContaining('timeout') });
  });

  it('has no fetchListing when the provider cannot refresh', () => {
    const adapter = new FacebookAdapter(new DevFacebookDataProvider({ capabilities: { fetchListing: false } }));
    expect(adapter.capabilities.fetchListing).toBe(false);
    expect(adapter.fetchListing).toBeUndefined();
  });
});
