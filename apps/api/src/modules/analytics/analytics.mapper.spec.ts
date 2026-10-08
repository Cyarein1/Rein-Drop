import { avgDays, byRealizedProfit, percent, periodWindow, realizedBy, toRealized } from './analytics.mapper.js';
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
