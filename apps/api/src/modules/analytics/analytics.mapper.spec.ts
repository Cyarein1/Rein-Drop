import { avgDays, byRealizedProfit, closedBy, netRealized, percent, periodWindow, realizedBy, toClosed, toRealized } from './analytics.mapper.js';
import type { RealizedRow } from './analytics.sql.js';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const row = (over: Partial<RealizedRow> = {}): RealizedRow => ({
  currency: 'ZAR',
  sales: 2,
  revenue: 850_000n,
  sellingCosts: 75_000n,
  comparable: 1,
  excluded: 1,
  profit: 115_000n,
  comparableRevenue: 650_000n,
  daysTotal: 10,
  ...over,
});

describe('analytics mapping', () => {
  it('rolling windows end now; "all" has no start', () => {
    expect(periodWindow('30d', NOW).info).toEqual({ key: '30d', since: '2026-09-08T12:00:00.000Z', until: NOW.toISOString() });
    expect(periodWindow('7d', NOW).since.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    const all = periodWindow('all', NOW);
    expect(all.info.since).toBeNull();
    expect(all.since.getTime()).toBe(0);
  });

  it('realized rows become per-currency results; margin uses comparable revenue only', () => {
    expect(toRealized(row())).toEqual({
      currency: 'ZAR',
      revenue: { amountMinor: 850_000, currency: 'ZAR' },
      comparableSales: 1,
      excludedSales: 1,
      realizedProfit: { amountMinor: 115_000, currency: 'ZAR' },
      marginPercent: 17, // 115 000 / 650 000, not / 850 000
    });
    expect(toRealized(row({ profit: -60_000n, comparableRevenue: 250_000n })).marginPercent).toBe(-24);
    expect(toRealized(row({ profit: 0n, comparableRevenue: 0n, comparable: 0 })).marginPercent).toBeNull();
  });

  it('percent rounds toward zero; average days to one decimal', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(-1, 3)).toBe(-33);
    expect(percent(5, 0)).toBeNull();
    expect(avgDays(10, 2)).toBe(5);
    expect(avgDays(10, 3)).toBe(3.3);
    expect(avgDays(0, 0)).toBeNull();
  });

  it('groups by key with currencies sorted; best realized profit first, losses last', () => {
    const grouped = realizedBy(
      [
        { ...row({ currency: 'ZAR' }), huntId: 'a' },
        { ...row({ currency: 'USD', sales: 1, daysTotal: 4 }), huntId: 'a' },
        { ...row({ profit: -5n }), huntId: 'b' },
      ],
      'huntId',
    );
    expect(grouped.get('a')!.realized.map((r) => r.currency)).toEqual(['USD', 'ZAR']);
    expect(grouped.get('a')).toMatchObject({ sales: 3, days: 14 });
    const items = [
      { name: 'loss', realized: grouped.get('b')!.realized, sold: 2, bought: 2 },
      { name: 'none', realized: [], sold: 0, bought: 3 },
      { name: 'win', realized: grouped.get('a')!.realized, sold: 3, bought: 1 },
    ];
    expect(items.sort(byRealizedProfit).map((i) => i.name)).toEqual(['win', 'none', 'loss']);
  });
});

describe('returns and write-offs (decision 0021)', () => {
  const closedRow = { currency: 'ZAR', returned: 1, writtenOff: 2, basis: 300_00n, recovered: 90_00n, excluded: 0 };

  it('the closed result is what came back minus the cost basis', () => {
    expect(toClosed(closedRow)).toEqual({
      currency: 'ZAR',
      returned: 1,
      writtenOff: 2,
      costBasis: { amountMinor: 300_00, currency: 'ZAR' },
      recovered: { amountMinor: 90_00, currency: 'ZAR' },
      realizedResult: { amountMinor: -210_00, currency: 'ZAR' },
      excluded: 0,
    });
  });

  it('net realized = sales profit + closed results, per currency, never mixed', () => {
    const realized = [toRealized({ currency: 'ZAR', sales: 1, revenue: 500_00n, sellingCosts: 0n, comparable: 1, excluded: 0, profit: 250_00n, comparableRevenue: 500_00n, daysTotal: 3 })];
    expect(netRealized(realized, [toClosed(closedRow), toClosed({ ...closedRow, currency: 'USD', basis: 10_00n, recovered: 0n })])).toEqual([
      { amountMinor: -10_00, currency: 'USD' },
      { amountMinor: 40_00, currency: 'ZAR' },
    ]);
  });

  it('groups closed results by product', () => {
    const grouped = closedBy([{ ...closedRow, key: 'lamp' }], 'key');
    expect(grouped.get('lamp')).toEqual({ returned: 1, writtenOff: 2, results: [{ amountMinor: -210_00, currency: 'ZAR' }] });
  });
});
