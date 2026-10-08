import { ANALYTICS_PERIOD_DAYS, type AnalyticsPeriod, type AnalyticsPeriodInfo, type Money, type RealizedByCurrency } from '@rein-drop/contracts';
import { num, type RealizedRow } from './analytics.sql.js';

/** Pure mapping from aggregate rows to the analytics contract. */

const DAY_MS = 86_400_000;

/** Rolling window ending now. "all" starts at the epoch (the SQL needs a bound). */
export function periodWindow(period: AnalyticsPeriod, now: Date): { since: Date; until: Date; info: AnalyticsPeriodInfo } {
  const days = ANALYTICS_PERIOD_DAYS[period];
  const since = days === null ? new Date(0) : new Date(now.getTime() - days * DAY_MS);
  return { since, until: now, info: { key: period, since: days === null ? null : since.toISOString(), until: now.toISOString() } };
}

export const money = (amountMinor: unknown, currency: string): Money => ({ amountMinor: num(amountMinor), currency });

/** Whole percent toward zero (same rounding as realizedResult); null when the base is 0. */
export const percent = (part: number, whole: number): number | null => (whole === 0 ? null : Math.trunc((100 * part) / whole));

export function toRealized(row: RealizedRow): RealizedByCurrency {
  const profit = num(row.profit);
  return {
    currency: row.currency,
    revenue: money(row.revenue, row.currency),
    comparableSales: num(row.comparable),
    excludedSales: num(row.excluded),
    realizedProfit: money(profit, row.currency),
    marginPercent: percent(profit, num(row.comparableRevenue)),
  };
}

/** Group realized rows by a key (hunt, product, marketplace), currencies sorted. */
export function realizedBy<K extends string>(rows: readonly (RealizedRow & Record<K, string>)[], key: K): Map<string, { realized: RealizedByCurrency[]; sales: number; days: number }> {
  const out = new Map<string, { realized: RealizedByCurrency[]; sales: number; days: number }>();
  for (const row of rows) {
    const k = row[key];
    const entry = out.get(k) ?? { realized: [], sales: 0, days: 0 };
    entry.realized.push(toRealized(row));
    entry.sales += num(row.sales);
    entry.days += num(row.daysTotal);
    out.set(k, entry);
  }
  for (const e of out.values()) e.realized.sort((a, b) => a.currency.localeCompare(b.currency));
  return out;
}

/** Average days, one decimal; null without sales. */
export const avgDays = (totalDays: number, sales: number): number | null => (sales === 0 ? null : Math.round((10 * totalDays) / sales) / 10);

/** Best realized result first (largest profit in any currency); losses sink to the end. */
export function byRealizedProfit<T extends { realized: RealizedByCurrency[]; sold: number; bought: number }>(a: T, b: T): number {
  const best = (x: T) => (x.realized.length === 0 ? 0 : Math.max(...x.realized.map((r) => r.realizedProfit.amountMinor)));
  return best(b) - best(a) || b.sold - a.sold || b.bought - a.bought;
}
