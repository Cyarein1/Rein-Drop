import { describe, expect, it } from 'vitest';
import {
  dealDetailSchema,
  ignoreDealRequestSchema,
  listDealsQuerySchema,
  listHuntsQuerySchema,
  markDealBoughtRequestSchema,
  moneySchema,
} from './index.js';

const ID = '01990000-0000-7000-8000-000000000001';
const NOW = '2026-10-07T01:56:03.275Z';

describe('pagination query', () => {
  it('coerces string query params and applies the default limit', () => {
    expect(listHuntsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(listHuntsQuerySchema.parse({ limit: '5', status: 'LIVE' })).toEqual({ limit: 5, status: 'LIVE' });
    expect(listHuntsQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
  });
});

describe('money', () => {
  it('requires integer minor units and an ISO currency', () => {
    expect(moneySchema.safeParse({ amountMinor: 1999, currency: 'USD' }).success).toBe(true);
    expect(moneySchema.safeParse({ amountMinor: 19.99, currency: 'USD' }).success).toBe(false);
    expect(moneySchema.safeParse({ amountMinor: 1, currency: 'usd' }).success).toBe(false);
  });
});

describe('deals', () => {
  const listing = {
    id: ID,
    marketplace: 'facebook',
    url: 'https://example.com/item/1',
    title: 'Levis 501',
    price: { amountMinor: 2500, currency: 'USD' },
    conditionText: null,
    locationText: null,
    imageUrl: null,
    status: 'ACTIVE',
    listedAt: null,
    lastSeenAt: NOW,
    description: null,
    imageUrls: [],
  };
  const pending = {
    id: ID,
    hunt: { id: ID, name: 'Levis' },
    status: 'new',
    matchStatus: 'NEW',
    isSaved: false,
    matchedAt: NOW,
    listing,
    price: { asking: listing.price, knownCosts: null, knownTotal: listing.price },
    freshness: { postedAt: null, discoveredAt: NOW, ageMinutes: 5, basis: 'discovered' },
    source: { marketplace: 'facebook', listingStatus: 'ACTIVE', available: true, lastSeenAt: NOW, lastCheckedAt: NOW, lastCheck: 'ok', sourceHealth: { status: 'healthy', reason: null, nextAttemptAt: null } },
    assessment: { status: 'pending', strength: null, confidence: null, score: null, alertEligible: false, analyzedAt: null },
    estimate: {
      resale: { status: 'unavailable', reason: 'no_source', detail: 'No resale price source is connected yet' },
      upside: { status: 'unavailable', reason: 'no_resale_estimate', detail: 'No resale price source is connected yet' },
    },
    reason: null,
    rank: 49,
    why: null,
    product: null,
    risk: null,
    strengthReasons: [],
    confidenceReasons: [],
    economics: null,
    matchChecks: [],
    alert: null,
    decision: { seenAt: null, savedAt: null, ignoredAt: null, ignoreReason: null, boughtAt: null, inventoryItemId: null },
  };

  it('accepts a deal that has not been analysed yet', () => {
    expect(dealDetailSchema.safeParse(pending).success).toBe(true);
  });

  it('an estimated upside must be labelled as an estimate', () => {
    const estimated = { status: 'estimated', low: listing.price, typical: listing.price, high: listing.price, typicalMarginPercent: 10, excludes: [] };
    const deal = (upside: object) => ({ ...pending, estimate: { ...pending.estimate, upside } });
    expect(dealDetailSchema.safeParse(deal({ ...estimated, basis: 'estimate' })).success).toBe(true);
    expect(dealDetailSchema.safeParse(deal({ ...estimated, basis: 'realized' })).success).toBe(false);
  });

  it('feed query defaults to open deals and validates filters', () => {
    expect(listDealsQuerySchema.parse({})).toEqual({ limit: 20, status: 'open' });
    expect(listDealsQuerySchema.parse({ status: 'saved', marketplace: 'ebay', huntId: ID })).toMatchObject({ status: 'saved', marketplace: 'ebay' });
    expect(listDealsQuerySchema.safeParse({ status: 'NEW' }).success).toBe(false);
    expect(listDealsQuerySchema.safeParse({ marketplace: 'gumtree' }).success).toBe(false);
  });

  it('action bodies: optional ignore reason, positive bought price', () => {
    expect(ignoreDealRequestSchema.parse({})).toEqual({});
    expect(ignoreDealRequestSchema.parse({ reason: '  too far  ' })).toEqual({ reason: 'too far' });
    expect(ignoreDealRequestSchema.safeParse({ reason: 'x'.repeat(201) }).success).toBe(false);
    expect(markDealBoughtRequestSchema.safeParse({ price: { amountMinor: 0, currency: 'ZAR' } }).success).toBe(false);
    expect(markDealBoughtRequestSchema.safeParse({ price: { amountMinor: 350_000, currency: 'ZAR' }, purchasedAt: NOW }).success).toBe(true);
  });
});

describe('money inputs (hardening)', () => {
  it('rejects amounts the database cannot store, and negatives, with a clear 400', async () => {
    const { moneyInputSchema, MAX_AMOUNT_MINOR, markDealBoughtRequestSchema: bought } = await import('./index.js');
    expect(moneyInputSchema.safeParse({ amountMinor: MAX_AMOUNT_MINOR, currency: 'ZAR' }).success).toBe(true);
    expect(moneyInputSchema.safeParse({ amountMinor: MAX_AMOUNT_MINOR + 1, currency: 'ZAR' }).success).toBe(false);
    expect(moneyInputSchema.safeParse({ amountMinor: -1, currency: 'ZAR' }).success).toBe(false);
    expect(bought.safeParse({ price: { amountMinor: 9e15, currency: 'ZAR' } }).success).toBe(false);
  });
});
