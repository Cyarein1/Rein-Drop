import { describe, expect, it } from 'vitest';
import { compareAmounts, type InventoryItem, type MissedDeal, type MissedPotential, type Money } from '@rein-drop/contracts';
import {
  boughtVsMissedSeries,
  bucketIndex,
  bucketUnitFor,
  chartCurrency,
  closedInPeriod,
  dealPurchaseDates,
  inPeriod,
  itemRealized,
  missedGroups,
  profitOverTime,
  sellingByMarketplace,
  slowSellers,
  soldInPeriod,
  tiedUp,
  timeBuckets,
} from './analytics-charts.js';

const ZAR = (amountMinor: number): Money => ({ amountMinor, currency: 'ZAR' });
const EUR = (amountMinor: number): Money => ({ amountMinor, currency: 'EUR' });
const ID = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const UNTIL = '2026-10-08T12:00:00.000Z';
const p7 = { key: '7d' as const, since: '2026-10-01T12:00:00.000Z', until: UNTIL };
const p30 = { key: '30d' as const, since: '2026-09-08T12:00:00.000Z', until: UNTIL };
const p365 = { key: '365d' as const, since: '2025-10-08T12:00:00.000Z', until: UNTIL };
const all = { key: 'all' as const, since: null, until: UNTIL };

function item(n: number, over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: ID(n),
    title: `Item ${n}`,
    status: 'IN_STOCK',
    holding: true,
    notes: null,
    dealId: ID(n),
    source: null,
    purchase: { price: ZAR(100_00), purchasedAt: '2026-10-02T10:00:00.000Z', costs: [], total: ZAR(110_00) },
    sale: null,
    result: null,
    daysHeld: 3,
    expected: null,
    comparison: { purchasePrice: compareAmounts(null, ZAR(100_00)), salePrice: compareAmounts(null, null), profit: compareAmounts(null, null) },
    origin: 'deal',
    boughtFrom: null,
    closure: null,
    sellListing: null,
    actions: [],
    createdAt: '2026-10-02T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
    ...over,
  };
}

const cost = (category: 'MARKETPLACE_FEE' | 'PAYMENT_FEE' | 'SHIPPING', amount: Money) => ({ id: ID(99), category, amount, note: null, incurredAt: UNTIL });

function sold(n: number, soldAt: string, profit: number, over: { marketplace?: 'ebay' | 'facebook' | null; costs?: ReturnType<typeof cost>[]; price?: Money; daysHeld?: number } = {}): InventoryItem {
  return item(n, {
    status: 'SOLD',
    holding: false,
    daysHeld: over.daysHeld ?? 4,
    sale: { price: over.price ?? ZAR(300_00), soldAt, marketplace: over.marketplace === undefined ? 'ebay' : over.marketplace, costs: over.costs ?? [] },
    result:
      (over.price?.currency ?? 'ZAR') === 'ZAR'
        ? { status: 'ok', costBasis: ZAR(110_00), netProceeds: ZAR(110_00 + profit), realizedProfit: ZAR(profit), marginPercent: null, returnPercent: null }
        : { status: 'unavailable', reason: 'currency_mismatch' },
  });
}

const missedDeal = (n: number, foundAt: string, over: Partial<MissedDeal> = {}): MissedDeal => ({
  dealId: ID(n),
  title: `Deal ${n}`,
  hunt: { id: ID(1), name: 'Switch' },
  marketplace: 'ebay',
  reason: 'ignored',
  strength: 'strong',
  estimatedUpside: ZAR(50_00),
  foundAt,
  ...over,
});

function missed(items: MissedDeal[], count = items.length): MissedPotential {
  return {
    period: p30,
    count,
    gone: items.filter((i) => i.reason === 'gone').length,
    ignored: items.filter((i) => i.reason === 'ignored').length,
    withEstimate: items.filter((i) => i.estimatedUpside).length,
    estimatedPotential: [],
    items,
    generatedAt: UNTIL,
  };
}

describe('time buckets', () => {
  it('picks days for a week, weeks up to 90 days, months for a year, quarters beyond two years', () => {
    expect(bucketUnitFor(7)).toBe('day');
    expect(bucketUnitFor(30)).toBe('week');
    expect(bucketUnitFor(90)).toBe('week');
    expect(bucketUnitFor(365)).toBe('month');
    expect(bucketUnitFor(1000)).toBe('quarter');
  });

  it('cuts 7 days into calendar-day buckets covering the whole window, until included', () => {
    const b = timeBuckets(p7, 'en-GB');
    expect(b).toHaveLength(8); // 1 Oct (from noon) .. 8 Oct (to noon)
    expect(b[0]!.start).toBe(Date.parse('2026-10-01T00:00:00.000Z'));
    expect(bucketIndex(b, UNTIL)).toBe(7);
    expect(bucketIndex(b, p7.since)).toBe(0);
    expect(bucketIndex(b, '2026-09-30T00:00:00.000Z')).toBe(-1);
    expect(b[0]!.label).toBe('1 Oct');
  });

  it('cuts 30 days into weeks; the last one is shorter and labelled as a range', () => {
    const b = timeBuckets(p30, 'en-GB');
    expect(b).toHaveLength(5);
    expect(b.map((x) => x.unit)).toEqual(['week', 'week', 'week', 'week', 'week']);
    expect(b[0]!.key).toBe('2026-09-08');
    expect(b[0]!.rangeLabel).toMatch(/^8 \S+ - 14 \S+$/);
    expect(bucketIndex(b, UNTIL)).toBe(4);
  });

  it('uses calendar months for 12 months', () => {
    const b = timeBuckets(p365, 'en-ZA');
    expect(b).toHaveLength(13); // Oct 2025 (partial) .. Oct 2026 (partial)
    expect(b[0]!.key).toBe('2025-10-01');
    expect(b.at(-1)!.key).toBe('2026-10-01');
    expect(bucketIndex(b, UNTIL)).toBe(12);
  });

  it('starts "all time" at the first date with data, and has no buckets without data', () => {
    expect(timeBuckets(all, 'en-ZA')).toEqual([]);
    const b = timeBuckets(all, 'en-ZA', ['2026-10-05T09:00:00.000Z']);
    expect(b[0]!.key).toBe('2026-10-05');
    expect(b.every((x) => x.unit === 'day')).toBe(true);
    expect(bucketIndex(b, '2026-10-05T09:00:00.000Z')).toBe(0);
  });

  it('inPeriod includes both ends and treats all time as open', () => {
    expect(inPeriod(p7, p7.since)).toBe(true);
    expect(inPeriod(p7, UNTIL)).toBe(true);
    expect(inPeriod(p7, '2026-09-01T00:00:00.000Z')).toBe(false);
    expect(inPeriod(all, '2001-01-01T00:00:00.000Z')).toBe(true);
    expect(inPeriod(all, null)).toBe(false);
  });
});

describe('chartCurrency', () => {
  it('prefers the user currency when present, else the most used one', () => {
    expect(chartCurrency('ZAR', [EUR(1), ZAR(1)])).toBe('ZAR');
    expect(chartCurrency('USD', [EUR(1), EUR(2), ZAR(1)])).toBe('EUR');
    expect(chartCurrency('USD', [null])).toBe('USD');
  });
});

describe('bought vs missed over time', () => {
  it('counts deals bought (not manual, not cancelled) and missed deals per bucket', () => {
    const bought = dealPurchaseDates([
      item(1, { purchase: { price: ZAR(1), purchasedAt: '2026-10-02T10:00:00.000Z', costs: [], total: ZAR(1) } }),
      item(2, { origin: 'manual', purchase: { price: ZAR(1), purchasedAt: '2026-10-02T10:00:00.000Z', costs: [], total: ZAR(1) } }),
      item(3, { status: 'CANCELLED', purchase: { price: ZAR(1), purchasedAt: '2026-10-02T10:00:00.000Z', costs: [], total: ZAR(1) } }),
      item(4, { purchase: { price: ZAR(1), purchasedAt: '2026-01-02T10:00:00.000Z', costs: [], total: ZAR(1) } }), // outside
    ]);
    expect(bought).toHaveLength(2);
    const s = boughtVsMissedSeries({
      period: p7,
      localeTag: 'en-ZA',
      boughtAt: bought,
      missed: missed([missedDeal(1, '2026-10-02T11:00:00.000Z'), missedDeal(2, '2026-10-07T11:00:00.000Z')]),
    });
    expect(s.buckets.map((b) => b.bought)).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
    expect(s.buckets.map((b) => b.missed)).toEqual([0, 1, 0, 0, 0, 0, 1, 0]);
    expect(s.buckets[6]!.missedDeals.map((d) => d.dealId)).toEqual([ID(2)]);
    expect(s).toMatchObject({ missedShown: 2, missedTotal: 2, complete: true });
  });

  it('is incomplete when the API returned only the most valuable missed deals or purchases were capped', () => {
    const m = missed([missedDeal(1, '2026-10-02T11:00:00.000Z')], 25);
    expect(boughtVsMissedSeries({ period: p7, localeTag: 'en', boughtAt: [], missed: m })).toMatchObject({ missedShown: 1, missedTotal: 25, complete: false });
    expect(boughtVsMissedSeries({ period: p7, localeTag: 'en', boughtAt: [], boughtComplete: false, missed: missed([]) }).complete).toBe(false);
  });

  it('groups missed deals by Hunt with reasons and estimates per currency', () => {
    const m = missed([
      missedDeal(1, UNTIL, { reason: 'gone' }),
      missedDeal(2, UNTIL),
      missedDeal(3, UNTIL, { hunt: { id: ID(2), name: 'Lego' }, estimatedUpside: null }),
    ]);
    const g = missedGroups(m, (d) => d.hunt.id);
    expect(g.map((x) => [x.key, x.deals.length, x.gone, x.ignored])).toEqual([
      [ID(1), 2, 1, 1],
      [ID(2), 1, 0, 1],
    ]);
    expect(g[0]!.estimated).toEqual([ZAR(100_00)]);
    expect(g[1]!.estimated).toEqual([]);
  });
});

describe('sell insights', () => {
  const s1 = sold(1, '2026-10-03T10:00:00.000Z', 150_00, { costs: [cost('MARKETPLACE_FEE', ZAR(20_00)), cost('PAYMENT_FEE', ZAR(5_00)), cost('SHIPPING', ZAR(30_00))], daysHeld: 2 });
  const s2 = sold(2, '2026-10-05T10:00:00.000Z', -40_00, { daysHeld: 9 });
  const s3 = sold(3, '2026-10-06T10:00:00.000Z', 80_00, { marketplace: 'facebook', daysHeld: 5 });
  const s4 = sold(4, '2026-10-06T10:00:00.000Z', 0, { marketplace: null, price: EUR(100_00) });
  const old = sold(5, '2026-01-01T10:00:00.000Z', 999_00);

  it('keeps sales in the period by sale date', () => {
    expect(soldInPeriod([s1, s2, old, item(9)], p7).map((i) => i.id)).toEqual([s1.id, s2.id]);
  });

  it('sums revenue, fees, selling costs, profit and time to sell per marketplace sold on', () => {
    const rows = sellingByMarketplace([s1, s2, s3, s4], 'ZAR');
    expect(rows).toEqual([
      { marketplace: 'ebay', sales: 2, revenue: 600_00, fees: 25_00, sellingCosts: 55_00, profit: 110_00, comparableSales: 2, avgDaysToSell: 6 },
      { marketplace: 'facebook', sales: 1, revenue: 300_00, fees: 0, sellingCosts: 0, profit: 80_00, comparableSales: 1, avgDaysToSell: 5 },
      // Another currency: counted as a sale, left out of the money.
      { marketplace: 'other', sales: 1, revenue: 0, fees: 0, sellingCosts: 0, profit: 0, comparableSales: 0, avgDaysToSell: 4 },
    ]);
  });

  it('charts realized profit per bucket, losses included', () => {
    const b = profitOverTime([s1, s2, s3, old], p7, 'ZAR', 'en-ZA');
    expect(b.map((x) => x.profit)).toEqual([0, 0, 150_00, 0, -40_00, 80_00, 0, 0]);
    expect(b.map((x) => x.sales)).toEqual([0, 0, 1, 0, 1, 1, 0, 0]);
  });

  it('finds returns and write-offs closed in the period; cancelled items never count', () => {
    const closure = (status: 'RETURNED' | 'WRITTEN_OFF' | 'CANCELLED', profit: number | null) => ({
      status,
      closedAt: '2026-10-04T10:00:00.000Z',
      note: null,
      refund: null,
      result: profit === null ? null : { status: 'ok' as const, costBasis: ZAR(110_00), recovered: ZAR(110_00 + profit), realizedProfit: ZAR(profit) },
    });
    const ret = item(6, { status: 'RETURNED', holding: false, closure: closure('RETURNED', -10_00) });
    const off = item(7, { status: 'WRITTEN_OFF', holding: false, closure: closure('WRITTEN_OFF', -110_00) });
    const can = item(8, { status: 'CANCELLED', holding: false, closure: closure('CANCELLED', null) });
    expect(closedInPeriod([ret, off, can], p7).map((i) => i.id)).toEqual([ret.id, off.id]);
    expect(itemRealized(ret, 'ZAR')).toBe(-10_00);
    expect(itemRealized(off, 'EUR')).toBeNull();
    expect(itemRealized(s1, 'ZAR')).toBe(150_00);
  });

  it('lists slow sellers oldest first and the money tied up in held items', () => {
    const a = item(1, { daysHeld: 3 });
    const b = item(2, { daysHeld: 40 });
    const c = item(3, { daysHeld: 12, purchase: { price: EUR(1), purchasedAt: UNTIL, costs: [], total: EUR(1) } });
    expect(slowSellers([a, b, c, s1], 2).map((i) => i.id)).toEqual([b.id, c.id]);
    expect(tiedUp([a, b, c, s1], 'ZAR')).toEqual({ amount: 220_00, count: 2, excluded: 1 });
  });
});
