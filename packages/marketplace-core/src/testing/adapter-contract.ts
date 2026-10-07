import { describe, expect, it } from 'vitest';
import type { MarketplaceAdapter } from '../adapter.js';
import { capabilityProblems } from '../capabilities.js';
import { MarketplaceError } from '../errors.js';
import { SOURCE_HEALTH_STATUSES } from '../health.js';
import { isMarketplaceId } from '../ids.js';
import { normalizedListingSchema } from '../listing.js';
import { normalizeRawListing, rawListingProblems, type RawListingRecord } from '../raw-listing.js';
import type { MarketplaceSearchCriteria } from '../search.js';

export interface AdapterContractOptions {
  /** A fresh adapter per test. */
  create: () => MarketplaceAdapter;
  /** Criteria that return at least one listing (ideally more than one page at `limit`). */
  criteria: MarketplaceSearchCriteria;
  /** Pages to follow when checking pagination (default 5). */
  maxPages?: number;
}

async function expectMarketplaceError(promise: Promise<unknown>, code: MarketplaceError['code']) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, `expected a MarketplaceError ${code}`).toBeInstanceOf(MarketplaceError);
  expect((err as MarketplaceError).code).toBe(code);
  return err as MarketplaceError;
}

/**
 * The MarketplaceAdapter contract. Every adapter - mock, eBay, Facebook with any data provider -
 * must pass this suite; it encodes the rules documented on the MarketplaceAdapter interface.
 */
export function describeMarketplaceAdapterContract(name: string, options: AdapterContractOptions): void {
  const { create, criteria } = options;

  describe(`MarketplaceAdapter contract: ${name}`, () => {
    it('declares a known marketplace, a provider id and sane capabilities', () => {
      const adapter = create();
      expect(isMarketplaceId(adapter.marketplace)).toBe(true);
      expect(adapter.provider.trim()).not.toBe('');
      expect(capabilityProblems(adapter.capabilities)).toEqual([]);
      expect(criteria.limit).toBeLessThanOrEqual(adapter.capabilities.maxPageSize);
    });

    it('offers fetchListing exactly when the capability says so', () => {
      const adapter = create();
      expect(typeof adapter.fetchListing === 'function').toBe(adapter.capabilities.fetchListing);
    });

    it('reports health for itself without rejecting', async () => {
      const adapter = create();
      const health = await adapter.health();
      expect(health.marketplace).toBe(adapter.marketplace);
      expect(health.provider).toBe(adapter.provider);
      expect(SOURCE_HEALTH_STATUSES).toContain(health.status);
      expect(health.checkedAt).toBeInstanceOf(Date);
      expect(health.retryAfter === null || health.retryAfter instanceof Date).toBe(true);
    });

    it('returns valid raw records for its own source, within the limit and without duplicates', async () => {
      const adapter = create();
      const result = await adapter.search(criteria);
      expect(result.listings.length).toBeGreaterThan(0);
      expect(result.listings.length).toBeLessThanOrEqual(criteria.limit);
      for (const raw of result.listings) {
        expect(rawListingProblems(raw)).toEqual([]);
        expect(raw.marketplace).toBe(adapter.marketplace);
        expect(raw.provider).toBe(adapter.provider);
      }
      const ids = result.listings.map((r) => r.externalId);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('normalizes every record it returns into a valid Listing that keeps its identity', async () => {
      const adapter = create();
      const { listings } = await adapter.search(criteria);
      for (const raw of listings) {
        const result = normalizeRawListing(adapter, raw);
        expect(result, result.status === 'NORMALIZED' ? '' : result.reason).toMatchObject({ status: 'NORMALIZED' });
        if (result.status !== 'NORMALIZED') continue;
        expect(normalizedListingSchema.safeParse(result.listing).success).toBe(true);
        expect(result.listing.marketplace).toBe(raw.marketplace);
        expect(result.listing.externalId).toBe(raw.externalId);
      }
    });

    it('normalizes deterministically (pure)', async () => {
      const adapter = create();
      const [raw] = (await adapter.search(criteria)).listings;
      const copy = { ...raw!, payload: JSON.parse(JSON.stringify(raw!.payload)), fetchedAt: new Date(raw!.fetchedAt) };
      expect(adapter.normalize(raw!)).toEqual(adapter.normalize(copy));
    });

    it('returns FAILED for an unreadable payload instead of throwing', async () => {
      const adapter = create();
      const [raw] = (await adapter.search(criteria)).listings;
      for (const payload of [null, 42, 'text', [], { unexpected: true }]) {
        const broken: RawListingRecord = { ...raw!, payload };
        expect(() => adapter.normalize(broken)).not.toThrow();
        expect(normalizeRawListing(adapter, broken).status).toBe('FAILED');
      }
    });

    it("does not normalize another marketplace's records", async () => {
      const adapter = create();
      const [raw] = (await adapter.search(criteria)).listings;
      const other = adapter.marketplace === 'ebay' ? 'facebook' : 'ebay';
      expect(adapter.normalize({ ...raw!, marketplace: other }).status).not.toBe('NORMALIZED');
    });

    it('pages with cursors without repeating a listing', async () => {
      const adapter = create();
      const seen = new Set<string>();
      let cursor: string | null = null;
      for (let page = 0; page < (options.maxPages ?? 5); page += 1) {
        const result = await adapter.search({ ...criteria, cursor });
        for (const raw of result.listings) {
          expect(seen.has(raw.externalId), `repeated ${raw.externalId}`).toBe(false);
          seen.add(raw.externalId);
        }
        cursor = result.nextCursor;
        if (cursor === null) break;
        expect(result.listings.length).toBeGreaterThan(0);
      }
    });

    it('rejects a page size above its maximum with UNSUPPORTED_CRITERIA', async () => {
      const adapter = create();
      const err = await expectMarketplaceError(
        adapter.search({ ...criteria, limit: adapter.capabilities.maxPageSize + 1 }),
        'UNSUPPORTED_CRITERIA',
      );
      expect(err.marketplace).toBe(adapter.marketplace);
      expect(err.details.length).toBeGreaterThan(0);
    });

    it('rejects a blank query with UNSUPPORTED_CRITERIA', async () => {
      await expectMarketplaceError(create().search({ ...criteria, query: '   ' }), 'UNSUPPORTED_CRITERIA');
    });

    it('enforces a required location', async () => {
      const adapter = create();
      if (adapter.capabilities.location !== 'required') return;
      await expectMarketplaceError(adapter.search({ ...criteria, location: null }), 'UNSUPPORTED_CRITERIA');
    });

    it('rejects with ABORTED when the caller has cancelled', async () => {
      const signal = { aborted: true, reason: 'cancelled by test' };
      await expectMarketplaceError(create().search(criteria, { signal }), 'ABORTED');
    });

    it('fetches a known listing again and returns null for an unknown one', async () => {
      const adapter = create();
      if (!adapter.fetchListing) return;
      const [raw] = (await adapter.search(criteria)).listings;
      const again = await adapter.fetchListing(raw!.externalId);
      expect(again?.externalId).toBe(raw!.externalId);
      expect(rawListingProblems(again!)).toEqual([]);
      expect(await adapter.fetchListing('does-not-exist-0000')).toBeNull();
    });
  });
}
