import { groupKeyFor, planSearchJobs, type DueTarget } from './search-plan.js';

const NOW = new Date('2026-10-07T10:07:00Z');
const INTERVAL = 15 * 60_000;

const target = (over: Partial<DueTarget> = {}): DueTarget => ({
  huntId: '00000000-0000-7000-8000-000000000001',
  userId: 'u1',
  marketplace: 'facebook',
  query: 'iPhone 13',
  locationText: 'Cape Town',
  radiusKm: 40,
  conditions: [],
  maxPriceMinor: 450_000,
  priceCurrency: 'ZAR',
  ...over,
});

describe('planSearchJobs', () => {
  it('groups hunts one search can serve and merges their filters (widest wins)', () => {
    const plans = planSearchJobs(
      [
        target({ huntId: 'b', conditions: ['used'], maxPriceMinor: 400_000 }),
        target({ huntId: 'a', query: '  iphone   13 ', locationText: 'cape town', conditions: ['refurbished', 'used'], maxPriceMinor: 500_000, userId: 'u2' }),
      ],
      NOW,
      INTERVAL,
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]!.payload).toMatchObject({
      marketplace: 'facebook',
      huntIds: ['a', 'b'],
      criteria: {
        query: 'iphone   13',
        location: { text: 'cape town', radiusKm: 40 },
        conditions: ['refurbished', 'used'],
        maxPrice: { amountMinor: 500_000, currency: 'ZAR' },
      },
    });
  });

  it('keeps different marketplaces, queries, places and radii apart', () => {
    const plans = planSearchJobs(
      [
        target({ huntId: '1' }),
        target({ huntId: '2', marketplace: 'ebay' }),
        target({ huntId: '3', query: 'iPhone 14' }),
        target({ huntId: '4', locationText: 'Durban' }),
        target({ huntId: '5', radiusKm: 10 }),
      ],
      NOW,
      INTERVAL,
    );
    expect(plans).toHaveLength(5);
  });

  it('drops filters that can not be merged safely', () => {
    const [anyCondition] = planSearchJobs([target({ huntId: 'a', conditions: ['new'] }), target({ huntId: 'b', conditions: [] })], NOW, INTERVAL);
    expect(anyCondition!.payload.criteria.conditions).toEqual([]);
    const [mixed] = planSearchJobs([target({ huntId: 'a' }), target({ huntId: 'b', priceCurrency: 'USD', maxPriceMinor: 30_000 })], NOW, INTERVAL);
    expect(mixed!.payload.criteria.maxPrice).toBeNull();
    const [unbounded] = planSearchJobs([target({ huntId: 'a' }), target({ huntId: 'b', maxPriceMinor: null, priceCurrency: null })], NOW, INTERVAL);
    expect(unbounded!.payload.criteria.maxPrice).toBeNull();
  });

  it('gives the same dedupe key within a polling window and a new one in the next', () => {
    const due = [target({ huntId: 'a' }), target({ huntId: 'b' })];
    const key = (at: Date, targets = due) => planSearchJobs(targets, at, INTERVAL)[0]!.dedupeKey;
    expect(key(NOW)).toBe(key(new Date(NOW.getTime() + 60_000)));
    expect(key(NOW)).toBe(key(NOW, [...due].reverse()));
    expect(key(NOW)).not.toBe(key(new Date(NOW.getTime() + INTERVAL)));
    // A hunt joining later in the same window gets its own job instead of being swallowed.
    expect(key(NOW, [target({ huntId: 'c' })])).not.toBe(key(NOW));
    expect(key(NOW)).toMatch(/^facebook:[0-9a-f]{32}:\d+$/);
  });

  it('ignores unknown marketplaces and unknown condition values', () => {
    expect(planSearchJobs([target({ marketplace: 'etsy' })], NOW, INTERVAL)).toEqual([]);
    const [plan] = planSearchJobs([target({ conditions: ['used', 'mint'] })], NOW, INTERVAL);
    expect(plan!.payload.criteria.conditions).toEqual(['used']);
  });

  it('builds group keys from normalized text', () => {
    expect(groupKeyFor(target({ query: 'IPHONE  13 ' }))).toBe(groupKeyFor(target()));
  });
});
