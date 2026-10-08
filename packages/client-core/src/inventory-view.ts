import {
  PURCHASE_COST_CATEGORIES,
  realizedResult,
  SALE_COST_CATEGORIES,
  type InventoryItem,
  type InventoryStatus,
  type MarketplaceKey,
  type Money,
  type RecordSaleRequest,
  type ReplacePurchaseCostsRequest,
  type UpdateInventoryItemRequest,
} from '@rein-drop/contracts';
import { MARKETPLACE_LABEL, type Labelled } from './deal-view.js';
import type { HuntFormContext } from './hunt-form.js';
import { formatMoney, moneyToInput, parseMoneyInput } from './money.js';

/**
 * Inventory, Mark Sold and Sale Result view models, shared by web and mobile.
 *
 * Accounting rules (decision 0007): a result exists only once an item is sold; holding is neither
 * profit nor loss; estimates appear only as labelled comparisons; the success celebration is for
 * a genuine REALIZED profit, never for an estimate.
 */

export type PurchaseCostCategory = (typeof PURCHASE_COST_CATEGORIES)[number];
export type SaleCostCategory = (typeof SALE_COST_CATEGORIES)[number];

export const PURCHASE_COST_LABEL: Record<PurchaseCostCategory, string> = {
  TAX: 'Tax',
  SHIPPING: 'Shipping to you',
  REPAIR: 'Repairs / parts',
  SUPPLIES: 'Cleaning / supplies',
  OTHER: 'Other',
};
export const SALE_COST_LABEL: Record<SaleCostCategory, string> = {
  MARKETPLACE_FEE: 'Marketplace fee',
  PAYMENT_FEE: 'Payment fee',
  SHIPPING: 'Shipping to buyer',
  OTHER: 'Other',
};
// SHIPPING is in both lists, so each side uses its own labels.
const purchaseCostLabel = (category: string) => (PURCHASE_COST_LABEL as Record<string, string>)[category] ?? category;
const saleCostLabel = (category: string) => (SALE_COST_LABEL as Record<string, string>)[category] ?? category;

export const INVENTORY_STATUS_LABEL: Record<InventoryStatus, Labelled> = {
  IN_STOCK: { label: 'In stock', tone: 'neutral' },
  LISTED: { label: 'Listed for sale', tone: 'info' },
  SOLD: { label: 'Sold', tone: 'action' },
  RETURNED: { label: 'Returned', tone: 'neutral' },
  WRITTEN_OFF: { label: 'Written off', tone: 'neutral' },
};

export type InventoryFilter = 'holding' | 'sold' | 'all';
export const INVENTORY_FILTERS: { value: InventoryFilter; label: string }[] = [
  { value: 'holding', label: 'Holding' },
  { value: 'sold', label: 'Sold' },
  { value: 'all', label: 'All' },
];

/** Where it sold: one of the marketplaces, or anywhere else. */
export type SoldWhere = MarketplaceKey | 'other';
export const SOLD_WHERE_OPTIONS: { value: SoldWhere; label: string }[] = [
  { value: 'ebay', label: MARKETPLACE_LABEL.ebay },
  { value: 'facebook', label: MARKETPLACE_LABEL.facebook },
  { value: 'other', label: 'Somewhere else' },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const abs = (m: Money): Money => ({ ...m, amountMinor: Math.abs(m.amountMinor) });
const toneOf = (amountMinor: number) => (amountMinor > 0 ? 'profit' : amountMinor < 0 ? 'loss' : 'neutral') as 'profit' | 'loss' | 'neutral';
const sum = (list: Money[]) => list.reduce((s, m) => s + m.amountMinor, 0);

// ---------------------------------------------------------------------------
// Calendar days (YYYY-MM-DD in the device's time zone)
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
/** The calendar day of an instant, in the device's time zone. */
export function localDay(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function isValidDay(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** "Today" / "Yesterday" shortcuts for date fields. */
export function dayShortcuts(now: Date): { label: string; value: string }[] {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return [
    { label: 'Today', value: localDay(now) },
    { label: 'Yesterday', value: localDay(yesterday) },
  ];
}

/**
 * The instant stored for a chosen day: the original instant if the day didn't change, now for
 * today, otherwise local noon (a calendar day is all the person told us).
 */
function instantFor(day: string, now: Date, original?: Date): Date {
  if (original && localDay(original) === day) return original;
  if (day === localDay(now)) return now;
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0);
}

const dayText = (iso: string, ctx: HuntFormContext) => {
  try {
    return new Intl.DateTimeFormat(ctx.localeTag, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
};

// ---------------------------------------------------------------------------
// Cost rows (purchase or selling costs)
// ---------------------------------------------------------------------------

export interface CostDraft<C extends string = string> {
  /** Stable row key for lists. */
  key: string;
  category: C;
  amount: string;
  note: string;
}

let draftSeq = 0;
/**
 * A row the person adds. Form defaults use `initialCostDrafts` instead: their keys must be the
 * same on the server and in the browser (server-rendered forms hydrate against them).
 */
export function newCostDraft<C extends string>(category: C, amount = '', note = ''): CostDraft<C> {
  draftSeq += 1;
  return { key: `added-${draftSeq}`, category, amount, note };
}

/** Rows for a form's initial state, with deterministic keys. */
function initialCostDrafts<C extends string>(prefix: string, rows: { category: C; amount?: string; note?: string }[]): CostDraft<C>[] {
  return rows.map((r, i) => ({ key: `${prefix}-${i}`, category: r.category, amount: r.amount ?? '', note: r.note ?? '' }));
}

type ParsedCosts<C extends string> =
  | { ok: true; costs: { category: C; amount: Money; note?: string }[] }
  | { ok: false; errors: Record<string, string> };

/** Rows with an empty amount are skipped; zero / negative / unreadable amounts are errors. */
export function parseCostDrafts<C extends string>(drafts: readonly CostDraft<C>[], currency: string): ParsedCosts<C> {
  const errors: Record<string, string> = {};
  const costs: { category: C; amount: Money; note?: string }[] = [];
  for (const d of drafts) {
    const parsed = parseMoneyInput(d.amount, currency);
    if (!parsed.ok) errors[d.key] = parsed.message;
    else if (!parsed.money) continue;
    else if (parsed.money.amountMinor <= 0) errors[d.key] = 'Must be more than zero';
    else costs.push({ category: d.category, amount: parsed.money, ...(d.note.trim() ? { note: d.note.trim().slice(0, 200) } : {}) });
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, costs };
}

// ---------------------------------------------------------------------------
// Inventory list row
// ---------------------------------------------------------------------------

export interface InventoryRowView {
  id: string;
  title: string;
  status: Labelled;
  source: string | null;
  /** "Cost R 4 750,00" (price + purchase costs). */
  cost: string;
  /** "Held 12 days" / "Sold after 8 days". */
  held: string;
  /** Realized result once sold; null while holding (holding is not a loss). */
  result: { label: string; value: string; tone: 'profit' | 'loss' | 'neutral' } | null;
  /** Holding only: the estimate at purchase, clearly labelled. */
  estimate: string | null;
  /** Where the primary action goes. */
  action: { label: string; kind: 'sell' | 'result' };
}

const costText = (item: InventoryItem, fmt: (m: Money) => string) =>
  item.purchase.total ? fmt(item.purchase.total) : `${fmt(item.purchase.price)} + costs`;

export function inventoryRowView(item: InventoryItem, ctx: HuntFormContext): InventoryRowView {
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const sold = item.sale !== null;
  let result: InventoryRowView['result'] = null;
  if (item.result?.status === 'ok') {
    const p = item.result.realizedProfit.amountMinor;
    result = { label: p < 0 ? 'Realized loss' : 'Realized profit', value: fmt(item.result.realizedProfit), tone: toneOf(p) };
  } else if (item.result) {
    result = { label: 'Result', value: 'Not calculated', tone: 'neutral' };
  }
  return {
    id: item.id,
    title: item.title,
    status: INVENTORY_STATUS_LABEL[item.status],
    source: item.source ? MARKETPLACE_LABEL[item.source.marketplace] : null,
    cost: `Cost ${costText(item, fmt)}`,
    held: sold ? `Sold after ${plural(item.daysHeld, 'day')}` : `Held ${plural(item.daysHeld, 'day')}`,
    result,
    estimate: !sold && item.expected?.estimatedResale ? `Estimated resale ${fmt(item.expected.estimatedResale)} (estimate)` : null,
    action: sold ? { label: 'Sale result', kind: 'result' } : { label: 'Mark sold', kind: 'sell' },
  };
}

export function inventoryEmptyText(filter: InventoryFilter): { title: string; body: string } {
  if (filter === 'sold') return { title: 'Nothing sold yet', body: 'When you sell something you bought, mark it sold to see your realized profit.' };
  return {
    title: 'No inventory yet',
    body: 'Mark a deal as Bought and it lands here, so you can track what it cost and what it sells for.',
  };
}

// ---------------------------------------------------------------------------
// Inventory detail
// ---------------------------------------------------------------------------

export interface InventoryDetailView extends InventoryRowView {
  purchasedOn: string;
  /** Price and every purchase cost, then the total. */
  purchaseLines: [string, string][];
  /** What Rein Drop expected when you bought it (estimates labelled). Empty when nothing was captured. */
  expectedLines: [string, string][];
  notes: string | null;
  dealId: string | null;
  sourceUrl: string | null;
  holding: boolean;
}

export function inventoryDetailView(item: InventoryItem, ctx: HuntFormContext): InventoryDetailView {
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const purchaseLines: [string, string][] = [['Price paid', fmt(item.purchase.price)]];
  for (const c of item.purchase.costs) purchaseLines.push([c.note ? `${purchaseCostLabel(c.category)} (${c.note})` : purchaseCostLabel(c.category), fmt(c.amount)]);
  if (item.purchase.costs.length > 0) purchaseLines.push(['Total cost', item.purchase.total ? fmt(item.purchase.total) : 'Mixed currencies']);

  const e = item.expected;
  const expectedLines: [string, string][] = [];
  if (e?.askingPrice) expectedLines.push(['Asking price', fmt(e.askingPrice)]);
  if (e?.knownCosts) expectedLines.push(['Costs the listing showed', fmt(e.knownCosts)]);
  if (e?.estimatedResale) expectedLines.push(['Estimated resale (estimate)', fmt(e.estimatedResale)]);
  if (e?.estimatedUpside) expectedLines.push(['Estimated upside (estimate)', fmt(e.estimatedUpside)]);

  return {
    ...inventoryRowView(item, ctx),
    purchasedOn: `Bought ${dayText(item.purchase.purchasedAt, ctx)}`,
    purchaseLines,
    expectedLines,
    notes: item.notes,
    dealId: item.dealId,
    sourceUrl: item.source?.url ?? null,
    holding: item.holding,
  };
}

// ---------------------------------------------------------------------------
// Edit purchase
// ---------------------------------------------------------------------------

export interface PurchaseForm {
  title: string;
  price: string;
  day: string;
  notes: string;
  costs: CostDraft<PurchaseCostCategory>[];
}

export function purchaseFormDefaults(item: InventoryItem): PurchaseForm {
  return {
    title: item.title,
    price: moneyToInput(item.purchase.price),
    day: localDay(new Date(item.purchase.purchasedAt)),
    notes: item.notes ?? '',
    costs: initialCostDrafts(
      'purchase',
      item.purchase.costs.map((c) => ({ category: c.category as PurchaseCostCategory, amount: moneyToInput(c.amount), note: c.note ?? '' })),
    ),
  };
}

export type PurchaseFormErrors = Partial<Record<'title' | 'price' | 'day', string>> & { costs?: Record<string, string> };

/** Only what changed: an item update and/or the full purchase-cost list. */
export function buildPurchaseUpdate(
  form: PurchaseForm,
  item: InventoryItem,
  now: Date,
): { ok: true; update: UpdateInventoryItemRequest | null; costs: ReplacePurchaseCostsRequest | null } | { ok: false; errors: PurchaseFormErrors } {
  const errors: PurchaseFormErrors = {};
  const currency = item.purchase.price.currency;
  const title = form.title.trim();
  if (!title) errors.title = 'Give it a name';
  const price = parseMoneyInput(form.price, currency);
  if (!price.ok) errors.price = price.message;
  else if (!price.money || price.money.amountMinor <= 0) errors.price = 'Enter what you paid';
  const day = form.day.trim();
  if (!isValidDay(day)) errors.day = 'Use a date like 2026-10-08';
  else if (day > localDay(now)) errors.day = "Can't be in the future";
  else if (item.sale && day > localDay(new Date(item.sale.soldAt))) errors.day = "Can't be after the sale date";
  const costs = parseCostDrafts(form.costs, currency);
  if (!costs.ok) errors.costs = costs.errors;
  if (Object.keys(errors).length > 0 || !costs.ok || !price.ok || !price.money) return { ok: false, errors };

  const original = new Date(item.purchase.purchasedAt);
  let purchasedAt = instantFor(day, now, original);
  if (item.sale && day === localDay(new Date(item.sale.soldAt)) && purchasedAt > new Date(item.sale.soldAt)) purchasedAt = new Date(item.sale.soldAt);
  const notes = form.notes.trim() || null;
  const update: UpdateInventoryItemRequest = {};
  if (title !== item.title) update.title = title;
  if (price.money.amountMinor !== item.purchase.price.amountMinor) update.purchasePrice = price.money;
  if (purchasedAt.getTime() !== original.getTime()) update.purchasedAt = purchasedAt.toISOString();
  if (notes !== item.notes) update.notes = notes;

  const before = item.purchase.costs.map((c) => `${c.category}:${c.amount.amountMinor}:${c.note ?? ''}`).join('|');
  const after = costs.costs.map((c) => `${c.category}:${c.amount.amountMinor}:${c.note ?? ''}`).join('|');
  return {
    ok: true,
    update: Object.keys(update).length > 0 ? update : null,
    costs: before !== after ? { costs: costs.costs } : null,
  };
}

// ---------------------------------------------------------------------------
// Mark Sold
// ---------------------------------------------------------------------------

export interface SaleForm {
  price: string;
  currency: string;
  day: string;
  where: SoldWhere;
  costs: CostDraft<SaleCostCategory>[];
}

export interface SaleFormDefaults extends SaleForm {
  /** Editing an existing sale rather than recording a new one. */
  correcting: boolean;
  /** "Rein Drop estimated about R 6 000 when you bought it" - a hint, never pre-filled as the price. */
  estimateHint: string | null;
}

/**
 * Defaults from what is known (the existing sale, else the source marketplace, today, the
 * purchase currency, the usual fee rows). The sale price is never pre-filled from an estimate.
 */
export function saleFormDefaults(item: InventoryItem, ctx: HuntFormContext, now: Date): SaleFormDefaults {
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const sale = item.sale;
  return {
    correcting: sale !== null,
    price: sale ? moneyToInput(sale.price) : '',
    currency: sale?.price.currency ?? item.purchase.price.currency,
    day: localDay(sale ? new Date(sale.soldAt) : now),
    where: sale ? (sale.marketplace ?? 'other') : (item.source?.marketplace ?? 'other'),
    costs: sale
      ? initialCostDrafts(
          'sale',
          sale.costs.map((c) => ({ category: c.category as SaleCostCategory, amount: moneyToInput(c.amount), note: c.note ?? '' })),
        )
      : initialCostDrafts<SaleCostCategory>('sale', [{ category: 'MARKETPLACE_FEE' }, { category: 'PAYMENT_FEE' }, { category: 'SHIPPING' }]),
    estimateHint: item.expected?.estimatedResale ? `Rein Drop estimated about ${fmt(item.expected.estimatedResale)} when you bought it.` : null,
  };
}

export type SaleFormErrors = Partial<Record<'price' | 'day', string>> & { costs?: Record<string, string> };

export function buildSaleRequest(
  form: SaleForm,
  item: InventoryItem,
  now: Date,
): { ok: true; request: RecordSaleRequest } | { ok: false; errors: SaleFormErrors } {
  const errors: SaleFormErrors = {};
  const price = parseMoneyInput(form.price, form.currency);
  if (!price.ok) errors.price = price.message;
  else if (!price.money || price.money.amountMinor <= 0) errors.price = 'Enter what it sold for';
  const day = form.day.trim();
  const purchasedAt = new Date(item.purchase.purchasedAt);
  if (!isValidDay(day)) errors.day = 'Use a date like 2026-10-08';
  else if (day > localDay(now)) errors.day = "Can't be in the future";
  else if (day < localDay(purchasedAt)) errors.day = "Can't be before you bought it";
  const costs = parseCostDrafts(form.costs, form.currency);
  if (!costs.ok) errors.costs = costs.errors;
  if (Object.keys(errors).length > 0 || !costs.ok || !price.ok || !price.money) return { ok: false, errors };

  const original = item.sale ? new Date(item.sale.soldAt) : undefined;
  let soldAt = instantFor(day, now, original);
  if (soldAt < purchasedAt) soldAt = purchasedAt; // same day as the purchase
  return {
    ok: true,
    request: { price: price.money, soldAt: soldAt.toISOString(), marketplace: form.where === 'other' ? null : form.where, costs: costs.costs },
  };
}

export interface SalePreview {
  /** Null until a sale price is entered. */
  profit: { label: string; value: string; tone: 'profit' | 'loss' | 'neutral' } | null;
  lines: [string, string][];
  note: string | null;
}

/** Live "what you'll make" preview while filling Mark Sold. Invalid rows are left out. */
export function salePreview(form: SaleForm, item: InventoryItem, ctx: HuntFormContext): SalePreview {
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const price = parseMoneyInput(form.price, form.currency);
  const saleCosts = form.costs.flatMap((d) => {
    const p = parseMoneyInput(d.amount, form.currency);
    return p.ok && p.money && p.money.amountMinor > 0 ? [p.money] : [];
  });
  const costBasis = item.purchase.total;
  if (!price.ok || !price.money || price.money.amountMinor <= 0) {
    return { profit: null, lines: costBasis ? [['What it cost you', fmt(costBasis)]] : [], note: 'Enter the sale price to see your profit.' };
  }
  const result = realizedResult({
    purchasePrice: item.purchase.price,
    purchaseCosts: item.purchase.costs.map((c) => c.amount),
    salePrice: price.money,
    saleCosts,
  });
  if (result.status !== 'ok') {
    return { profit: null, lines: [], note: `The purchase was in ${item.purchase.price.currency}, so profit can't be calculated without converting (Rein Drop never converts).` };
  }
  const p = result.realizedProfit.amountMinor;
  return {
    profit: { label: p < 0 ? 'You would lose' : 'You would make', value: fmt(abs(result.realizedProfit)), tone: toneOf(p) },
    lines: [
      ['Sale price', fmt(price.money)],
      ['Selling costs', saleCosts.length > 0 ? `− ${fmt({ amountMinor: sum(saleCosts), currency: form.currency })}` : 'None'],
      ['What it cost you', `− ${fmt(result.costBasis)}`],
    ],
    note: null,
  };
}

// ---------------------------------------------------------------------------
// Sale Result
// ---------------------------------------------------------------------------

export interface ComparisonRow {
  label: string;
  expectedLabel: string;
  expected: string;
  actual: string;
  /** "+ R 500,00" / "− R 200,00"; null when not comparable. */
  difference: string | null;
  tone: 'profit' | 'loss' | 'neutral';
}

export interface SaleResultView {
  title: string;
  /** "Realized profit" / "Realized loss" / "Broke even" / "Sold". */
  headline: string;
  value: string;
  tone: 'profit' | 'loss' | 'neutral';
  /**
   * True only for a genuine realized profit - the only case where the success / profit mascot may
   * appear (Mascot Usage Guide: "money was actually made"). Never for an estimate.
   */
  celebrate: boolean;
  /** "12% margin · 16% return on cost · sold after 8 days". */
  summary: string | null;
  breakdown: [string, string][];
  comparisons: ComparisonRow[];
  comparisonNote: string;
  insight: string;
}

// A no-break space keeps the sign on the same line as the amount.
const signed = (m: Money, fmt: (m: Money) => string) => `${m.amountMinor > 0 ? '+ ' : m.amountMinor < 0 ? '− ' : ''}${fmt(abs(m))}`;

/** Sale Result for a sold item. Returns null while it is still held. */
export function saleResultView(item: InventoryItem, ctx: HuntFormContext): SaleResultView | null {
  const sale = item.sale;
  if (!sale || !item.result) return null;
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const r = item.result;
  const held = `sold after ${plural(item.daysHeld, 'day')}`;

  const saleCosts = sale.costs.map((c) => c.amount);
  const breakdown: [string, string][] = [['Sale price', fmt(sale.price)]];
  for (const c of sale.costs) breakdown.push([saleCostLabel(c.category), `− ${fmt(c.amount)}`]);
  breakdown.push(['Price paid', `− ${fmt(item.purchase.price)}`]);
  for (const c of item.purchase.costs) breakdown.push([purchaseCostLabel(c.category), `− ${fmt(c.amount)}`]);

  const comparisons: ComparisonRow[] = [];
  const cmp = item.comparison;
  const row = (label: string, expectedLabel: string, c: InventoryItem['comparison']['purchasePrice'], higherIsGood: boolean) => {
    if (!c.expected || !c.actual) return;
    const d = c.difference;
    comparisons.push({
      label,
      expectedLabel,
      expected: fmt(c.expected),
      actual: fmt(c.actual),
      difference: d ? signed(d, fmt) : null,
      tone: d && d.amountMinor !== 0 ? (d.amountMinor > 0 === higherIsGood ? 'profit' : 'loss') : 'neutral',
    });
  };
  row('Buy price', 'Asking', cmp.purchasePrice, false);
  row('Sale price', 'Estimated', cmp.salePrice, true);
  row('Profit', 'Estimated upside', cmp.profit, true);
  const hadEstimate = cmp.salePrice.expected !== null || cmp.profit.expected !== null;
  const comparisonNote = hadEstimate
    ? "Estimates were made before you bought and didn't include selling fees. A gap is a comparison, not a loss."
    : 'Rein Drop had no resale estimate for this item, so only the buy price can be compared.';

  if (r.status !== 'ok') {
    return {
      title: item.title,
      headline: 'Sold',
      value: fmt(sale.price),
      tone: 'neutral',
      celebrate: false,
      summary: held,
      breakdown,
      comparisons,
      comparisonNote,
      insight: `It sold in ${sale.price.currency} but was bought in ${item.purchase.price.currency}, so profit isn't calculated - Rein Drop never converts currencies.`,
    };
  }

  const p = r.realizedProfit.amountMinor;
  const pct = [r.marginPercent !== null ? `${r.marginPercent}% margin` : null, r.returnPercent !== null ? `${r.returnPercent}% return on cost` : null, held].filter(Boolean).join(' · ');

  let insight: string;
  const grossBeforeFees = sale.price.amountMinor - r.costBasis.amountMinor;
  if (p < 0 && grossBeforeFees >= 0 && saleCosts.length > 0) {
    insight = `Selling costs of ${fmt({ amountMinor: sum(saleCosts), currency: sale.price.currency })} turned this into a loss. Check fees before pricing the next one.`;
  } else if (p < 0) {
    const fees = sum(saleCosts);
    const short = fmt({ amountMinor: Math.abs(grossBeforeFees), currency: sale.price.currency });
    insight =
      fees > 0
        ? `It sold for ${short} less than it cost you, and selling costs of ${fmt({ amountMinor: fees, currency: sale.price.currency })} added to the loss.`
        : `It sold for ${short} less than it cost you.`;
  } else if (cmp.salePrice.difference && cmp.salePrice.difference.amountMinor > 0) {
    insight = `It sold for ${fmt(cmp.salePrice.difference)} more than Rein Drop estimated.`;
  } else if (cmp.profit.difference && cmp.profit.difference.amountMinor < 0) {
    insight = `You made ${fmt(r.realizedProfit)}, ${fmt(abs(cmp.profit.difference))} under the estimate - a comparison, not a loss.`;
  } else if (p === 0) {
    insight = 'You got your money back, with nothing left over after costs.';
  } else {
    insight = `You made ${fmt(r.realizedProfit)} in ${plural(item.daysHeld, 'day')}.`;
  }

  return {
    title: item.title,
    headline: p > 0 ? 'Realized profit' : p < 0 ? 'Realized loss' : 'Broke even',
    value: p < 0 ? signed(r.realizedProfit, fmt) : fmt(r.realizedProfit),
    tone: toneOf(p),
    celebrate: p > 0,
    summary: pct,
    breakdown,
    comparisons,
    comparisonNote,
    insight,
  };
}
