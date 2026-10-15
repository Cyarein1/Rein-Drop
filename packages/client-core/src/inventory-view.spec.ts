import { displayContext } from './hunt-form.js';
import { describe, expect, it } from 'vitest';
import { compareAmounts, realizedResult, type InventoryItem, type Money } from '@rein-drop/contracts';
import {
  buildPurchaseUpdate,
  buildSaleRequest,
  dayShortcuts,
  INVENTORY_FILTERS,
  inventoryDetailView,
  inventoryEmptyText,
  inventoryFilters,
  inventoryRowView,
  isValidDay,
  localDay,
  newCostDraft,
  parseCostDrafts,
  purchaseFormDefaults,
  saleFormDefaults,
  salePreview,
  saleResultView,
  soldWhereOptions,
  type SaleForm,
} from './inventory-view.js';

const ZA = displayContext({ currency: 'ZAR', distanceUnit: 'km' as const, localeTag: 'en-ZA' });
const ZAR = (amountMinor: number): Money => ({ amountMinor, currency: 'ZAR' });
const nbsp = (s: string | null | undefined) => s?.replace(/[  ]/g, ' ');
// Local-time instants so the tests pass in any time zone.
const NOW = new Date(2026, 9, 8, 15, 0, 0);
const BOUGHT = new Date(2026, 8, 28, 10, 0, 0);
const ID = '00000000-0000-7000-8000-000000000001';

const cost = (category: string, amountMinor: number) => ({ id: ID, category: category as 'TAX', amount: ZAR(amountMinor), note: null, incurredAt: BOUGHT.toISOString() });

/** A held item: paid 4 000 + 600 tax + 150 shipping; estimates 6 000 resale / 1 850 upside. */
function held(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: ID,
    title: 'Nintendo Switch OLED',
    status: 'IN_STOCK',
    holding: true,
    notes: null,
    dealId: ID,
    source: { marketplace: 'ebay', url: 'https://dev.example/1' },
    purchase: { price: ZAR(400_000), purchasedAt: BOUGHT.toISOString(), costs: [cost('TAX', 60_000), cost('SHIPPING', 15_000)], total: ZAR(475_000) },
    sale: null,
    result: null,
    daysHeld: 10,
    expected: {
      capturedAt: BOUGHT.toISOString(),
      askingPrice: ZAR(400_000),
      knownCosts: ZAR(15_000),
      estimatedResale: ZAR(600_000),
      estimatedUpside: ZAR(185_000),
      strength: 'strong',
      confidence: 'medium',
    },
    comparison: {
      purchasePrice: compareAmounts(ZAR(400_000), ZAR(400_000)),
      salePrice: compareAmounts(ZAR(600_000), null),
      profit: compareAmounts(ZAR(185_000), null),
    },
    createdAt: BOUGHT.toISOString(),
    updatedAt: BOUGHT.toISOString(),
    ...over,
  };
}

/** The same item sold for `price` with `fees` selling costs (as the API would return it). */
function sold(price: number, fees: number[], over: Partial<InventoryItem> = {}): InventoryItem {
  const base = held(over);
  const salePrice = ZAR(price);
  const saleCosts = fees.map((f) => ZAR(f));
  const result = realizedResult({ purchasePrice: base.purchase.price, purchaseCosts: base.purchase.costs.map((c) => c.amount), salePrice, saleCosts });
  return {
    ...base,
    status: 'SOLD',
    holding: false,
    daysHeld: 8,
    sale: { price: salePrice, soldAt: new Date(2026, 9, 6, 12).toISOString(), marketplace: 'ebay', costs: fees.map((f) => cost('MARKETPLACE_FEE', f)) },
    result,
    comparison: {
      purchasePrice: base.comparison.purchasePrice,
      salePrice: compareAmounts(base.expected?.estimatedResale ?? null, salePrice),
      profit: compareAmounts(base.expected?.estimatedUpside ?? null, result.status === 'ok' ? result.realizedProfit : null),
    },
  };
}

describe('inventory list and detail', () => {
  it('a held item shows its cost and holding time - no profit, no loss', () => {
    const row = inventoryRowView(held(), ZA);
    expect(row).toMatchObject({ status: { label: 'In stock' }, source: 'eBay', held: 'Held 10 days', result: null, action: { kind: 'sell', label: 'Mark sold' } });
    expect(nbsp(row.cost)).toBe('Cost R 4 750,00');
    expect(nbsp(row.estimate)).toBe('Estimated resale R 6 000,00 (estimate)');
  });

  it('a sold item shows the realized result', () => {
    expect(inventoryRowView(sold(650_000, [95_000]), ZA)).toMatchObject({
      held: 'Sold after 8 days',
      result: { label: 'Realized profit', tone: 'profit' },
      estimate: null,
      action: { kind: 'result' },
    });
    expect(inventoryRowView(sold(420_000, [30_000]), ZA).result).toMatchObject({ label: 'Realized loss', tone: 'loss' });
  });

  it('detail lists purchase costs and labels estimates', () => {
    const view = inventoryDetailView(held(), ZA);
    expect(view.purchaseLines.map(([k, v]) => [k, nbsp(v)])).toEqual([
      ['Price paid', 'R 4 000,00'],
      ['Tax', 'R 600,00'],
      ['Shipping to you', 'R 150,00'],
      ['Total cost', 'R 4 750,00'],
    ]);
    expect(view.expectedLines.map(([k]) => k)).toEqual(['Asking price', 'Costs the listing showed', 'Estimated resale (estimate)', 'Estimated upside (estimate)']);
    expect(inventoryDetailView(held({ expected: null }), ZA).expectedLines).toEqual([]);
  });
});

describe('dates and cost rows', () => {
  it('days are local calendar days', () => {
    expect(localDay(NOW)).toBe('2026-10-08');
    expect(dayShortcuts(NOW).map((s) => s.value)).toEqual(['2026-10-08', '2026-10-07']);
    expect(isValidDay('2026-02-30')).toBe(false);
    expect(isValidDay('8 Oct')).toBe(false);
  });

  it('empty rows are skipped; bad or zero amounts are errors on their row', () => {
    const a = newCostDraft('TAX', '60');
    const b = newCostDraft('SHIPPING', '');
    const c = newCostDraft('REPAIR', '0');
    expect(parseCostDrafts([a, b], 'ZAR')).toEqual({ ok: true, costs: [{ category: 'TAX', amount: ZAR(6_000) }] });
    expect(parseCostDrafts([a, c], 'ZAR')).toEqual({ ok: false, errors: { [c.key]: 'Must be more than zero' } });
  });
});

describe('Mark Sold', () => {
  const form = (over: Partial<SaleForm> = {}): SaleForm => ({ ...saleFormDefaults(held(), ZA, NOW), ...over });

  it('defaults to today, the source marketplace and the usual fee rows - never the estimate as the price', () => {
    const d = saleFormDefaults(held(), ZA, NOW);
    expect(d).toMatchObject({ correcting: false, price: '', currency: 'ZAR', day: '2026-10-08', where: 'ebay' });
    expect(d.costs.map((c) => c.category)).toEqual(['MARKETPLACE_FEE', 'PAYMENT_FEE', 'SHIPPING']);
    expect(nbsp(d.estimateHint)).toBe('Rein Drop estimated about R 6 000,00 when you bought it.');
    // Correcting a sale starts from what was recorded.
    expect(saleFormDefaults(sold(650_000, [65_000]), ZA, NOW)).toMatchObject({ correcting: true, price: '6500.00', day: '2026-10-06', where: 'ebay' });
  });

  it('validates price and date', () => {
    expect(buildSaleRequest(form(), held(), NOW)).toEqual({ ok: false, errors: { price: 'Enter what it sold for' } });
    expect(buildSaleRequest(form({ price: '6500', day: '2026-10-09' }), held(), NOW)).toMatchObject({ ok: false, errors: { day: "Can't be in the future" } });
    expect(buildSaleRequest(form({ price: '6500', day: '2026-09-27' }), held(), NOW)).toMatchObject({ ok: false, errors: { day: "Can't be before you bought it" } });
    expect(buildSaleRequest(form({ price: '6500', day: 'yesterday' }), held(), NOW).ok).toBe(false);
  });

  it('builds the request: today = now, other days = local noon, never before the purchase', () => {
    const f = form({ price: '6500' });
    f.costs[0]!.amount = '650';
    f.costs[1]!.amount = '100';
    expect(buildSaleRequest(f, held(), NOW)).toEqual({
      ok: true,
      request: {
        price: ZAR(650_000),
        soldAt: NOW.toISOString(),
        marketplace: 'ebay',
        costs: [
          { category: 'MARKETPLACE_FEE', amount: ZAR(65_000) },
          { category: 'PAYMENT_FEE', amount: ZAR(10_000) },
        ],
      },
    });
    const other = buildSaleRequest(form({ price: '6500', day: '2026-10-01', where: 'other' }), held(), NOW);
    expect(other).toMatchObject({ ok: true, request: { soldAt: new Date(2026, 9, 1, 12).toISOString(), marketplace: null } });
    // Same day as the purchase, bought after noon: never before the purchase.
    const lateBuy = held({ purchase: { ...held().purchase, purchasedAt: new Date(2026, 9, 1, 18).toISOString() } });
    expect(buildSaleRequest(form({ price: '6500', day: '2026-10-01' }), lateBuy, NOW)).toMatchObject({ ok: true, request: { soldAt: new Date(2026, 9, 1, 18).toISOString() } });
  });

  it('previews the realized result live, using the same formula as the server', () => {
    expect(salePreview(form(), held(), ZA)).toMatchObject({ profit: null, note: 'Enter the sale price to see your profit.' });
    const f = form({ price: '6500' });
    f.costs[0]!.amount = '950';
    const preview = salePreview(f, held(), ZA);
    expect(preview.profit).toMatchObject({ label: 'You would make', tone: 'profit' });
    expect(nbsp(preview.profit?.value)).toBe('R 800,00');
    // 4 500 against a 4 750 cost basis.
    const loss = salePreview(form({ price: '4500' }), held(), ZA);
    expect(loss.profit).toMatchObject({ label: 'You would lose', tone: 'loss' });
    expect(nbsp(loss.profit?.value)).toBe('R 250,00');
  });
});

describe('Sale Result', () => {
  it('is only for sold items', () => {
    expect(saleResultView(held(), ZA)).toBeNull();
  });

  it('a realized profit is celebrated and compared with the estimates', () => {
    const view = saleResultView(sold(650_000, [65_000, 10_000, 20_000]), ZA)!;
    expect(view).toMatchObject({ headline: 'Realized profit', tone: 'profit', celebrate: true, summary: '12% margin · 16% return on cost · sold after 8 days' });
    expect(nbsp(view.value)).toBe('R 800,00');
    expect(view.comparisons.map((c) => [c.label, nbsp(c.expected), nbsp(c.actual), nbsp(c.difference), c.tone])).toEqual([
      ['Buy price', 'R 4 000,00', 'R 4 000,00', 'R 0,00', 'neutral'],
      ['Sale price', 'R 6 000,00', 'R 6 500,00', '+ R 500,00', 'profit'],
      ['Profit', 'R 1 850,00', 'R 800,00', '− R 1 050,00', 'loss'],
    ]);
    expect(view.comparisonNote).toMatch(/comparison, not a loss/);
    expect(nbsp(view.insight)).toBe('It sold for R 500,00 more than Rein Drop estimated.');
  });

  it('under the estimate is still a profit, and says so', () => {
    const view = saleResultView(sold(560_000, [20_000]), ZA)!;
    expect(view.celebrate).toBe(true);
    expect(nbsp(view.insight)).toBe('You made R 650,00, R 1 200,00 under the estimate - a comparison, not a loss.');
  });

  it('a realized loss is never celebrated, and explains when fees caused it', () => {
    const view = saleResultView(sold(500_000, [40_000]), ZA)!;
    expect(view).toMatchObject({ headline: 'Realized loss', tone: 'loss', celebrate: false });
    expect(nbsp(view.value)).toBe('− R 150,00');
    expect(nbsp(view.insight)).toBe('Selling costs of R 400,00 turned this into a loss. Check fees before pricing the next one.');
    expect(nbsp(saleResultView(sold(400_000, []), ZA)!.insight)).toBe('It sold for R 750,00 less than it cost you.');
    // Below cost AND fees: both are named.
    expect(nbsp(saleResultView(sold(450_000, [20_000]), ZA)!.insight)).toBe(
      'It sold for R 250,00 less than it cost you, and selling costs of R 200,00 added to the loss.',
    );
  });

  it('break-even is neutral and not celebrated', () => {
    expect(saleResultView(sold(475_000, []), ZA)).toMatchObject({ headline: 'Broke even', tone: 'neutral', celebrate: false });
  });

  it('without estimates there is nothing to celebrate except the realized number', () => {
    const view = saleResultView(sold(500_000, [], { expected: null, comparison: { purchasePrice: compareAmounts(null, ZAR(400_000)), salePrice: compareAmounts(null, null), profit: compareAmounts(null, null) } }), ZA)!;
    expect(view.comparisons).toEqual([]);
    expect(view.comparisonNote).toMatch(/no resale estimate/);
    expect(view.celebrate).toBe(true);
  });

  it('a sale in another currency has no result and no celebration', () => {
    const item = sold(650_000, []);
    const usdSale = { ...item, sale: { ...item.sale!, price: { amountMinor: 35_000, currency: 'USD' } }, result: { status: 'unavailable' as const, reason: 'currency_mismatch' as const } };
    expect(saleResultView(usdSale, ZA)).toMatchObject({ headline: 'Sold', celebrate: false, tone: 'neutral' });
  });
});

describe('German (draft)', () => {
  const DE = displayContext({ currency: 'ZAR', distanceUnit: 'km' as const, localeTag: 'de-DE' }, 'de');

  it('list row, plurals and labels', () => {
    const row = inventoryRowView(held(), DE);
    expect(row).toMatchObject({ status: { label: 'Im Bestand', tone: 'neutral' }, source: 'eBay', held: 'Seit 10 Tagen im Bestand', action: { label: 'Als verkauft markieren' } });
    expect(nbsp(row.cost)).toMatch(/^Kosten 4\.750,00 ZAR$/);
    expect(inventoryRowView(held({ daysHeld: 1 }), DE).held).toBe('Seit 1 Tag im Bestand');
    expect(inventoryRowView(held({ daysHeld: 1 }), ZA).held).toBe('Held 1 day');
    expect(inventoryRowView(sold(650_000, [95_000]), DE)).toMatchObject({ held: 'Nach 8 Tagen verkauft', result: { label: 'Realisierter Gewinn' } });
    expect(dayShortcuts(NOW, DE.t).map((s) => s.label)).toEqual(['Heute', 'Gestern']);
    expect(inventoryFilters(DE.t).map((f) => f.label)).toEqual(['Im Bestand', 'Verkauft', 'Alle']);
    expect(soldWhereOptions(DE.t).map((o) => o.label)).toEqual(['eBay', 'Facebook Marketplace', 'Woanders']);
    expect(inventoryEmptyText('sold', DE.t).title).toBe('Noch nichts verkauft');
    // The English constants stay as they were until the apps switch (step 89).
    expect(INVENTORY_FILTERS.map((f) => f.label)).toEqual(['Holding', 'Sold', 'All']);
  });

  it('validation and Sale Result; an estimate is never called profit', () => {
    const f = purchaseFormDefaults(held());
    expect(buildPurchaseUpdate({ ...f, title: ' ' }, held(), NOW, DE.t)).toMatchObject({ ok: false, errors: { title: 'Gib ihm einen Namen' } });
    const view = saleResultView(sold(650_000, [65_000, 10_000, 20_000]), DE)!;
    expect(view.headline).toBe('Realisierter Gewinn');
    expect(view.summary).toBe('12 % Marge · 16 % Rendite auf die Kosten · nach 8 Tagen verkauft');
    expect(view.comparisons.map((c) => c.expectedLabel)).toEqual(['Angebot', 'Geschätzt', 'Geschätztes Potenzial']);
    expect(inventoryDetailView(held(), DE).expectedLines.map(([k]) => k).filter((k) => /Geschätzt/.test(k)).every((k) => !/Gewinn/.test(k))).toBe(true);
  });
});

describe('form defaults hydrate safely', () => {
  it('initial cost rows have the same keys every time (server render = browser render)', () => {
    const keys = () => saleFormDefaults(held(), ZA, NOW).costs.map((c) => c.key);
    expect(keys()).toEqual(keys());
    expect(purchaseFormDefaults(held()).costs.map((c) => c.key)).toEqual(['purchase-0', 'purchase-1']);
    // Rows added later never collide with them.
    expect(newCostDraft('OTHER').key).toMatch(/^added-/);
  });
});

describe('edit purchase', () => {
  it('sends only what changed', () => {
    const item = held();
    const f = purchaseFormDefaults(item);
    expect(buildPurchaseUpdate(f, item, NOW)).toEqual({ ok: true, update: null, costs: null });
    expect(buildPurchaseUpdate({ ...f, price: '3800', notes: ' Haggled ' }, item, NOW)).toEqual({
      ok: true,
      update: { purchasePrice: ZAR(380_000), notes: 'Haggled' },
      costs: null,
    });
    const fewer = { ...f, costs: f.costs.slice(0, 1) };
    expect(buildPurchaseUpdate(fewer, item, NOW)).toEqual({ ok: true, update: null, costs: { costs: [{ category: 'TAX', amount: ZAR(60_000) }] } });
  });

  it('validates title, price and date (not in the future, not after the sale)', () => {
    const item = sold(650_000, []);
    const f = purchaseFormDefaults(item);
    expect(buildPurchaseUpdate({ ...f, title: ' ', price: '0', day: '2026-10-07' }, item, NOW)).toEqual({
      ok: false,
      errors: { title: 'Give it a name', price: 'Enter what you paid', day: "Can't be after the sale date" },
    });
    expect(buildPurchaseUpdate({ ...f, day: '2026-10-09' }, held(), NOW)).toMatchObject({ ok: false, errors: { day: "Can't be in the future" } });
  });
});
