import type {
  AnalyticsOverview,
  AnalyticsPeriod,
  HuntAnalytics,
  HuntFunnel,
  MarketplaceAnalytics,
  MissedPotential,
  Money,
  ProductAnalytics,
  ProductPerformance,
  RealizedByCurrency,
} from '@rein-drop/contracts';
import { MARKETPLACE_LABEL } from './deal-view.js';
import type { HuntFormContext } from './hunt-form.js';
import { formatMoney } from './money.js';

/**
 * Analytics view models, shared by web and mobile. Realized numbers are labelled "Realized";
 * anything estimated is labelled "Estimated" and never shown as profit or loss. Missed potential
 * is a comparison, not a loss.
 */

export const ANALYTICS_PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '365d', label: '12 months' },
  { value: 'all', label: 'All time' },
];
export const periodLabel = (p: AnalyticsPeriod) => (p === 'all' ? 'All time' : `Last ${ANALYTICS_PERIOD_OPTIONS.find((o) => o.value === p)!.label}`);
export const isAnalyticsPeriod = (v: unknown): v is AnalyticsPeriod => ANALYTICS_PERIOD_OPTIONS.some((o) => o.value === v);

type Tone = 'profit' | 'loss' | 'neutral';
const toneOf = (n: number): Tone => (n > 0 ? 'profit' : n < 0 ? 'loss' : 'neutral');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The currency to headline: the user's own if present, else the one with the most activity. */
function mainOf<T extends { currency: string }>(rows: readonly T[], ctx: HuntFormContext, weight: (r: T) => number = () => 0): T | null {
  if (rows.length === 0) return null;
  return rows.find((r) => r.currency === ctx.currency) ?? [...rows].sort((a, b) => weight(b) - weight(a))[0]!;
}
const sumIn = (list: readonly Money[], currency: string) => list.filter((m) => m.currency === currency).reduce((s, m) => s + m.amountMinor, 0);

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface MetricCard {
  label: string;
  value: string;
  tone: Tone;
  /** Realized / Estimated / Now - always shown, so no number is ambiguous. */
  basis: 'Realized' | 'Estimated' | 'Now' | 'Activity';
  caption: string | null;
}

export interface OverviewView {
  /** False when nothing was bought, sold or held - show the empty state instead of zeros. */
  hasActivity: boolean;
  currency: string;
  cards: MetricCard[];
  /** "Also R 1 200,00 realized in EUR" for other currencies. */
  otherCurrencies: string[];
  /** Realized profit vs capital deployed, as two bars (the money in vs the money made). */
  moneyBars: Bar[];
}

export interface Bar {
  label: string;
  value: string;
  /** 0-100, relative to the largest bar in the same chart. */
  widthPercent: number;
  tone: Tone | 'info';
}

/** Bars relative to the largest absolute value (at least a sliver for any non-zero value). */
export function toBars(items: { label: string; amount: number; value: string; tone?: Bar['tone'] }[]): Bar[] {
  const max = Math.max(0, ...items.map((i) => Math.abs(i.amount)));
  return items.map((i) => ({
    label: i.label,
    value: i.value,
    widthPercent: max === 0 || i.amount === 0 ? 0 : Math.max(2, Math.round((100 * Math.abs(i.amount)) / max)),
    tone: i.tone ?? 'info',
  }));
}

export function overviewView(o: AnalyticsOverview, ctx: HuntFormContext): OverviewView {
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const main = mainOf(o.realized, ctx, (r) => r.comparableSales + r.excludedSales);
  const currency = main?.currency ?? mainOf(o.spent, ctx, (m) => m.amountMinor)?.currency ?? mainOf(o.holding.costBasis, ctx)?.currency ?? ctx.currency;
  const zero = { amountMinor: 0, currency };
  const spent = { amountMinor: sumIn(o.spent, currency), currency };
  const tiedUp = { amountMinor: sumIn(o.holding.costBasis, currency), currency };
  const profit = main?.realizedProfit ?? zero;

  const cards: MetricCard[] = [
    {
      label: 'Realized profit',
      value: main ? fmt(profit) : '-',
      tone: main ? toneOf(profit.amountMinor) : 'neutral',
      basis: 'Realized',
      caption: main
        ? `From ${plural(main.comparableSales, 'sale')} after recorded costs${main.excludedSales > 0 ? ` (${plural(main.excludedSales, 'sale')} in another currency not counted)` : ''}`
        : 'Appears once you log a sale',
    },
    { label: 'Sold revenue', value: main ? fmt(main.revenue) : '-', tone: 'neutral', basis: 'Realized', caption: plural(o.sells, 'item') + ' sold' },
    {
      label: 'Margin',
      value: main?.marginPercent !== null && main?.marginPercent !== undefined ? `${main.marginPercent}%` : '-',
      tone: main?.marginPercent ? toneOf(main.marginPercent) : 'neutral',
      basis: 'Realized',
      caption: 'Realized profit ÷ sale price',
    },
    { label: 'Capital deployed', value: fmt(spent), tone: 'neutral', basis: 'Activity', caption: `${plural(o.buys, 'item')} bought, incl. purchase costs` },
    {
      label: 'Held now',
      value: plural(o.holding.count, 'item'),
      tone: 'neutral',
      basis: 'Now',
      caption: o.holding.count > 0 ? `${fmt(tiedUp)} tied up · oldest ${plural(o.holding.oldestDays ?? 0, 'day')}. Not a loss.` : 'Nothing waiting to sell',
    },
    {
      label: 'Time to sell',
      value: o.avgDaysToSell === null ? '-' : `${o.avgDaysToSell} days`,
      tone: 'neutral',
      basis: 'Realized',
      caption: o.avgDaysToSell === null ? 'Appears once you log a sale' : 'Average, purchase to sale',
    },
  ];

  const otherCurrencies = o.realized.filter((r) => r !== main && r.comparableSales > 0).map((r) => `Also ${fmt(r.realizedProfit)} realized in ${r.currency}`);
  return {
    hasActivity: o.buys + o.sells + o.holding.count > 0,
    currency,
    cards,
    otherCurrencies,
    moneyBars: toBars([
      { label: 'Capital deployed', amount: spent.amountMinor, value: fmt(spent) },
      { label: 'Realized profit', amount: profit.amountMinor, value: fmt(profit), tone: toneOf(profit.amountMinor) },
    ]),
  };
}

// ---------------------------------------------------------------------------
// Hunt funnel
// ---------------------------------------------------------------------------

export interface FunnelView {
  huntId: string;
  name: string;
  status: string;
  stages: Bar[];
  /** "33% ignored · 1 in 3 alerts bought". */
  rates: string | null;
  realized: { value: string; tone: Tone } | null;
  /** Nothing happened in the period. */
  quiet: boolean;
}

export function funnelView(h: HuntFunnel, ctx: HuntFormContext): FunnelView {
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const stages: [string, number][] = [
    ['Found', h.found],
    ['Alerted', h.alerted],
    ['Viewed', h.viewed],
    ['Saved', h.saved],
    ['Bought', h.bought],
    ['Sold', h.sold],
  ];
  const main = mainOf(h.realized, ctx, (r) => r.comparableSales);
  const rates = [
    h.ignoreRatePercent !== null ? `${h.ignoreRatePercent}% of viewed deals ignored` : null,
    // Counts are activity in the period, so buys without an alert (or alerted earlier) can exceed
    // the alerts; a rate over 100% would mislead, so it's only shown when it means something (D29).
    h.alertToBuyPercent !== null && h.alertToBuyPercent <= 100 ? `${h.alertToBuyPercent}% of alerts bought` : null,
  ].filter(Boolean);
  return {
    huntId: h.huntId,
    name: h.name,
    status: h.status,
    stages: toBars(stages.map(([label, n]) => ({ label, amount: n, value: String(n), tone: label === 'Sold' ? 'profit' : 'info' }))),
    rates: rates.length > 0 ? rates.join(' · ') : null,
    realized: main && main.comparableSales > 0 ? { value: fmt(main.realizedProfit), tone: toneOf(main.realizedProfit.amountMinor) } : null,
    quiet: h.found + h.alerted + h.viewed + h.saved + h.ignored + h.bought + h.sold === 0,
  };
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface ProductRowView {
  key: string;
  name: string;
  /** "2 bought · 1 sold · 1 held". */
  counts: string;
  realized: { value: string; tone: Tone; margin: string | null } | null;
  avgDays: string | null;
  /** Bar for the realized result, relative to the largest result in the list. */
  bar: Bar | null;
}

const productMain = (p: ProductPerformance, ctx: HuntFormContext): RealizedByCurrency | null => {
  const m = mainOf(p.realized, ctx, (r) => r.comparableSales);
  return m && m.comparableSales > 0 ? m : null;
};

export function productRowsView(products: ProductAnalytics['items'], ctx: HuntFormContext): ProductRowView[] {
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const mains = products.map((p) => productMain(p, ctx));
  const bars = toBars(products.map((p, i) => ({ label: p.name, amount: mains[i]?.realizedProfit.amountMinor ?? 0, value: mains[i] ? fmt(mains[i].realizedProfit) : '-', tone: toneOf(mains[i]?.realizedProfit.amountMinor ?? 0) })));
  return products.map((p, i) => {
    const m = mains[i];
    return {
      key: p.key,
      name: p.name,
      counts: [`${p.bought} bought`, `${p.sold} sold`, p.holding > 0 ? `${p.holding} held` : null].filter(Boolean).join(' · '),
      realized: m ? { value: fmt(m.realizedProfit), tone: toneOf(m.realizedProfit.amountMinor), margin: m.marginPercent !== null ? `${m.marginPercent}% margin` : null } : null,
      avgDays: p.avgDaysToSell === null ? null : `${p.avgDaysToSell} days to sell`,
      bar: m ? bars[i]! : null,
    };
  });
}

/** Products with a realized loss (the loss review), worst first. */
export function lossReview(products: ProductAnalytics['items'], ctx: HuntFormContext): ProductRowView[] {
  const rows = productRowsView(products, ctx);
  return rows.filter((r) => r.realized?.tone === 'loss').reverse();
}

// ---------------------------------------------------------------------------
// Marketplaces
// ---------------------------------------------------------------------------

export interface MarketplaceRowView {
  name: string;
  /** "12 found · 3 alerts · 2 bought · 1 sold". */
  sourced: string;
  realized: { value: string; tone: Tone } | null;
  soldHere: string;
}

export function marketplaceRowsView(m: MarketplaceAnalytics, ctx: HuntFormContext): MarketplaceRowView[] {
  const fmt = (x: Money) => formatMoney(x, ctx.localeTag);
  return m.items.map((i) => {
    const main = mainOf(i.sourced.realized, ctx, (r) => r.comparableSales);
    const revenue = mainOf(i.soldHere.revenue, ctx, (r) => r.amountMinor);
    return {
      name: i.marketplace === 'other' ? 'Bought elsewhere' : MARKETPLACE_LABEL[i.marketplace],
      sourced: `${i.sourced.found} found · ${plural(i.sourced.alerted, 'alert')} · ${i.sourced.bought} bought · ${i.sourced.sold} sold`,
      realized: main && main.comparableSales > 0 ? { value: fmt(main.realizedProfit), tone: toneOf(main.realizedProfit.amountMinor) } : null,
      soldHere: i.soldHere.sales > 0 ? `${plural(i.soldHere.sales, 'sale')} here${revenue ? ` · ${fmt(revenue)}` : ''}` : 'No sales here',
    };
  });
}

// ---------------------------------------------------------------------------
// Missed potential
// ---------------------------------------------------------------------------

export const MISSED_REASON_LABEL: Record<MissedPotential['items'][number]['reason'], string> = {
  gone: 'Gone before you bought',
  ignored: 'You passed',
};

export interface MissedView {
  headline: string;
  /** Always labelled as an estimate and as "not a loss". */
  potential: { value: string; caption: string } | null;
  breakdown: string;
  items: { dealId: string; title: string; meta: string; reason: string; estimate: string | null }[];
  empty: boolean;
}

export function missedView(m: MissedPotential, ctx: HuntFormContext): MissedView {
  const fmt = (x: Money) => formatMoney(x, ctx.localeTag);
  const main = mainOf(m.estimatedPotential, ctx, (x) => x.amountMinor);
  return {
    headline: m.count === 0 ? 'No strong deals got away' : `${plural(m.count, 'strong deal')} you didn't buy`,
    potential: main
      ? {
          value: fmt(main),
          caption: `Estimated upside of the ${plural(m.withEstimate, 'deal')} that had an estimate. Potential, not a loss - it is never part of your profit.`,
        }
      : null,
    breakdown: `${m.gone} gone before you bought · ${m.ignored} you passed on${m.count > m.withEstimate ? ` · ${m.count - m.withEstimate} without an estimate` : ''}`,
    items: m.items.map((i) => ({
      dealId: i.dealId,
      title: i.title,
      meta: `${i.hunt.name} · ${MARKETPLACE_LABEL[i.marketplace]} · ${i.strength}`,
      reason: MISSED_REASON_LABEL[i.reason],
      estimate: i.estimatedUpside ? `${fmt(i.estimatedUpside)} estimated upside` : null,
    })),
    empty: m.count === 0,
  };
}

// ---------------------------------------------------------------------------
// One data-grounded recommendation
// ---------------------------------------------------------------------------

/** Proposed thresholds (D30) - the recommendation always quotes the numbers behind it. */
export const ANALYTICS_RECOMMENDATION_RULES = {
  /** An item held this long is worth repricing / relisting. */
  staleHoldingDays: 30,
  /** A Hunt whose viewed deals are mostly ignored needs tighter criteria... */
  ignoreRatePercent: 60,
  /** ...once enough deals were viewed to tell. */
  minViewedForIgnoreRate: 5,
  /** This many strong deals getting away suggests acting faster. */
  missedDeals: 3,
} as const;

export type AnalyticsTarget = { kind: 'inventory' } | { kind: 'products' } | { kind: 'missed' } | { kind: 'deals' } | { kind: 'edit_hunt'; huntId: string } | { kind: 'create_hunt' } | { kind: 'notifications' };

export interface AnalyticsRecommendation {
  code: 'stale_holding' | 'loss_product' | 'noisy_hunt' | 'missed_deals' | 'best_product' | 'review_deals' | 'first_sale';
  title: string;
  body: string;
  actionLabel: string;
  target: AnalyticsTarget;
}

/** The first rule that applies, worded with the actual numbers. Null when the data says nothing yet. */
export function analyticsRecommendation(
  data: { overview: AnalyticsOverview; hunts: HuntAnalytics; products: ProductAnalytics; missed: MissedPotential },
  ctx: HuntFormContext,
): AnalyticsRecommendation | null {
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const R = ANALYTICS_RECOMMENDATION_RULES;
  const { overview, hunts, products, missed } = data;

  const oldest = overview.holding.oldestDays;
  if (oldest !== null && oldest >= R.staleHoldingDays) {
    return {
      code: 'stale_holding',
      title: 'Something has been waiting to sell',
      body: `You're holding ${plural(overview.holding.count, 'item')}; the oldest for ${oldest} days. Reprice or relist it to free up the money.`,
      actionLabel: 'Open Inventory',
      target: { kind: 'inventory' },
    };
  }

  const rows = products.items.map((p) => ({ p, m: productMain(p, ctx) }));
  const worst = rows.filter((r) => r.m && r.m.realizedProfit.amountMinor < 0).sort((a, b) => a.m!.realizedProfit.amountMinor - b.m!.realizedProfit.amountMinor)[0];
  if (worst) {
    return {
      code: 'loss_product',
      title: `${worst.p.name} lost money`,
      body: `${plural(worst.p.sold, 'sale')} realized ${fmt(worst.m!.realizedProfit)} after costs. Check the buy price and fees before buying it again.`,
      actionLabel: 'See products',
      target: { kind: 'products' },
    };
  }

  const noisy = hunts.items
    .filter((h) => h.viewed >= R.minViewedForIgnoreRate && (h.ignoreRatePercent ?? 0) >= R.ignoreRatePercent)
    .sort((a, b) => (b.ignoreRatePercent ?? 0) - (a.ignoreRatePercent ?? 0))[0];
  if (noisy) {
    return {
      code: 'noisy_hunt',
      title: `Tighten "${noisy.name}"`,
      body: `You ignored ${noisy.ignored} of the ${noisy.viewed} deals you opened (${noisy.ignoreRatePercent}%). Narrower criteria mean fewer, better deals.`,
      actionLabel: 'Edit Hunt',
      target: { kind: 'edit_hunt', huntId: noisy.huntId },
    };
  }

  if (missed.count >= R.missedDeals) {
    return {
      code: 'missed_deals',
      title: 'Strong deals are getting away',
      body: `${plural(missed.count, 'strong deal')} ended without a purchase (${missed.gone} gone, ${missed.ignored} passed on). Turn on alerts to act sooner.`,
      actionLabel: 'Alert settings',
      target: { kind: 'notifications' },
    };
  }

  const best = rows.filter((r) => r.m && r.m.realizedProfit.amountMinor > 0).sort((a, b) => b.m!.realizedProfit.amountMinor - a.m!.realizedProfit.amountMinor)[0];
  if (best) {
    return {
      code: 'best_product',
      title: `${best.p.name} is working`,
      body: `${plural(best.p.sold, 'sale')} realized ${fmt(best.m!.realizedProfit)}${best.m!.marginPercent !== null ? ` at a ${best.m!.marginPercent}% margin` : ''}. A Hunt focused on it could find more.`,
      actionLabel: 'Create a Hunt',
      target: { kind: 'create_hunt' },
    };
  }

  const found = hunts.items.reduce((s, h) => s + h.found, 0);
  if (overview.buys === 0 && found > 0) {
    return {
      code: 'review_deals',
      title: 'Deals are waiting',
      body: `Your Hunts found ${plural(found, 'deal')} in this period and nothing was bought yet. Review the strongest ones.`,
      actionLabel: 'Go to deals',
      target: { kind: 'deals' },
    };
  }

  if (overview.holding.count > 0 && overview.sells === 0) {
    return {
      code: 'first_sale',
      title: 'Log your sales',
      body: `You're holding ${plural(overview.holding.count, 'item')}. Mark them sold when they go, so profit is calculated from what really happened.`,
      actionLabel: 'Open Inventory',
      target: { kind: 'inventory' },
    };
  }
  return null;
}

/** Path for a recommendation target (same on web and mobile). */
export function analyticsTargetPath(target: AnalyticsTarget, period: AnalyticsPeriod): string {
  const q = period === '30d' ? '' : `?period=${period}`;
  switch (target.kind) {
    case 'inventory':
      return '/inventory';
    case 'products':
      return `/analytics/products${q}`;
    case 'missed':
      return `/analytics/missed${q}`;
    case 'deals':
      return '/deals';
    case 'edit_hunt':
      return `/hunts/${target.huntId}/edit`;
    case 'create_hunt':
      return '/hunts/new';
    case 'notifications':
      return '/settings';
  }
}
