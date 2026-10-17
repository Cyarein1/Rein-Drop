import type { AnalyticsPeriodInfo, InventoryItem, MarketplaceKey, MissedDeal, MissedPotential, Money } from '@rein-drop/contracts';

/**
 * Chart data for Analytics (sourcing: "am I buying well?") and Sell > Insights ("am I selling
 * well?"), decision 0021. Pure numbers: the apps format and draw them. Money stays in minor units
 * of ONE currency per chart (never converted); amounts in other currencies are counted, not summed.
 *
 * Time buckets are UTC so the same data always lands in the same bucket.
 */

const DAY = 86_400_000;

export type BucketUnit = 'day' | 'week' | 'month' | 'quarter';

export interface TimeBucket {
  /** Start of the bucket, `YYYY-MM-DD` (stable key). */
  key: string;
  unit: BucketUnit;
  /** Epoch ms, start inclusive / end exclusive. */
  start: number;
  end: number;
  /** Short axis label ("8 Oct", "Oct 26", "Q4 26"). */
  label: string;
  /** Full range for tooltips / tables ("8 Oct - 14 Oct"). */
  rangeLabel: string;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Bucket size for a period: days for a week, weeks up to 90 days, months for a year, then quarters. */
export function bucketUnitFor(spanDays: number): BucketUnit {
  if (spanDays <= 14) return 'day';
  if (spanDays <= 120) return 'week';
  if (spanDays <= 2 * 366) return 'month';
  return 'quarter';
}

/**
 * Buckets covering the period. Day / week buckets run forward from the day the period starts (the
 * last one may be shorter); month / quarter buckets are calendar months. For "all time" the start
 * is the earliest of `dates` (no dates: no buckets).
 */
export function timeBuckets(period: AnalyticsPeriodInfo, localeTag: string, dates: readonly string[] = []): TimeBucket[] {
  const until = Date.parse(period.until);
  const earliest = dates.length > 0 ? Math.min(...dates.map((d) => Date.parse(d))) : null;
  const sinceRaw = period.since ? Date.parse(period.since) : earliest;
  if (sinceRaw === null || !Number.isFinite(sinceRaw) || sinceRaw > until) return [];
  // Buckets start on a (UTC) day boundary so a "1 Oct" bucket is that calendar day; the first and
  // last bucket may be partly outside the period (nothing outside the period is counted).
  const since = Math.floor(sinceRaw / DAY) * DAY;
  const unit = bucketUnitFor(Math.max(1, Math.ceil((until - since) / DAY)));
  const end = until + 1; // the last bucket includes `until`

  const fmtDay = new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmtMonth = new Intl.DateTimeFormat(localeTag, { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const buckets: TimeBucket[] = [];

  if (unit === 'day' || unit === 'week') {
    const step = unit === 'day' ? DAY : 7 * DAY;
    for (let s = since; s < until || s === since; s += step) {
      // The last bucket runs to the end of the period (and includes `until`).
      const e = s + step >= until ? end : s + step;
      const last = Math.max(s, e - DAY);
      buckets.push({
        key: isoDay(s),
        unit,
        start: s,
        end: e,
        label: fmtDay.format(s),
        rangeLabel: unit === 'day' || isoDay(last) === isoDay(s) ? fmtDay.format(s) : `${fmtDay.format(s)} - ${fmtDay.format(last)}`,
      });
    }
    return buckets;
  }

  const months = unit === 'month' ? 1 : 3;
  const first = new Date(since);
  let y = first.getUTCFullYear();
  let m = unit === 'month' ? first.getUTCMonth() : Math.floor(first.getUTCMonth() / 3) * 3;
  for (;;) {
    const s = Date.UTC(y, m, 1);
    if (s >= until && buckets.length > 0) {
      buckets[buckets.length - 1]!.end = end;
      break;
    }
    const e = Date.UTC(y, m + months, 1);
    const label = unit === 'month' ? fmtMonth.format(s) : `Q${Math.floor(m / 3) + 1} ${String(y).slice(2)}`;
    buckets.push({
      key: isoDay(s),
      unit,
      start: s,
      end: Math.min(e, end),
      label,
      rangeLabel: unit === 'month' ? label : `${fmtMonth.format(s)} - ${fmtMonth.format(Date.UTC(y, m + 2, 1))}`,
    });
    m += months;
    if (m >= 12) {
      y += Math.floor(m / 12);
      m %= 12;
    }
  }
  return buckets;
}

/** Index of the bucket holding `iso`, or -1 when it falls outside every bucket. */
export function bucketIndex(buckets: readonly TimeBucket[], iso: string): number {
  const t = Date.parse(iso);
  return buckets.findIndex((b) => t >= b.start && t < b.end);
}

/** Inside the period window (since inclusive, until inclusive; no since = all time). */
export function inPeriod(period: AnalyticsPeriodInfo, iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return (period.since === null || t >= Date.parse(period.since)) && t <= Date.parse(period.until);
}

/** The currency to chart: the user's own when any amount uses it, else the most used one. */
export function chartCurrency(preferred: string, amounts: readonly (Money | null | undefined)[]): string {
  const counts = new Map<string, number>();
  for (const a of amounts) if (a) counts.set(a.currency, (counts.get(a.currency) ?? 0) + 1);
  if (counts.size === 0 || counts.has(preferred)) return preferred;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}

// ---------------------------------------------------------------------------
// Analytics: deals bought vs missed over time
// ---------------------------------------------------------------------------

export interface BoughtMissedBucket extends TimeBucket {
  /** Deals marked Bought (items from a deal, cancelled purchases left out). */
  bought: number;
  /** Strong deals that got away (of the missed deals the API returned). */
  missed: number;
  /** Those missed deals, most valuable first (estimate), for the drill-down. */
  missedDeals: MissedDeal[];
}

export interface BoughtMissedSeries {
  buckets: BoughtMissedBucket[];
  /** Missed deals that could be placed on the chart (the API returns the 20 most valuable). */
  missedShown: number;
  missedTotal: number;
  /** Every bought deal and every missed deal is in the chart. */
  complete: boolean;
}

/** Purchase dates of deals bought (not "Add item" purchases, not cancelled ones). */
export function dealPurchaseDates(items: readonly InventoryItem[]): string[] {
  return items.filter((i) => i.origin === 'deal' && i.status !== 'CANCELLED').map((i) => i.purchase.purchasedAt);
}

export function boughtVsMissedSeries(input: {
  period: AnalyticsPeriodInfo;
  localeTag: string;
  /** Purchase dates of bought deals (see dealPurchaseDates); outside the period is ignored. */
  boughtAt: readonly string[];
  /** False when the purchases could not all be loaded. */
  boughtComplete?: boolean;
  missed: MissedPotential;
}): BoughtMissedSeries {
  const bought = input.boughtAt.filter((d) => inPeriod(input.period, d));
  const missedItems = input.missed.items.filter((d) => inPeriod(input.period, d.foundAt));
  const buckets = timeBuckets(input.period, input.localeTag, [...bought, ...missedItems.map((d) => d.foundAt)]).map((b) => ({
    ...b,
    bought: 0,
    missed: 0,
    missedDeals: [] as MissedDeal[],
  }));
  for (const d of bought) {
    const i = bucketIndex(buckets, d);
    if (i >= 0) buckets[i]!.bought += 1;
  }
  let shown = 0;
  for (const d of missedItems) {
    const i = bucketIndex(buckets, d.foundAt);
    if (i < 0) continue;
    buckets[i]!.missed += 1;
    buckets[i]!.missedDeals.push(d);
    shown += 1;
  }
  return {
    buckets,
    missedShown: shown,
    missedTotal: input.missed.count,
    complete: (input.boughtComplete ?? true) && shown >= input.missed.count,
  };
}

/** Missed deals grouped by a key (Hunt, marketplace), most missed first. */
export function missedGroups<K extends string>(
  missed: MissedPotential,
  keyOf: (d: MissedDeal) => K,
): { key: K; deals: MissedDeal[]; gone: number; ignored: number; estimated: Money[] }[] {
  const groups = new Map<K, MissedDeal[]>();
  for (const d of missed.items) groups.set(keyOf(d), [...(groups.get(keyOf(d)) ?? []), d]);
  return [...groups.entries()]
    .map(([key, deals]) => ({
      key,
      deals,
      gone: deals.filter((d) => d.reason === 'gone').length,
      ignored: deals.filter((d) => d.reason === 'ignored').length,
      estimated: sumByCurrency(deals.map((d) => d.estimatedUpside)),
    }))
    .sort((a, b) => b.deals.length - a.deals.length || a.key.localeCompare(b.key));
}

function sumByCurrency(list: readonly (Money | null)[]): Money[] {
  const sums = new Map<string, number>();
  for (const m of list) if (m) sums.set(m.currency, (sums.get(m.currency) ?? 0) + m.amountMinor);
  return [...sums.entries()].map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

// ---------------------------------------------------------------------------
// Sell > Insights
// ---------------------------------------------------------------------------

const FEE_CATEGORIES = new Set(['MARKETPLACE_FEE', 'PAYMENT_FEE']);

/** Realized profit of a sold / returned / written-off item in `currency`, or null when not comparable. */
export function itemRealized(item: InventoryItem, currency: string): number | null {
  if (item.status === 'SOLD') {
    return item.result?.status === 'ok' && item.result.realizedProfit.currency === currency ? item.result.realizedProfit.amountMinor : null;
  }
  const r = item.closure?.result;
  return r?.status === 'ok' && r.realizedProfit.currency === currency ? r.realizedProfit.amountMinor : null;
}

/** Purchase price + purchase costs in `currency` (null when it can't be summed in it). */
export function itemCostBasis(item: InventoryItem, currency: string): number | null {
  const total = item.purchase.total;
  if (total) return total.currency === currency ? total.amountMinor : null;
  return null;
}

/** Items sold in the period (by sale date). */
export const soldInPeriod = (items: readonly InventoryItem[], period: AnalyticsPeriodInfo) => items.filter((i) => i.status === 'SOLD' && inPeriod(period, i.sale?.soldAt));

/** Items returned or written off in the period (by the date they were closed). Cancelled ones never count. */
export const closedInPeriod = (items: readonly InventoryItem[], period: AnalyticsPeriodInfo) =>
  items.filter((i) => (i.status === 'RETURNED' || i.status === 'WRITTEN_OFF') && inPeriod(period, i.closure?.closedAt));

export interface MarketplaceSelling {
  /** Where it sold; "other" = recorded without a marketplace. */
  marketplace: MarketplaceKey | 'other';
  sales: number;
  /** Sale prices in the chart currency (minor units). */
  revenue: number;
  /** Marketplace + payment fees. */
  fees: number;
  /** Every selling cost (fees + shipping to the buyer + other). */
  sellingCosts: number;
  /** Realized profit of the comparable sales. */
  profit: number;
  /** Sales whose profit is in `profit` (the rest are in another currency). */
  comparableSales: number;
  /** Average days from purchase to sale, whole days; null without sales. */
  avgDaysToSell: number | null;
}

/** Selling results per marketplace sold on, best realized profit first. */
export function sellingByMarketplace(sold: readonly InventoryItem[], currency: string): MarketplaceSelling[] {
  const rows = new Map<MarketplaceSelling['marketplace'], MarketplaceSelling & { days: number }>();
  for (const item of sold) {
    if (!item.sale) continue;
    const key = item.sale.marketplace ?? 'other';
    const row = rows.get(key) ?? { marketplace: key, sales: 0, revenue: 0, fees: 0, sellingCosts: 0, profit: 0, comparableSales: 0, avgDaysToSell: null, days: 0 };
    row.sales += 1;
    row.days += item.daysHeld;
    if (item.sale.price.currency === currency) row.revenue += item.sale.price.amountMinor;
    for (const c of item.sale.costs) {
      if (c.amount.currency !== currency) continue;
      row.sellingCosts += c.amount.amountMinor;
      if (FEE_CATEGORIES.has(c.category)) row.fees += c.amount.amountMinor;
    }
    const profit = itemRealized(item, currency);
    if (profit !== null) {
      row.profit += profit;
      row.comparableSales += 1;
    }
    rows.set(key, row);
  }
  return [...rows.values()]
    .map(({ days, ...r }) => ({ ...r, avgDaysToSell: r.sales > 0 ? Math.round(days / r.sales) : null }))
    .sort((a, b) => b.profit - a.profit || b.sales - a.sales);
}

/** Held items (in stock or listed) that have waited longest, oldest first. */
export function slowSellers(holding: readonly InventoryItem[], limit = 5): InventoryItem[] {
  return holding
    .filter((i) => i.holding)
    .slice()
    .sort((a, b) => b.daysHeld - a.daysHeld || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** Money tied up in held items, in `currency`; `excluded` = held items in another currency. */
export function tiedUp(holding: readonly InventoryItem[], currency: string): { amount: number; count: number; excluded: number } {
  let amount = 0;
  let count = 0;
  let excluded = 0;
  for (const i of holding) {
    if (!i.holding) continue;
    const basis = itemCostBasis(i, currency);
    if (basis === null) excluded += 1;
    else {
      amount += basis;
      count += 1;
    }
  }
  return { amount, count, excluded };
}

export interface ProfitBucket extends TimeBucket {
  sales: number;
  /** Realized profit of the comparable sales in the bucket (can be negative). */
  profit: number;
}

/** Realized profit of sales per time bucket (by sale date). */
export function profitOverTime(sold: readonly InventoryItem[], period: AnalyticsPeriodInfo, currency: string, localeTag: string): ProfitBucket[] {
  const inWindow = soldInPeriod(sold, period);
  const buckets = timeBuckets(
    period,
    localeTag,
    inWindow.map((i) => i.sale!.soldAt),
  ).map((b) => ({ ...b, sales: 0, profit: 0 }));
  for (const item of inWindow) {
    const i = bucketIndex(buckets, item.sale!.soldAt);
    if (i < 0) continue;
    buckets[i]!.sales += 1;
    buckets[i]!.profit += itemRealized(item, currency) ?? 0;
  }
  return buckets;
}
