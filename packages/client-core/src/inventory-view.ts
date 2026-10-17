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
import { translator, type MessageKey, type Translator } from '@rein-drop/i18n';
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
const PURCHASE_COST_KEY: Record<PurchaseCostCategory, MessageKey> = {
  TAX: 'inventory.purchaseCostTax',
  SHIPPING: 'inventory.purchaseCostShipping',
  REPAIR: 'inventory.purchaseCostRepair',
  SUPPLIES: 'inventory.purchaseCostSupplies',
  OTHER: 'inventory.purchaseCostOther',
};
const SALE_COST_KEY: Record<SaleCostCategory, MessageKey> = {
  MARKETPLACE_FEE: 'inventory.saleCostMarketplaceFee',
  PAYMENT_FEE: 'inventory.saleCostPaymentFee',
  SHIPPING: 'inventory.saleCostShipping',
  OTHER: 'inventory.saleCostOther',
};
/** Purchase cost labels in the UI language. Use this; the English PURCHASE_COST_LABEL will be removed in step 89. */
export function purchaseCostLabels(t: Translator): Record<PurchaseCostCategory, string> {
  return mapKeys(PURCHASE_COST_KEY, t);
}
/** Selling cost labels in the UI language. Use this; the English SALE_COST_LABEL will be removed in step 89. */
export function saleCostLabels(t: Translator): Record<SaleCostCategory, string> {
  return mapKeys(SALE_COST_KEY, t);
}
function mapKeys<K extends string>(keys: Record<K, MessageKey>, t: Translator): Record<K, string> {
  return Object.fromEntries(Object.entries(keys).map(([k, key]) => [k, t(key as MessageKey)])) as Record<K, string>;
}
// SHIPPING is in both lists, so each side uses its own labels.
const purchaseCostLabel = (category: string, t: Translator) => {
  const key = (PURCHASE_COST_KEY as Record<string, MessageKey | undefined>)[category];
  return key ? t(key) : category;
};
const saleCostLabel = (category: string, t: Translator) => {
  const key = (SALE_COST_KEY as Record<string, MessageKey | undefined>)[category];
  return key ? t(key) : category;
};

export const INVENTORY_STATUS_LABEL: Record<InventoryStatus, Labelled> = {
  IN_STOCK: { label: 'In stock', tone: 'neutral' },
  LISTED: { label: 'Listed for sale', tone: 'info' },
  SOLD: { label: 'Sold', tone: 'action' },
  RETURNED: { label: 'Returned', tone: 'neutral' },
  WRITTEN_OFF: { label: 'Written off', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
const STATUS_KEY: Record<InventoryStatus, MessageKey> = {
  IN_STOCK: 'inventory.statusInStock',
  LISTED: 'inventory.statusListed',
  SOLD: 'inventory.statusSold',
  RETURNED: 'inventory.statusReturned',
  WRITTEN_OFF: 'inventory.statusWrittenOff',
  CANCELLED: 'inventory.statusCancelled',
};
/** Item status badge in the UI language (same tones). Use this; the English INVENTORY_STATUS_LABEL will be removed in step 89. */
export function inventoryStatusLabel(status: InventoryStatus, t: Translator): Labelled {
  return { label: t(STATUS_KEY[status]), tone: INVENTORY_STATUS_LABEL[status].tone };
}

export type InventoryFilter = 'holding' | 'sold' | 'all';
export const INVENTORY_FILTERS: { value: InventoryFilter; label: string }[] = [
  { value: 'holding', label: 'Holding' },
  { value: 'sold', label: 'Sold' },
  { value: 'all', label: 'All' },
];
/** List filters in the UI language. Use this; the English INVENTORY_FILTERS will be removed in step 89. */
export function inventoryFilters(t: Translator): { value: InventoryFilter; label: string }[] {
  return [
    { value: 'holding', label: t('inventory.filterHolding') },
    { value: 'sold', label: t('inventory.filterSold') },
    { value: 'all', label: t('inventory.filterAll') },
  ];
}

/** Where it sold: one of the marketplaces, or anywhere else. */
export type SoldWhere = MarketplaceKey | 'other';
export const SOLD_WHERE_OPTIONS: { value: SoldWhere; label: string }[] = [
  { value: 'ebay', label: MARKETPLACE_LABEL.ebay },
  { value: 'facebook', label: MARKETPLACE_LABEL.facebook },
  { value: 'other', label: 'Somewhere else' },
];
/** "Where did it sell?" options in the UI language (marketplace names untranslated). Use this; SOLD_WHERE_OPTIONS will be removed in step 89. */
export function soldWhereOptions(t: Translator): { value: SoldWhere; label: string }[] {
  return [
    { value: 'ebay', label: MARKETPLACE_LABEL.ebay },
    { value: 'facebook', label: MARKETPLACE_LABEL.facebook },
    { value: 'other', label: t('inventory.soldWhereOther') },
  ];
}

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
export function dayShortcuts(now: Date, t: Translator = translator('en')): { label: string; value: string }[] {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return [
    { label: t('inventory.today'), value: localDay(now) },
    { label: t('inventory.yesterday'), value: localDay(yesterday) },
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
export function parseCostDrafts<C extends string>(drafts: readonly CostDraft<C>[], currency: string, t: Translator = translator('en')): ParsedCosts<C> {
  const errors: Record<string, string> = {};
  const costs: { category: C; amount: Money; note?: string }[] = [];
  for (const d of drafts) {
    const parsed = parseMoneyInput(d.amount, currency);
    if (!parsed.ok) errors[d.key] = parsed.message;
    else if (!parsed.money) continue;
    else if (parsed.money.amountMinor <= 0) errors[d.key] = t('inventory.errorMoreThanZero');
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
  /** Where it was bought (key for its logo), when sourced through Rein Drop. */
  marketplace: MarketplaceKey | null;
  source: string | null;
  /** "Cost R 4 750,00" (price + purchase costs). */
  cost: string;
  /** "Held 12 days" / "Sold after 8 days". */
  held: string;
  /**
   * Realized result once sold - or once returned / written off (closure.result); null while holding
   * (holding is not a loss) and for a cancelled purchase (left out of every figure).
   */
  result: { label: string; value: string; tone: 'profit' | 'loss' | 'neutral' } | null;
  /** Holding only: the estimate at purchase, clearly labelled. */
  estimate: string | null;
  /**
   * Where the primary action goes: sell = Mark sold form; result = Sale result; details = the item
   * page (returned / written off / cancelled items have no sale to show).
   */
  action: { label: string; kind: 'sell' | 'result' | 'details' };
}

const costText = (item: InventoryItem, fmt: (m: Money) => string, t: Translator) =>
  item.purchase.total ? fmt(item.purchase.total) : t('inventory.costPlusExtras', { price: fmt(item.purchase.price) });

export function inventoryRowView(item: InventoryItem, ctx: HuntFormContext): InventoryRowView {
  const { t } = ctx;
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const sold = item.sale !== null;
  let result: InventoryRowView['result'] = null;
  if (item.result?.status === 'ok') {
    const p = item.result.realizedProfit.amountMinor;
    result = { label: t(p < 0 ? 'inventory.realizedLoss' : 'inventory.realizedProfit'), value: fmt(item.result.realizedProfit), tone: toneOf(p) };
  } else if (item.result) {
    result = { label: t('inventory.result'), value: t('inventory.notCalculated'), tone: 'neutral' };
  } else if (item.closure?.result?.status === 'ok') {
    const p = item.closure.result.realizedProfit.amountMinor;
    result = { label: t(p < 0 ? 'inventory.realizedLoss' : 'inventory.realizedProfit'), value: fmt(item.closure.result.realizedProfit), tone: toneOf(p) };
  } else if (item.closure?.result) {
    result = { label: t('inventory.result'), value: t('inventory.notCalculated'), tone: 'neutral' };
  }
  const closed = item.closure !== null;
  return {
    id: item.id,
    title: item.title,
    status: inventoryStatusLabel(item.status, t),
    marketplace: item.source?.marketplace ?? null,
    source: item.source ? MARKETPLACE_LABEL[item.source.marketplace] : null,
    cost: t('inventory.rowCost', { cost: costText(item, fmt, t) }),
    held: t(sold ? 'inventory.rowSoldAfter' : 'inventory.rowHeld', { days: item.daysHeld }),
    result,
    estimate: item.holding && item.expected?.estimatedResale ? t('inventory.rowEstimate', { amount: fmt(item.expected.estimatedResale) }) : null,
    action: sold
      ? { label: t('inventory.actionSaleResult'), kind: 'result' }
      : closed || !item.actions.includes('mark_sold')
        ? { label: t('inventory.actionDetails'), kind: 'details' }
        : { label: t('inventory.actionMarkSold'), kind: 'sell' },
  };
}

export function inventoryEmptyText(filter: InventoryFilter, t: Translator = translator('en')): { title: string; body: string } {
  if (filter === 'sold') return { title: t('inventory.emptySoldTitle'), body: t('inventory.emptySoldBody') };
  return { title: t('inventory.emptyTitle'), body: t('inventory.emptyBody') };
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
  const { t } = ctx;
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const purchaseLines: [string, string][] = [[t('inventory.pricePaid'), fmt(item.purchase.price)]];
  for (const c of item.purchase.costs) {
    const label = purchaseCostLabel(c.category, t);
    purchaseLines.push([c.note ? t('inventory.costWithNote', { label, note: c.note }) : label, fmt(c.amount)]);
  }
  if (item.purchase.costs.length > 0) purchaseLines.push([t('inventory.totalCost'), item.purchase.total ? fmt(item.purchase.total) : t('inventory.mixedCurrencies')]);

  const e = item.expected;
  const expectedLines: [string, string][] = [];
  if (e?.askingPrice) expectedLines.push([t('inventory.askingPrice'), fmt(e.askingPrice)]);
  if (e?.knownCosts) expectedLines.push([t('inventory.listingCosts'), fmt(e.knownCosts)]);
  if (e?.estimatedResale) expectedLines.push([t('inventory.estimatedResaleLine'), fmt(e.estimatedResale)]);
  if (e?.estimatedUpside) expectedLines.push([t('inventory.estimatedUpsideLine'), fmt(e.estimatedUpside)]);

  return {
    ...inventoryRowView(item, ctx),
    purchasedOn: t('inventory.boughtOn', { date: dayText(item.purchase.purchasedAt, ctx) }),
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
  t: Translator = translator('en'),
): { ok: true; update: UpdateInventoryItemRequest | null; costs: ReplacePurchaseCostsRequest | null } | { ok: false; errors: PurchaseFormErrors } {
  const errors: PurchaseFormErrors = {};
  const currency = item.purchase.price.currency;
  const title = form.title.trim();
  if (!title) errors.title = t('inventory.errorName');
  const price = parseMoneyInput(form.price, currency);
  if (!price.ok) errors.price = price.message;
  else if (!price.money || price.money.amountMinor <= 0) errors.price = t('inventory.errorPricePaid');
  const day = form.day.trim();
  if (!isValidDay(day)) errors.day = t('inventory.errorDateFormat');
  else if (day > localDay(now)) errors.day = t('inventory.errorFuture');
  else if (item.sale && day > localDay(new Date(item.sale.soldAt))) errors.day = t('inventory.errorAfterSale');
  const costs = parseCostDrafts(form.costs, currency, t);
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
    estimateHint: item.expected?.estimatedResale ? ctx.t('inventory.estimateHint', { amount: fmt(item.expected.estimatedResale) }) : null,
  };
}

export type SaleFormErrors = Partial<Record<'price' | 'day', string>> & { costs?: Record<string, string> };

export function buildSaleRequest(
  form: SaleForm,
  item: InventoryItem,
  now: Date,
  t: Translator = translator('en'),
): { ok: true; request: RecordSaleRequest } | { ok: false; errors: SaleFormErrors } {
  const errors: SaleFormErrors = {};
  const price = parseMoneyInput(form.price, form.currency);
  if (!price.ok) errors.price = price.message;
  else if (!price.money || price.money.amountMinor <= 0) errors.price = t('inventory.errorSalePrice');
  const day = form.day.trim();
  const purchasedAt = new Date(item.purchase.purchasedAt);
  if (!isValidDay(day)) errors.day = t('inventory.errorDateFormat');
  else if (day > localDay(now)) errors.day = t('inventory.errorFuture');
  else if (day < localDay(purchasedAt)) errors.day = t('inventory.errorBeforePurchase');
  const costs = parseCostDrafts(form.costs, form.currency, t);
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
  const { t } = ctx;
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const price = parseMoneyInput(form.price, form.currency);
  const saleCosts = form.costs.flatMap((d) => {
    const p = parseMoneyInput(d.amount, form.currency);
    return p.ok && p.money && p.money.amountMinor > 0 ? [p.money] : [];
  });
  const costBasis = item.purchase.total;
  if (!price.ok || !price.money || price.money.amountMinor <= 0) {
    return { profit: null, lines: costBasis ? [[t('inventory.whatItCost'), fmt(costBasis)]] : [], note: t('inventory.previewEnterPrice') };
  }
  const result = realizedResult({
    purchasePrice: item.purchase.price,
    purchaseCosts: item.purchase.costs.map((c) => c.amount),
    salePrice: price.money,
    saleCosts,
  });
  if (result.status !== 'ok') {
    return { profit: null, lines: [], note: t('inventory.previewCurrencyMismatch', { currency: item.purchase.price.currency }) };
  }
  const p = result.realizedProfit.amountMinor;
  return {
    profit: { label: t(p < 0 ? 'inventory.youWouldLose' : 'inventory.youWouldMake'), value: fmt(abs(result.realizedProfit)), tone: toneOf(p) },
    lines: [
      [t('inventory.salePrice'), fmt(price.money)],
      [t('inventory.sellingCosts'), saleCosts.length > 0 ? `− ${fmt({ amountMinor: sum(saleCosts), currency: form.currency })}` : t('inventory.none')],
      [t('inventory.whatItCost'), `− ${fmt(result.costBasis)}`],
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
  const { t } = ctx;
  const held = t('inventory.summarySoldAfter', { days: item.daysHeld });

  const saleCosts = sale.costs.map((c) => c.amount);
  const breakdown: [string, string][] = [[t('inventory.salePrice'), fmt(sale.price)]];
  for (const c of sale.costs) breakdown.push([saleCostLabel(c.category, t), `− ${fmt(c.amount)}`]);
  breakdown.push([t('inventory.pricePaid'), `− ${fmt(item.purchase.price)}`]);
  for (const c of item.purchase.costs) breakdown.push([purchaseCostLabel(c.category, t), `− ${fmt(c.amount)}`]);

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
  row(t('inventory.buyPrice'), t('inventory.expectedAsking'), cmp.purchasePrice, false);
  row(t('inventory.salePrice'), t('inventory.expectedEstimated'), cmp.salePrice, true);
  row(t('inventory.profit'), t('inventory.expectedUpside'), cmp.profit, true);
  const hadEstimate = cmp.salePrice.expected !== null || cmp.profit.expected !== null;
  const comparisonNote = t(hadEstimate ? 'inventory.comparisonNoteEstimate' : 'inventory.comparisonNoteNone');

  if (r.status !== 'ok') {
    return {
      title: item.title,
      headline: t('inventory.headlineSold'),
      value: fmt(sale.price),
      tone: 'neutral',
      celebrate: false,
      summary: held,
      breakdown,
      comparisons,
      comparisonNote,
      insight: t('inventory.insightCurrency', { saleCurrency: sale.price.currency, buyCurrency: item.purchase.price.currency }),
    };
  }

  const p = r.realizedProfit.amountMinor;
  const pct = [
    r.marginPercent !== null ? t('inventory.summaryMargin', { percent: r.marginPercent }) : null,
    r.returnPercent !== null ? t('inventory.summaryReturn', { percent: r.returnPercent }) : null,
    held,
  ]
    .filter(Boolean)
    .join(' · ');

  let insight: string;
  const grossBeforeFees = sale.price.amountMinor - r.costBasis.amountMinor;
  if (p < 0 && grossBeforeFees >= 0 && saleCosts.length > 0) {
    insight = t('inventory.insightFeesCausedLoss', { fees: fmt({ amountMinor: sum(saleCosts), currency: sale.price.currency }) });
  } else if (p < 0) {
    const fees = sum(saleCosts);
    const short = fmt({ amountMinor: Math.abs(grossBeforeFees), currency: sale.price.currency });
    insight =
      fees > 0
        ? t('inventory.insightBelowCostAndFees', { short, fees: fmt({ amountMinor: fees, currency: sale.price.currency }) })
        : t('inventory.insightBelowCost', { short });
  } else if (cmp.salePrice.difference && cmp.salePrice.difference.amountMinor > 0) {
    insight = t('inventory.insightAboveEstimate', { amount: fmt(cmp.salePrice.difference) });
  } else if (cmp.profit.difference && cmp.profit.difference.amountMinor < 0) {
    insight = t('inventory.insightUnderEstimate', { profit: fmt(r.realizedProfit), gap: fmt(abs(cmp.profit.difference)) });
  } else if (p === 0) {
    insight = t('inventory.insightBrokeEven');
  } else {
    insight = t('inventory.insightProfit', { profit: fmt(r.realizedProfit), days: item.daysHeld });
  }

  return {
    title: item.title,
    headline: t(p > 0 ? 'inventory.headlineProfit' : p < 0 ? 'inventory.headlineLoss' : 'inventory.headlineBrokeEven'),
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
