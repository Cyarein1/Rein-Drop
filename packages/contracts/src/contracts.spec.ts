import { describe, expect, it } from 'vitest';
import {
  createHuntRequestSchema,
  dealDetailSchema,
  listHuntsQuerySchema,
  moneySchema,
  updateHuntRequestSchema,
} from './index.js';

const ID = '01990000-0000-7000-8000-000000000001';
const NOW = '2026-10-07T01:56:03.275Z';

describe('hunt requests', () => {
  it('trims and accepts a valid create body', () => {
    expect(
      createHuntRequestSchema.parse({ name: '  Vintage Levis ', query: 'levis 501', marketplaces: ['ebay'] }),
    ).toEqual({ name: 'Vintage Levis', query: 'levis 501', marketplaces: ['ebay'] });
  });

  it('rejects empty name, unknown or repeated marketplaces', () => {
    const result = createHuntRequestSchema.safeParse({
      name: ' ',
      query: 'x',
      marketplaces: ['ebay', 'ebay', 'craigslist'],
    });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('name');
    expect(paths).toContain('marketplaces.2');
  });

  it('update requires at least one field', () => {
    expect(updateHuntRequestSchema.safeParse({}).success).toBe(false);
    expect(updateHuntRequestSchema.parse({ status: 'PAUSED' })).toEqual({ status: 'PAUSED' });
  });
});

describe('pagination query', () => {
  it('coerces string query params and applies the default limit', () => {
    expect(listHuntsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(listHuntsQuerySchema.parse({ limit: '5', status: 'ACTIVE' })).toEqual({ limit: 5, status: 'ACTIVE' });
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

describe('deal detail', () => {
  it('accepts a deal with listing detail and no analysis yet', () => {
    const deal = {
      id: ID,
      hunt: { id: ID, name: 'Levis' },
      matchStatus: 'NEW',
      matchedAt: NOW,
      isSaved: false,
      listing: {
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
      },
      analysis: null,
    };
    expect(dealDetailSchema.safeParse(deal).success).toBe(true);
  });
});
