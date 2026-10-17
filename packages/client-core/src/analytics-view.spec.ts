import { displayContext } from './hunt-form.js';
import { describe, expect, it } from 'vitest';
import type { AnalyticsOverview, HuntAnalytics, HuntFunnel, MissedPotential, ProductAnalytics, ProductPerformance } from '@rein-drop/contracts';
import {
  ANALYTICS_PERIOD_OPTIONS,
  analyticsPeriodOptions,
  analyticsRecommendation,
  analyticsTargetPath,
  funnelView,
  lossReview,
  marketplaceRowsView,
  missedView,
  overviewView,
  periodLabel,
  productRowsView,
  toBars,
} from './analytics-view.js';

const ZA = displayContext({ currency: 'ZAR', distanceUnit: 'km' as const, localeTag: 'en-ZA' });
const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });
const nbsp = (s: string | null | undefined) => s?.replace(/[  ]/g, ' ');
const period = { key: '30d' as const, since: '2026-09-08T12:00:00.000Z', until: '2026-10-08T12:00:00.000Z' };
const at = '2026-10-08T12:00:00.000Z';
const realized = (profit: number, over: Partial<AnalyticsOverview['realized'][number]> = {}) => ({
  currency: 'ZAR',
  revenue: ZAR(650_000),
  comparableSales: 1,
  excludedSales: 0,
  realizedProfit: ZAR(profit),
  marginPercent: Math.trunc((100 * profit) / 650_000),
  ...over,
});

function overview(over: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
  return {
    period,
    buys: 3,
    sells: 2,
    spent: [ZAR(660_000)],
    sellingCosts: [ZAR(75_000)],
    realized: [realized(115_000, { revenue: ZAR(850_000), excludedSales: 1, marginPercent: 17 })],
    closed: [],
    netRealized: [ZAR(115_000)],
    avgDaysToSell: 5,
    holding: { count: 1, costBasis: [ZAR(200_000)], oldestDays: 5 },
    generatedAt: at,
    ...over,
  };
}
const funnel = (over: Partial<HuntFunnel> = {}): HuntFunnel => ({
  huntId: '00000000-0000-7000-8000-000000000001',
  name: 'Switch hunt',
  status: 'LIVE',
  found: 6,
  alerted: 3,
  viewed: 3,
  saved: 1,
  ignored: 1,
  bought: 2,
  sold: 1,
  realized: [realized(115_000)],
  ignoreRatePercent: 33,
  alertToBuyPercent: 66,
  ...over,
});
const product = (name: string, profit: number | null, over: Partial<ProductPerformance> = {}): ProductPerformance => ({
  key: name.toLowerCase(),
  name,
  bought: 1,
  sold: profit === null ? 0 : 1,
  holding: profit === null ? 1 : 0,
  returned: 0,
  writtenOff: 0,
  closedResult: [],
  spent: [ZAR(400_000)],
  realized: profit === null ? [] : [realized(profit)],
  avgDaysToSell: profit === null ? null : 8,
  ...over,
});
const missed = (over: Partial<MissedPotential> = {}): MissedPotential => ({
  period,
  count: 2,
  gone: 1,
  ignored: 1,
  withEstimate: 1,
  estimatedPotential: [ZAR(150_000)],
  items: [
    { dealId: '00000000-0000-7000-8000-00000000000a', title: 'Switch OLED', hunt: { id: '00000000-0000-7000-8000-000000000001', name: 'Switch hunt' }, marketplace: 'ebay', reason: 'ignored', strength: 'exceptional', estimatedUpside: ZAR(150_000), foundAt: at },
    { dealId: '00000000-0000-7000-8000-00000000000b', title: 'Switch Lite', hunt: { id: '00000000-0000-7000-8000-000000000001', name: 'Switch hunt' }, marketplace: 'facebook', reason: 'gone', strength: 'strong', estimatedUpside: null, foundAt: at },
  ],
  generatedAt: at,
  ...over,
});
const hunts = (items: HuntFunnel[] = [funnel()]): HuntAnalytics => ({ period, items, generatedAt: at });
const products = (items: ProductPerformance[]): ProductAnalytics => ({ period, items, generatedAt: at });

describe('overview', () => {
  it('every card says whether it is realized, activity or a snapshot of now', () => {
    const view = overviewView(overview(), ZA);
    expect(view.hasActivity).toBe(true);
    expect(view.cards.map((c) => [c.label, nbsp(c.value), c.basis, c.tone])).toEqual([
      ['Realized profit', 'R 1 150,00', 'Realized', 'profit'],
      ['Sold revenue', 'R 8 500,00', 'Realized', 'neutral'],
      ['Margin', '17%', 'Realized', 'profit'],
      ['Capital deployed', 'R 6 600,00', 'Activity', 'neutral'],
      ['Held now', '1 item', 'Now', 'neutral'],
      ['Time to sell', '5 days', 'Realized', 'neutral'],
    ]);
    expect(view.cards[0]!.caption).toBe('From 1 sale after recorded costs (1 sale in another currency not counted)');
    expect(nbsp(view.cards[4]!.caption)).toBe('R 2 000,00 tied up · oldest 5 days. Not a loss.');
  });

  it('before any sale: no invented numbers, honest captions; no activity = empty state', () => {
    const view = overviewView(overview({ sells: 0, realized: [], avgDaysToSell: null }), ZA);
    expect(view.cards[0]).toMatchObject({ value: '-', caption: 'Appears once you log a sale' });
    expect(overviewView(overview({ buys: 0, sells: 0, spent: [], realized: [], holding: { count: 0, costBasis: [], oldestDays: null } }), ZA).hasActivity).toBe(false);
  });

  it('a loss is a loss (red), and the money chart compares what went in with what came out', () => {
    const view = overviewView(overview({ realized: [realized(-60_000)] }), ZA);
    expect(view.cards[0]!.tone).toBe('loss');
    expect(view.moneyBars.map((b) => [b.label, b.widthPercent, b.tone])).toEqual([
      ['Capital deployed', 100, 'info'],
      ['Realized profit', 9, 'loss'],
    ]);
  });

  it('bars are relative to the largest value; zero stays empty, tiny values stay visible', () => {
    expect(toBars([{ label: 'a', amount: 200, value: '200' }, { label: 'b', amount: 1, value: '1' }, { label: 'c', amount: 0, value: '0' }]).map((b) => b.widthPercent)).toEqual([100, 2, 0]);
  });
});

describe('Hunt, product and marketplace views', () => {
  it('a funnel has one bar per stage and plain-language rates', () => {
    const view = funnelView(funnel(), ZA);
    expect(view.stages.map((s) => [s.label, s.value, s.widthPercent])).toEqual([
      ['Found', '6', 100],
      ['Alerted', '3', 50],
      ['Viewed', '3', 50],
      ['Saved', '1', 17],
      ['Bought', '2', 33],
      ['Sold', '1', 17],
    ]);
    expect(view.rates).toBe('33% of viewed deals ignored · 66% of alerts bought');
    // More buys than alerts in the period (bought without an alert): no misleading 150%.
    expect(funnelView(funnel({ alerted: 2, bought: 3, alertToBuyPercent: 150 }), ZA).rates).toBe('33% of viewed deals ignored');
    expect(view.quiet).toBe(false);
    expect(funnelView(funnel({ found: 0, alerted: 0, viewed: 0, saved: 0, ignored: 0, bought: 0, sold: 0, realized: [], ignoreRatePercent: null, alertToBuyPercent: null }), ZA)).toMatchObject({ quiet: true, rates: null, realized: null });
  });

  it('products: realized result with margin, held items have no result; loss review = losses worst first', () => {
    const items = [product('Switch OLED', 115_000), product('Switch Lite', null), product('Old console', -20_000), product('Broken TV', -60_000)];
    const rows = productRowsView(items, ZA);
    expect(rows[0]).toMatchObject({ counts: '1 bought · 1 sold', realized: { tone: 'profit', margin: '17% margin' }, avgDays: '8 days to sell', bar: { widthPercent: 100 } });
    expect(rows[1]).toMatchObject({ counts: '1 bought · 0 sold · 1 held', realized: null, bar: null });
    expect(lossReview(items, ZA).map((r) => r.name)).toEqual(['Broken TV', 'Old console']);
  });

  it('marketplaces: sourced vs sold here', () => {
    const rows = marketplaceRowsView(
      {
        period,
        generatedAt: at,
        items: [
          { marketplace: 'ebay', sourced: { found: 4, alerted: 3, bought: 1, sold: 1, realized: [realized(115_000)] }, soldHere: { sales: 1, revenue: [ZAR(650_000)] } },
          { marketplace: 'other', sourced: { found: 0, alerted: 0, bought: 1, sold: 0, realized: [] }, soldHere: { sales: 0, revenue: [] } },
        ],
      },
      ZA,
    );
    expect(rows.map((r) => [r.name, r.sourced, nbsp(r.soldHere)])).toEqual([
      ['eBay', '4 found · 3 alerts · 1 bought · 1 sold', '1 sale here · R 6 500,00'],
      ['Bought elsewhere', '0 found · 0 alerts · 1 bought · 0 sold', 'No sales here'],
    ]);
  });
});

describe('missed potential', () => {
  it('is labelled as an estimate and as not a loss', () => {
    const view = missedView(missed(), ZA);
    expect(view.headline).toBe("2 strong deals you didn't buy");
    expect(nbsp(view.potential?.value)).toBe('R 1 500,00');
    expect(view.potential?.caption).toMatch(/^Estimated upside .* Potential, not a loss - it is never part of your profit\.$/);
    expect(view.breakdown).toBe('1 gone before you bought · 1 you passed on · 1 without an estimate');
    expect(view.items.map((i) => [i.reason, nbsp(i.estimate)])).toEqual([
      ['You passed', 'R 1 500,00 estimated upside'],
      ['Gone before you bought', undefined],
    ]);
    expect(missedView(missed({ count: 0, gone: 0, ignored: 0, withEstimate: 0, estimatedPotential: [], items: [] }), ZA)).toMatchObject({ empty: true, potential: null, headline: 'No strong deals got away' });
  });
});

describe('recommendation (one, grounded in the numbers)', () => {
  const base = { overview: overview(), hunts: hunts(), products: products([product('Switch OLED', 115_000)]), missed: missed({ count: 0, gone: 0, ignored: 0, items: [] }) };

  it('in priority order, quoting the data', () => {
    expect(analyticsRecommendation({ ...base, overview: overview({ holding: { count: 2, costBasis: [ZAR(1)], oldestDays: 45 } }) }, ZA)).toMatchObject({
      code: 'stale_holding',
      body: "You're holding 2 items; the oldest for 45 days. Reprice or relist it to free up the money.",
      target: { kind: 'inventory' },
    });
    const loss = analyticsRecommendation({ ...base, products: products([product('Switch OLED', 115_000), product('Broken TV', -60_000)]) }, ZA)!;
    expect(loss.code).toBe('loss_product');
    // Intl writes the minus sign as "-" or "−" depending on the runtime.
    expect(nbsp(loss.body)).toMatch(/^1 sale realized [-−]R 600,00 after costs\. Check the buy price and fees before buying it again\.$/);
    expect(analyticsRecommendation({ ...base, hunts: hunts([funnel({ viewed: 10, ignored: 7, ignoreRatePercent: 70 })]) }, ZA)).toMatchObject({
      code: 'noisy_hunt',
      body: 'You ignored 7 of the 10 deals you opened (70%). Narrower criteria mean fewer, better deals.',
      target: { kind: 'edit_hunt' },
    });
    expect(analyticsRecommendation({ ...base, missed: missed({ count: 4, gone: 3, ignored: 1 }) }, ZA)).toMatchObject({ code: 'missed_deals', target: { kind: 'notifications' } });
    const best = analyticsRecommendation(base, ZA)!;
    expect(best.code).toBe('best_product');
    expect(nbsp(best.body)).toBe('1 sale realized R 1 150,00 at a 17% margin. A Hunt focused on it could find more.');
  });

  it('early on: review deals, then log sales; nothing to say = null', () => {
    const quiet = { overview: overview({ buys: 0, sells: 0, spent: [], realized: [], holding: { count: 0, costBasis: [], oldestDays: null } }), hunts: hunts(), products: products([]), missed: missed({ count: 0, gone: 0, ignored: 0, items: [] }) };
    expect(analyticsRecommendation(quiet, ZA)).toMatchObject({ code: 'review_deals', body: 'Your Hunts found 6 deals in this period and nothing was bought yet. Review the strongest ones.' });
    expect(analyticsRecommendation({ ...quiet, overview: overview({ sells: 0, realized: [] }), products: products([product('Switch Lite', null)]) }, ZA)).toMatchObject({ code: 'first_sale' });
    expect(analyticsRecommendation({ ...quiet, hunts: hunts([funnel({ found: 0 })]) }, ZA)).toBeNull();
  });

  it('targets keep the period where it matters', () => {
    expect(analyticsTargetPath({ kind: 'products' }, '90d')).toBe('/analytics/products?period=90d');
    expect(analyticsTargetPath({ kind: 'products' }, '30d')).toBe('/analytics/products');
    expect(analyticsTargetPath({ kind: 'edit_hunt', huntId: 'h1' }, '7d')).toBe('/hunts/h1/edit');
    expect(periodLabel('365d')).toBe('Last 12 months');
    expect(periodLabel('all')).toBe('All time');
  });
});

describe('German (draft)', () => {
  const DE = displayContext({ currency: 'ZAR', distanceUnit: 'km' as const, localeTag: 'de-DE' }, 'de');
  it('cards carry a translated basis; estimates are Potenzial, never Gewinn', () => {
    const view = overviewView(overview(), DE);
    expect(view.cards.map((c) => [c.label, c.basis, c.basisLabel])[0]).toEqual(['Realisierter Gewinn', 'Realized', 'Realisiert']);
    expect(view.cards[0]!.caption).toBe('Aus 1 Verkauf nach erfassten Kosten (1 Verkauf in anderer Währung nicht berücksichtigt)');
    expect(view.cards[2]!.value).toBe('17 %');
    expect(overviewView(overview(), ZA).cards.map((c) => c.basisLabel)).toEqual(['Realized', 'Realized', 'Realized', 'Activity', 'Now', 'Realized']);
    const missedDe = missedView(missed(), DE);
    expect(missedDe.headline).toBe('2 starke Deals, die du nicht gekauft hast');
    expect(missedDe.potential!.caption).toBe('Geschätztes Potenzial des 1 Deals mit Schätzung. Potenzial, kein Verlust – es zählt nie zu deinem Gewinn.');
    expect(missedDe.items.map((i) => i.estimate && nbsp(i.estimate))[0]).toMatch(/geschätztes Potenzial$/);
    expect([periodLabel('30d', DE.t), periodLabel('all', DE.t)]).toEqual(['Letzte 30 Tage', 'Gesamter Zeitraum']);
    expect(analyticsPeriodOptions(DE.t).map((o) => o.label)).toEqual(['7 Tage', '30 Tage', '90 Tage', '12 Monate', 'Gesamter Zeitraum']);
    expect(analyticsPeriodOptions(ZA.t)).toEqual(ANALYTICS_PERIOD_OPTIONS);
    expect(funnelView(funnel(), DE).stages.map((s) => [s.label, s.tone]).at(-1)).toEqual(['Verkauft', 'profit']);
  });
});
