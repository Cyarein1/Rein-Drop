import type { MarketplaceSearchCriteria } from '../search.js';
import { describeMarketplaceAdapterContract } from '../testing/index.js';
import { FacebookAdapter, MockFacebookDataProvider, MockMarketplaceAdapter } from './index.js';

const criteria: MarketplaceSearchCriteria = {
  query: 'Nintendo Switch OLED',
  location: { text: 'Cape Town', radiusKm: 40 },
  conditions: [],
  maxPrice: null,
  limit: 10,
  cursor: null,
};

describeMarketplaceAdapterContract('mock eBay', {
  create: () => new MockMarketplaceAdapter({ marketplace: 'ebay' }),
  criteria,
});

describeMarketplaceAdapterContract('Facebook via mock provider', {
  create: () => new FacebookAdapter(new MockFacebookDataProvider()),
  criteria,
});

// A second provider with different capabilities: the adapter contract must still hold.
describeMarketplaceAdapterContract('Facebook via alternate provider (no refresh, no radius)', {
  create: () =>
    new FacebookAdapter(
      new MockFacebookDataProvider({ id: 'mock-alt', capabilities: { fetchListing: false, radius: false, maxPageSize: 12 } }),
    ),
  criteria,
});

// Filters applied by the source must not break the contract either.
describeMarketplaceAdapterContract('mock eBay with filters', {
  create: () => new MockMarketplaceAdapter({ marketplace: 'ebay', currency: 'ZAR' }),
  criteria: { ...criteria, conditions: ['used'], maxPrice: { amountMinor: 450_000, currency: 'ZAR' } },
});
