import { describe, expect, it } from 'vitest';
import { normalizedListingSchema } from '../../../listing.js';
import { normalizeRawListing } from '../../../raw-listing.js';
import { FacebookAdapter } from '../facebook-adapter.js';
import { ApifyMarketplaceProvider } from './apify-marketplace-provider.js';

/**
 * LIVE test against Apify (costs money: one run of 5 results = about USD 0.013 at the public
 * price). Skipped unless the environment has:
 *   APIFY_TOKEN, FACEBOOK_APIFY_CURRENCY (e.g. USD) and optionally
 *   FACEBOOK_APIFY_LIVE_LOCATION (default "San Francisco"), FACEBOOK_APIFY_LIVE_QUERY (default "guitar").
 * Never commit the token: shell or untracked .env only.
 */
const env = ((globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}) as Record<string, string | undefined>;
const ready = Boolean(env.APIFY_TOKEN && env.FACEBOOK_APIFY_CURRENCY);

describe.skipIf(!ready)('Apify Facebook Marketplace provider (LIVE - needs APIFY_TOKEN + FACEBOOK_APIFY_CURRENCY)', () => {
  const adapter = () =>
    new FacebookAdapter(new ApifyMarketplaceProvider({ token: env.APIFY_TOKEN!, currency: env.FACEBOOK_APIFY_CURRENCY!, resultsLimit: 5, timeoutSeconds: 240 }));

  it('the token and actor work (health, no cost)', async () => {
    expect(await adapter().health()).toMatchObject({ status: 'healthy' });
  }, 30_000);

  it('one search run: records normalize to valid Listings; usage and cost are recorded', async () => {
    const a = adapter();
    const page = await a.search({
      query: env.FACEBOOK_APIFY_LIVE_QUERY ?? 'guitar',
      location: { text: env.FACEBOOK_APIFY_LIVE_LOCATION ?? 'San Francisco', radiusKm: null },
      conditions: [],
      maxPrice: null,
      limit: 5,
      cursor: null,
    });
    expect(page.usage).toMatchObject({ requests: 1, costIsEstimate: true });
    expect(page.usage!.items).toBeLessThanOrEqual(5);
    for (const raw of page.listings) {
      const r = normalizeRawListing(a, raw);
      expect(r.status, r.status === 'NORMALIZED' ? '' : r.reason).toBe('NORMALIZED');
      if (r.status === 'NORMALIZED') expect(normalizedListingSchema.safeParse(r.listing).success).toBe(true);
    }
  }, 300_000);
});
