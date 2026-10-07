import { describe, expect, it } from 'vitest';
import type { MarketplaceAdapter } from './adapter.js';
import { DevEbayAdapter } from './adapters/index.js';
import type { MarketplaceCapabilities } from './capabilities.js';
import { MarketplaceError } from './errors.js';
import { normalizeRawListing, rawListingProblems, type RawListingRecord } from './raw-listing.js';
import { MarketplaceRegistry } from './registry.js';
import { applicableCriteria, criteriaProblems, type MarketplaceSearchCriteria } from './search.js';

const caps: MarketplaceCapabilities = {
  location: 'optional',
  radius: true,
  priceFilter: true,
  conditionFilter: true,
  fetchListing: false,
  maxPageSize: 20,
};
const criteria: MarketplaceSearchCriteria = {
  query: 'iPhone 13',
  location: { text: 'Johannesburg', radiusKm: 50 },
  conditions: ['used'],
  maxPrice: { amountMinor: 500_000, currency: 'ZAR' },
  limit: 10,
  cursor: null,
};
const raw: RawListingRecord = {
  marketplace: 'ebay',
  provider: 'mock',
  externalId: 'abc',
  payload: { any: 'thing' },
  fetchedAt: new Date('2026-10-07T00:00:00Z'),
};

describe('search criteria', () => {
  it('accepts searchable criteria', () => {
    expect(criteriaProblems(caps, criteria)).toEqual([]);
  });

  it('flags blank queries, bad page sizes and a missing required location', () => {
    expect(criteriaProblems({ ...caps, location: 'required' }, { ...criteria, query: ' ', limit: 21, location: null })).toEqual([
      'query: Describe what to search for',
      'limit: Must be between 1 and 20',
      'location: This marketplace needs a location',
    ]);
    expect(criteriaProblems(caps, { ...criteria, limit: 0 })).toHaveLength(1);
    expect(criteriaProblems(caps, { ...criteria, limit: 2.5 })).toHaveLength(1);
  });

  it('keeps every filter the source supports', () => {
    expect(applicableCriteria(caps, criteria)).toEqual({ criteria, ignored: [] });
  });

  it('drops and reports filters the source cannot apply', () => {
    const none = { ...caps, location: 'unsupported' as const, radius: false, priceFilter: false, conditionFilter: false };
    expect(applicableCriteria(none, criteria)).toEqual({
      criteria: { ...criteria, location: null, maxPrice: null, conditions: [] },
      ignored: ['location', 'maxPrice', 'conditions'],
    });
    expect(applicableCriteria({ ...caps, radius: false }, criteria)).toEqual({
      criteria: { ...criteria, location: { text: 'Johannesburg', radiusKm: null } },
      ignored: ['radius'],
    });
  });
});

describe('raw listing handling', () => {
  it('validates raw records', () => {
    expect(rawListingProblems(raw)).toEqual([]);
    const bad = {
      marketplace: 'etsy',
      provider: ' ',
      externalId: '',
      payload: { when: new Date() },
      fetchedAt: new Date('nope'),
    } as unknown as RawListingRecord;
    expect(rawListingProblems(bad)).toEqual([
      'Unknown marketplace "etsy"',
      'Missing provider',
      'Missing externalId',
      'Invalid fetchedAt',
      'Payload is not JSON-serializable',
    ]);
  });

  const stub = (normalize: MarketplaceAdapter['normalize']): MarketplaceAdapter => ({
    marketplace: 'ebay',
    provider: 'mock',
    capabilities: caps,
    health: () => Promise.reject(new Error('unused')),
    search: () => Promise.reject(new Error('unused')),
    normalize,
  });

  it('turns a throwing normalizer into FAILED', () => {
    const result = normalizeRawListing(
      stub(() => {
        throw new Error('bad shape');
      }),
      raw,
    );
    expect(result).toEqual({ status: 'FAILED', reason: 'Normalizer threw: bad shape' });
  });

  it('refuses records from another marketplace and invalid records', () => {
    const adapter = stub(() => ({ status: 'SKIPPED', reason: 'unused' }));
    expect(normalizeRawListing(adapter, { ...raw, marketplace: 'facebook' }).status).toBe('FAILED');
    expect(normalizeRawListing(adapter, { ...raw, externalId: '' }).status).toBe('FAILED');
  });

  it('passes SKIPPED through and rejects listings that change identity or break the contract', () => {
    expect(normalizeRawListing(stub(() => ({ status: 'SKIPPED', reason: 'old format' })), raw)).toEqual({
      status: 'SKIPPED',
      reason: 'old format',
    });
    const listing = {
      marketplace: 'ebay' as const,
      externalId: 'abc',
      url: 'https://example.invalid/abc',
      title: 'Thing',
      description: null,
      price: { amountMinor: 100, currency: 'ZAR' },
      conditionText: null,
      locationText: null,
      imageUrls: [],
      status: 'ACTIVE' as const,
      listedAt: null,
      sourceMetadata: null,
    };
    expect(normalizeRawListing(stub(() => ({ status: 'NORMALIZED', listing })), raw).status).toBe('NORMALIZED');
    expect(normalizeRawListing(stub(() => ({ status: 'NORMALIZED', listing: { ...listing, externalId: 'xyz' } })), raw).status).toBe(
      'FAILED',
    );
    const negative = { ...listing, price: { amountMinor: -1, currency: 'ZAR' } };
    expect(normalizeRawListing(stub(() => ({ status: 'NORMALIZED', listing: negative })), raw)).toEqual({
      status: 'FAILED',
      reason: expect.stringContaining('price.amountMinor'),
    });
  });
});

describe('MarketplaceRegistry', () => {
  const now = new Date('2026-10-07T00:00:00Z');

  it('returns the configured adapter and NOT_CONFIGURED otherwise', () => {
    const ebay = new DevEbayAdapter();
    const registry = new MarketplaceRegistry([ebay]);
    expect(registry.get('ebay')).toBe(ebay);
    expect(registry.has('facebook')).toBe(false);
    expect(() => registry.get('facebook')).toThrow(MarketplaceError);
    try {
      registry.get('facebook');
    } catch (err) {
      expect((err as MarketplaceError).code).toBe('NOT_CONFIGURED');
    }
  });

  it('refuses two adapters for one marketplace', () => {
    const one = new DevEbayAdapter();
    expect(() => new MarketplaceRegistry([one, new DevEbayAdapter()])).toThrow(/Two adapters/);
  });

  it('reports health for every launch marketplace without rejecting', async () => {
    const broken = new DevEbayAdapter();
    broken.health = () => Promise.reject(new Error('dns'));
    const health = await new MarketplaceRegistry([broken], () => now).health();
    expect(health).toEqual([
      { marketplace: 'ebay', provider: 'dev', status: 'down', message: 'Health check failed: dns', checkedAt: now, retryAfter: null },
      { marketplace: 'facebook', provider: 'none', status: 'not_configured', message: 'No adapter configured', checkedAt: now, retryAfter: null },
    ]);
  });
});
