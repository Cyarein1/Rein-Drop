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
import { translator, type MessageKey, type Translator } from '@rein-drop/i18n';
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
const PERIOD_KEY: Record<AnalyticsPeriod, [option: MessageKey, last: MessageKey]> = {
  '7d': ['analytics.period7d', 'analytics.periodLast7d'],
  '30d': ['analytics.period30d', 'analytics.periodLast30d'],
  '90d': ['analytics.period90d', 'analytics.periodLast90d'],
  '365d': ['analytics.period365d', 'analytics.periodLast365d'],
  all: ['analytics.periodAll', 'analytics.periodAll'],
};
/** Period options in the UI language. Use this; the English ANALYTICS_PERIOD_OPTIONS will be removed in step 89. */
export function analyticsPeriodOptions(t: Translator): { value: AnalyticsPeriod; label: string }[] {
  return ANALYTICS_PERIOD_OPTIONS.map((o) => ({ value: o.value, label: t(PERIOD_KEY[o.value][0]) }));
}
/** "Last 30 days" / "All time". */
export const periodLabel = (p: AnalyticsPeriod, t: Translator = translator('en')) => t(PERIOD_KEY[p][1]);
export const isAnalyticsPeriod = (v: unknown): v is AnalyticsPeriod => ANALYTICS_PERIOD_OPTIONS.some((o) => o.value === v);

type Tone = 'profit' | 'loss' | 'neutral';
const toneOf = (n: number): Tone => (n > 0 ? 'profit' : n < 0 ? 'loss' : 'neutral');

type Basis = MetricCard['basis'];
const BASIS_KEY: Record<Basis, MessageKey> = {
  Realized: 'analytics.basisRealized',
  Estimated: 'analytics.basisEstimated',
  Now: 'analytics.basisNow',
  Activity: 'analytics.basisActivity',
};
/** The basis badge in the UI language ("Realized" / "Estimated" / ...). Cards also carry it as `basisLabel`. */
export function basisLabel(basis: Basis, t: Translator): string {
  return t(BASIS_KEY[basis]);
}

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
  /** Realized / Estimated / Now - always shown, so no number is ambiguous. A stable value: display `basisLabel`. */
  basis: 'Realized' | 'Estimated' | 'Now' | 'Activity';
  /** `basis` in the UI language. */
  basisLabel: string;
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
  const { t } = ctx;
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const main = mainOf(o.realized, ctx, (r) => r.comparableSales + r.excludedSales);
  const currency = main?.currency ?? mainOf(o.spent, ctx, (m) => m.amountMinor)?.currency ?? mainOf(o.holding.costBasis, ctx)?.currency ?? ctx.currency;
  const zero = { amountMinor: 0, currency };
  const spent = { amountMinor: sumIn(o.spent, currency), currency };
  const tiedUp = { amountMinor: sumIn(o.holding.costBasis, currency), currency };
  const profit = main?.realizedProfit ?? zero;

  const card = (c: Omit<MetricCard, 'basisLabel'>): MetricCard => ({ ...c, basisLabel: basisLabel(c.basis, t) });
  const cards: MetricCard[] = [
    card({
      label: t('analytics.cardRealizedProfit'),
      value: main ? fmt(profit) : '-',
      tone: main ? toneOf(profit.amountMinor) : 'neutral',
      basis: 'Realized',
      caption: main
        ? main.excludedSales > 0
          ? t('analytics.captionFromSalesExcluded', { count: main.comparableSales, excluded: main.excludedSales })
          : t('analytics.captionFromSales', { count: main.comparableSales })
        : t('analytics.captionAfterFirstSale'),
    }),
    card({ label: t('analytics.cardSoldRevenue'), value: main ? fmt(main.revenue) : '-', tone: 'neutral', basis: 'Realized', caption: t('analytics.captionItemsSold', { count: o.sells }) }),
    card({
      label: t('analytics.cardMargin'),
      value: main?.marginPercent !== null && main?.marginPercent !== undefined ? t('analytics.percent', { value: main.marginPercent }) : '-',
      tone: main?.marginPercent ? toneOf(main.marginPercent) : 'neutral',
      basis: 'Realized',
      caption: t('analytics.captionMargin'),
    }),
    card({ label: t('analytics.cardCapital'), value: fmt(spent), tone: 'neutral', basis: 'Activity', caption: t('analytics.captionCapital', { count: o.buys }) }),
    card({
      label: t('analytics.cardHeldNow'),
      value: t('analytics.items', { count: o.holding.count }),
      tone: 'neutral',
      basis: 'Now',
      caption: o.holding.count > 0 ? t('analytics.captionHeld', { amount: fmt(tiedUp), days: o.holding.oldestDays ?? 0 }) : t('analytics.captionNothingHeld'),
    }),
    card({
      label: t('analytics.cardTimeToSell'),
      value: o.avgDaysToSell === null ? '-' : t('analytics.days', { days: o.avgDaysToSell }),
      tone: 'neutral',
      basis: 'Realized',
      caption: o.avgDaysToSell === null ? t('analytics.captionAfterFirstSale') : t('analytics.captionAverageTime'),
    }),
  ];

  const otherCurrencies = o.realized
    .filter((r) => r !== main && r.comparableSales > 0)
    .map((r) => t('analytics.otherCurrency', { amount: fmt(r.realizedProfit), currency: r.currency }));
  return {
    hasActivity: o.buys + o.sells + o.holding.count > 0,
    currency,
    cards,
    otherCurrencies,
    moneyBars: toBars([
      { label: t('analytics.cardCapital'), amount: spent.amountMinor, value: fmt(spent) },
      { label: t('analytics.cardRealizedProfit'), amount: profit.amountMinor, value: fmt(profit), tone: toneOf(profit.amountMinor) },
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
  const { t } = ctx;
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const stages: [MessageKey, number][] = [
    ['analytics.stageFound', h.found],
    ['analytics.stageAlerted', h.alerted],
    ['analytics.stageViewed', h.viewed],
    ['analytics.stageSaved', h.saved],
    ['analytics.stageBought', h.bought],
    ['analytics.stageSold', h.sold],
  ];
  const main = mainOf(h.realized, ctx, (r) => r.comparableSales);
  const rates = [
    h.ignoreRatePercent !== null ? t('analytics.rateIgnored', { percent: h.ignoreRatePercent }) : null,
    // Counts are activity in the period, so buys without an alert (or alerted earlier) can exceed
    // the alerts; a rate over 100% would mislead, so it's only shown when it means something (D29).
    h.alertToBuyPercent !== null && h.alertToBuyPercent <= 100 ? t('analytics.rateBought', { percent: h.alertToBuyPercent }) : null,
  ].filter(Boolean);
  return {
    huntId: h.huntId,
    name: h.name,
    status: h.status,
    stages: toBars(stages.map(([key, n]) => ({ label: t(key), amount: n, value: String(n), tone: key === 'analytics.stageSold' ? 'profit' : 'info' }))),
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
  const { t } = ctx;
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const mains = products.map((p) => productMain(p, ctx));
  const bars = toBars(products.map((p, i) => ({ label: p.name, amount: mains[i]?.realizedProfit.amountMinor ?? 0, value: mains[i] ? fmt(mains[i].realizedProfit) : '-', tone: toneOf(mains[i]?.realizedProfit.amountMinor ?? 0) })));
  return products.map((p, i) => {
    const m = mains[i];
    return {
      key: p.key,
      name: p.name,
      counts: p.holding > 0 ? t('analytics.productCountsHeld', { bought: p.bought, sold: p.sold, held: p.holding }) : t('analytics.productCounts', { bought: p.bought, sold: p.sold }),
      realized: m
        ? { value: fmt(m.realizedProfit), tone: toneOf(m.realizedProfit.amountMinor), margin: m.marginPercent !== null ? t('analytics.marginValue', { percent: m.marginPercent }) : null }
        : null,
      avgDays: p.avgDaysToSell === null ? null : t('analytics.daysToSell', { days: p.avgDaysToSell }),
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
  const { t } = ctx;
  const fmt = (x: Money) => formatMoney(x, ctx.localeTag);
  return m.items.map((i) => {
    const main = mainOf(i.sourced.realized, ctx, (r) => r.comparableSales);
    const revenue = mainOf(i.soldHere.revenue, ctx, (r) => r.amountMinor);
    const { found, alerted, bought, sold } = i.sourced;
    const sales = i.soldHere.sales;
    return {
      name: i.marketplace === 'other' ? t('analytics.boughtElsewhere') : MARKETPLACE_LABEL[i.marketplace],
      sourced: t('analytics.sourcedLine', { found, alerted, bought, sold }),
      realized: main && main.comparableSales > 0 ? { value: fmt(main.realizedProfit), tone: toneOf(main.realizedProfit.amountMinor) } : null,
      soldHere:
        sales > 0
          ? revenue
            ? t('analytics.soldHereRevenue', { count: sales, revenue: fmt(revenue) })
            : t('analytics.soldHere', { count: sales })
          : t('analytics.noSalesHere'),
    };
  });
}

// ---------------------------------------------------------------------------
// Missed potential
// ---------------------------------------------------------------------------

type MissedReason = MissedPotential['items'][number]['reason'];
export const MISSED_REASON_LABEL: Record<MissedReason, string> = {
  gone: 'Gone before you bought',
  ignored: 'You passed',
};
const MISSED_REASON_KEY: Record<MissedReason, MessageKey> = { gone: 'analytics.reasonGone', ignored: 'analytics.reasonIgnored' };
/** Missed-deal reason in the UI language. Use this; the English MISSED_REASON_LABEL will be removed in step 89. */
export function missedReasonLabel(reason: MissedReason, t: Translator): string {
  return t(MISSED_REASON_KEY[reason]);
}

export interface MissedView {
  headline: string;
  /** Always labelled as an estimate and as "not a loss". */
  potential: { value: string; caption: string } | null;
  breakdown: string;
  items: { dealId: string; title: string; meta: string; reason: string; estimate: string | null }[];
  empty: boolean;
}

export function missedView(m: MissedPotential, ctx: HuntFormContext): MissedView {
  const { t } = ctx;
  const fmt = (x: Money) => formatMoney(x, ctx.localeTag);
  const main = mainOf(m.estimatedPotential, ctx, (x) => x.amountMinor);
  return {
    headline: m.count === 0 ? t('analytics.missedNone') : t('analytics.missedHeadline', { count: m.count }),
    potential: main ? { value: fmt(main), caption: t('analytics.missedCaption', { count: m.withEstimate }) } : null,
    breakdown:
      m.count > m.withEstimate
        ? t('analytics.missedBreakdownNoEstimate', { gone: m.gone, ignored: m.ignored, without: m.count - m.withEstimate })
        : t('analytics.missedBreakdown', { gone: m.gone, ignored: m.ignored }),
    items: m.items.map((i) => ({
      dealId: i.dealId,
      title: i.title,
      // Hunt name is user content; strength is the API value (shown as before).
      meta: `${i.hunt.name} · ${MARKETPLACE_LABEL[i.marketplace]} · ${i.strength}`,
      reason: missedReasonLabel(i.reason, t),
      estimate: i.estimatedUpside ? t('analytics.missedEstimate', { amount: fmt(i.estimatedUpside) }) : null,
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
  const { t } = ctx;
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const R = ANALYTICS_RECOMMENDATION_RULES;
  const { overview, hunts, products, missed } = data;

  const oldest = overview.holding.oldestDays;
  if (oldest !== null && oldest >= R.staleHoldingDays) {
    return {
      code: 'stale_holding',
      title: t('analytics.recStaleTitle'),
      body: t('analytics.recStaleBody', { count: overview.holding.count, days: oldest }),
      actionLabel: t('analytics.actionOpenInventory'),
      target: { kind: 'inventory' },
    };
  }

  const rows = products.items.map((p) => ({ p, m: productMain(p, ctx) }));
  const worst = rows.filter((r) => r.m && r.m.realizedProfit.amountMinor < 0).sort((a, b) => a.m!.realizedProfit.amountMinor - b.m!.realizedProfit.amountMinor)[0];
  if (worst) {
    return {
      code: 'loss_product',
      title: t('analytics.recLossTitle', { name: worst.p.name }),
      body: t('analytics.recLossBody', { count: worst.p.sold, amount: fmt(worst.m!.realizedProfit) }),
      actionLabel: t('analytics.actionSeeProducts'),
      target: { kind: 'products' },
    };
  }

  const noisy = hunts.items
    .filter((h) => h.viewed >= R.minViewedForIgnoreRate && (h.ignoreRatePercent ?? 0) >= R.ignoreRatePercent)
    .sort((a, b) => (b.ignoreRatePercent ?? 0) - (a.ignoreRatePercent ?? 0))[0];
  if (noisy) {
    return {
      code: 'noisy_hunt',
      title: t('analytics.recNoisyTitle', { name: noisy.name }),
      body: t('analytics.recNoisyBody', { ignored: noisy.ignored, viewed: noisy.viewed, percent: noisy.ignoreRatePercent }),
      actionLabel: t('analytics.actionEditHunt'),
      target: { kind: 'edit_hunt', huntId: noisy.huntId },
    };
  }

  if (missed.count >= R.missedDeals) {
    return {
      code: 'missed_deals',
      title: t('analytics.recMissedTitle'),
      body: t('analytics.recMissedBody', { count: missed.count, gone: missed.gone, ignored: missed.ignored }),
      actionLabel: t('analytics.actionAlertSettings'),
      target: { kind: 'notifications' },
    };
  }

  const best = rows.filter((r) => r.m && r.m.realizedProfit.amountMinor > 0).sort((a, b) => b.m!.realizedProfit.amountMinor - a.m!.realizedProfit.amountMinor)[0];
  if (best) {
    return {
      code: 'best_product',
      title: t('analytics.recBestTitle', { name: best.p.name }),
      body:
        best.m!.marginPercent !== null
          ? t('analytics.recBestBodyMargin', { count: best.p.sold, amount: fmt(best.m!.realizedProfit), margin: best.m!.marginPercent })
          : t('analytics.recBestBody', { count: best.p.sold, amount: fmt(best.m!.realizedProfit) }),
      actionLabel: t('analytics.actionCreateHunt'),
      target: { kind: 'create_hunt' },
    };
  }

  const found = hunts.items.reduce((s, h) => s + h.found, 0);
  if (overview.buys === 0 && found > 0) {
    return {
      code: 'review_deals',
      title: t('analytics.recReviewTitle'),
      body: t('analytics.recReviewBody', { count: found }),
      actionLabel: t('analytics.actionGoToDeals'),
      target: { kind: 'deals' },
    };
  }

  if (overview.holding.count > 0 && overview.sells === 0) {
    return {
      code: 'first_sale',
      title: t('analytics.recFirstSaleTitle'),
      body: t('analytics.recFirstSaleBody', { count: overview.holding.count }),
      actionLabel: t('analytics.actionOpenInventory'),
      target: { kind: 'inventory' },
    };
  }
  return null;
}

/** Path for a recommendation target (same on web and mobile). */
export function analyticsTargetPath(target: AnalyticsTarget, period: AnalyticsPeriod): string {
  const q = period === '30d' ? '' : `?period=${period}`;
  switch (target.kind) {
    // Inventory merged into Sell (decision 0021); selling insights moved to Sell > Insights.
    case 'inventory':
      return '/sell?section=holding';
    case 'products':
      return `/sell/insights${q}`;
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
