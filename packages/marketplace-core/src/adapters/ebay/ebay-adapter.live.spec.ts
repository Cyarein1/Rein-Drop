import { describe, expect, it } from 'vitest';
import { normalizedListingSchema } from '../../listing.js';
import { normalizeRawListing } from '../../raw-listing.js';
import type { MarketplaceSearchCriteria } from '../../search.js';
import { EBAY_PROVIDER, EbayAdapter } from './ebay-adapter.js';
import type { EbayEnvironment } from './ebay-browse-schema.js';

/**
 * LIVE tests against the real eBay Browse API. Skipped unless credentials are in the environment:
 *   EBAY_CLIENT_ID, EBAY_CLIENT_SECRET (required), EBAY_ENVIRONMENT (production | sandbox,
 *   default production), EBAY_MARKETPLACE_ID (default EBAY_US).
 * Never commit credentials: put them in an untracked .env or the shell for one run, e.g.
 *   EBAY_CLIENT_ID=... EBAY_CLIENT_SECRET=... pnpm --filter @rein-drop/marketplace-core test
 * Uses ~5 calls of the Browse API quota. Sandbox data is sparse; assertions allow few results.
 */
const env = ((globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}) as Record<string, string | undefined>;
const clientId = env.EBAY_CLIENT_ID;
const clientSecret = env.EBAY_CLIENT_SECRET;
const hasCredentials = Boolean(clientId && clientSecret);
const environment: EbayEnvironment = env.EBAY_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production';

describe.skipIf(!hasCredentials)('eBay Browse API (LIVE - needs EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)', () => {
  const adapter = () =>
    new EbayAdapter({ clientId: clientId!, clientSecret: clientSecret!, environment, marketplaceId: env.EBAY_MARKETPLACE_ID ?? 'EBAY_US', maxPageSize: 5 });
  const criteria: MarketplaceSearchCriteria = { query: 'iphone', location: null, conditions: [], maxPrice: null, limit: 5, cursor: null };

  it('the credentials work (health)', async () => {
    expect(await adapter().health()).toMatchObject({ marketplace: 'ebay', provider: EBAY_PROVIDER, status: 'healthy' });
  }, 30_000);

  it('searches, normalizes every result, newest first, and pages without repeats', async () => {
    const a = adapter();
    const first = await a.search(criteria);
    expect(first.listings.length).toBeGreaterThan(0);
    const listings = first.listings.map((raw) => {
      const r = normalizeRawListing(a, raw);
      expect(r.status, r.status === 'NORMALIZED' ? '' : r.reason).toBe('NORMALIZED');
      if (r.status !== 'NORMALIZED') throw new Error(r.reason);
      expect(normalizedListingSchema.safeParse(r.listing).success).toBe(true);
      expect(r.listing.url).toMatch(/^https:\/\//);
      return r.listing;
    });
    const dates = listings.map((l) => l.listedAt?.getTime()).filter((t): t is number => t !== undefined);
    for (let i = 1; i < dates.length; i++) expect(dates[i]!).toBeLessThanOrEqual(dates[i - 1]! + 60_000); // sort=newlyListed
    if (first.nextCursor) {
      const second = await a.search({ ...criteria, cursor: first.nextCursor });
      const ids = new Set(first.listings.map((l) => l.externalId));
      expect(second.listings.filter((l) => ids.has(l.externalId)).length).toBeLessThanOrEqual(1); // live data shifts a little
    }
  }, 60_000);

  it('re-reads one listing by its eBay id', async () => {
    const a = adapter();
    const [raw] = (await a.search(criteria)).listings;
    if (!raw) return;
    const again = await a.fetchListing!(raw.externalId);
    expect(again?.externalId).toBe(raw.externalId);
    expect(normalizeRawListing(a, again!).status).toBe('NORMALIZED');
  }, 60_000);
});
