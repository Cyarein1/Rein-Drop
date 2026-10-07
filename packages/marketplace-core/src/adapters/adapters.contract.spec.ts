import type { MarketplaceSearchCriteria } from '../search.js';
import { describeMarketplaceAdapterContract } from '../testing/index.js';
import { DevEbayAdapter, DevFacebookDataProvider, FacebookAdapter } from './index.js';

/** "iphone" matches three seeded products, so results span several pages at limit 10. */
const criteria: MarketplaceSearchCriteria = {
  query: 'iphone',
  location: { text: 'Cape Town', radiusKm: 40 },
  conditions: [],
  maxPrice: null,
  limit: 10,
  cursor: null,
};

describeMarketplaceAdapterContract('dev eBay', {
  create: () => new DevEbayAdapter(),
  criteria,
});

describeMarketplaceAdapterContract('dev eBay - ZAR, used only, max price', {
  create: () => new DevEbayAdapter({ currency: 'ZAR' }),
  criteria: { ...criteria, query: 'Nintendo Switch OLED', conditions: ['used'], maxPrice: { amountMinor: 450_000, currency: 'ZAR' } },
});

describeMarketplaceAdapterContract('dev eBay - degraded scenario', {
  create: () => new DevEbayAdapter({ scenario: 'degraded' }),
  criteria,
});

describeMarketplaceAdapterContract('Facebook via dev provider', {
  create: () => new FacebookAdapter(new DevFacebookDataProvider()),
  criteria,
});

describeMarketplaceAdapterContract('Facebook via alternate dev provider (no refresh, no radius)', {
  create: () =>
    new FacebookAdapter(new DevFacebookDataProvider({ id: 'dev-alt', capabilities: { fetchListing: false, radius: false, maxPageSize: 12 } })),
  criteria,
});

describeMarketplaceAdapterContract('Facebook via dev provider - degraded scenario', {
  create: () => new FacebookAdapter(new DevFacebookDataProvider({ scenario: 'degraded' })),
  criteria: { ...criteria, query: 'samsung galaxy' },
});
