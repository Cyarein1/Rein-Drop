import {
  DELETE_ACCOUNT_CONFIRMATION,
  WRITE_OFF_REASONS,
  type CreateInventoryItemRequest,
  type InventoryAction,
  type InventoryCounts,
  type InventoryEvent,
  type InventoryEventType,
  type InventoryItem,
  type InventorySection,
  type MarketplaceKey,
  type Money,
  type RecordSaleRequest,
  type ReturnItemRequest,
  type SellListing,
  type SellListingView,
  type WriteOffItemRequest,
  type WriteOffReason,
} from '@rein-drop/contracts';
import { translator, type MessageKey, type Translator } from '@rein-drop/i18n';
import { MARKETPLACE_LABEL } from './deal-view.js';
import type { HuntFormContext } from './hunt-form.js';
import {
  isValidDay,
  localDay,
  newCostDraft,
  parseCostDrafts,
  type CostDraft,
  type PurchaseCostCategory,
  type SaleCostCategory,
  type SoldWhere,
} from './inventory-view.js';
import { formatMoney, moneyToInput, parseMoneyInput } from './money.js';

/**
 * Item lifecycle without deleting (decision 0021, step 90) - shared by web and mobile:
 * which actions an item offers (from the API's state machine, `item.actions`), their labels and
 * confirmations, the closure card (returned / written off / cancelled), the item timeline, the
 * Add item / Return / Write off / Sold-from-listing forms, Sell sections and tabs, and the account
 * deletion text. Rules are never re-implemented here: what is allowed comes from the API.
 * Copy rule: "profit" / "loss" only for REALIZED results; estimates stay labelled as estimates.
 */

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const ACTION_KEY: Record<InventoryAction, MessageKey> = {
  edit_purchase: 'inventory.actionEditPurchase',
  mark_listed: 'inventory.actionMarkListed',
  mark_unlisted: 'inventory.actionMarkUnlisted',
  list_for_sale: 'inventory.actionListForSale',
  mark_sold: 'inventory.actionMarkSold',
  correct_sale: 'inventory.actionCorrectSale',
  undo_sale: 'inventory.actionUndoSale',
  return: 'inventory.actionReturn',
  write_off: 'inventory.actionWriteOff',
  cancel: 'inventory.actionCancel',
  reopen: 'inventory.actionReopen',
};

export interface ItemActionView {
  action: InventoryAction;
  label: string;
  /** primary = the main next step; danger = ends the item's normal life (ask first). */
  tone: 'primary' | 'secondary' | 'danger';
  /** Ask before doing it (null = do it straight away / open its form). */
  confirm: { title: string; body: string; confirmLabel: string; cancelLabel: string } | null;
}

/** The primary action per status, if allowed. */
const PRIMARY: InventoryAction[] = ['mark_sold', 'reopen', 'correct_sale'];
const DANGER: InventoryAction[] = ['cancel', 'write_off', 'return', 'undo_sale'];

/** Labelled actions for the item page, in the API's order (item.actions). */
export function itemActionsView(item: InventoryItem, t: Translator = translator('en')): ItemActionView[] {
  const primary = PRIMARY.find((a) => item.actions.includes(a));
  return item.actions.map((action) => ({
    action,
    label: t(ACTION_KEY[action]),
    tone: action === primary ? 'primary' : DANGER.includes(action) ? 'danger' : 'secondary',
    confirm: confirmFor(action, item, t),
  }));
}

function confirmFor(action: InventoryAction, item: InventoryItem, t: Translator): ItemActionView['confirm'] {
  const cancelLabel = t('inventory.keepIt');
  switch (action) {
    case 'cancel':
      return { title: t('inventory.confirmCancelTitle'), body: t('inventory.confirmCancelBody', { fromDeal: item.origin === 'deal' ? 'yes' : 'no' }), confirmLabel: t('inventory.actionCancel'), cancelLabel };
    case 'return':
      return { title: t('inventory.confirmReturnTitle'), body: t('inventory.confirmReturnBody'), confirmLabel: t('inventory.actionReturn'), cancelLabel };
    case 'write_off':
      return { title: t('inventory.confirmWriteOffTitle'), body: t('inventory.confirmWriteOffBody'), confirmLabel: t('inventory.actionWriteOff'), cancelLabel };
    case 'reopen':
      return { title: t('inventory.confirmReopenTitle'), body: t('inventory.confirmReopenBody'), confirmLabel: t('inventory.actionReopen'), cancelLabel };
    case 'undo_sale':
      return { title: t('inventory.undoConfirm'), body: t('inventory.undoSaleListingsNote'), confirmLabel: t('inventory.undoSale'), cancelLabel };
    default:
      return null;
  }
}

/**
 * Why "Undo bought" isn't offered although the item is held: it's live on a marketplace (take it
 * down in Sell first). Null when it is offered or doesn't apply.
 */
export function cancelBlockedHint(item: InventoryItem, t: Translator = translator('en')): string | null {
  return item.holding && !item.actions.includes('cancel') && (item.sellListing?.activeChannels ?? 0) > 0 ? t('inventory.blockedLive') : null;
}

/** "Remember to take it down": marketplaces where the seller must remove a listing Rein Drop ended. */
export function removeManuallyView(marketplaces: readonly MarketplaceKey[], t: Translator = translator('en')): { title: string; body: string; doneLabel: string } | null {
  if (marketplaces.length === 0) return null;
  const names = [...new Set(marketplaces)].map((m) => MARKETPLACE_LABEL[m]).join(', ');
  return { title: t('inventory.removeManuallyTitle'), body: t('inventory.removeManuallyBody', { marketplaces: names }), doneLabel: t('inventory.removedDone') };
}

// ---------------------------------------------------------------------------
// Closure card (returned / written off / cancelled)
// ---------------------------------------------------------------------------

export interface ClosureView {
  /** "Returned 12 Oct 2026". */
  headline: string;
  /** Refund / cost / realized result lines (empty for a cancelled purchase). */
  lines: [string, string][];
  /** Realized result (never for a cancelled purchase). */
  result: { label: string; value: string; tone: 'profit' | 'loss' | 'neutral' } | null;
  note: string | null;
  /** Fixed explanation under the card. */
  explanation: string;
}

const CLOSED_KEY = { RETURNED: 'inventory.closedReturned', WRITTEN_OFF: 'inventory.closedWrittenOff', CANCELLED: 'inventory.closedCancelled' } as const;

export function closureView(item: InventoryItem, ctx: HuntFormContext): ClosureView | null {
  const c = item.closure;
  if (!c) return null;
  const { t } = ctx;
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const headline = t('inventory.closedOn', { status: t(CLOSED_KEY[c.status]), date: dayText(c.closedAt, ctx.localeTag) });
  if (c.status === 'CANCELLED') return { headline, lines: [], result: null, note: c.note, explanation: t('inventory.cancelledNote') };
  const lines: [string, string][] = [];
  let result: ClosureView['result'] = null;
  if (c.result?.status === 'ok') {
    lines.push([t('inventory.whatItCost'), fmt(c.result.costBasis)]);
    if (c.refund) lines.push([t('inventory.refundLine'), fmt(c.refund)]);
    const p = c.result.realizedProfit.amountMinor;
    result = { label: t(p < 0 ? 'inventory.realizedLoss' : 'inventory.realizedProfit'), value: fmt(c.result.realizedProfit), tone: p > 0 ? 'profit' : p < 0 ? 'loss' : 'neutral' };
  } else if (c.result) {
    if (c.refund) lines.push([t('inventory.refundLine'), fmt(c.refund)]);
    result = { label: t('inventory.result'), value: t('inventory.notCalculated'), tone: 'neutral' };
  }
  return { headline, lines, result, note: c.note, explanation: t('inventory.closedResultNote') };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const EVENT_KEY: Record<InventoryEventType, MessageKey> = {
  BOUGHT: 'inventory.eventBought',
  ADDED_MANUALLY: 'inventory.eventAddedManually',
  PURCHASE_EDITED: 'inventory.eventPurchaseEdited',
  COSTS_EDITED: 'inventory.eventCostsEdited',
  LISTED: 'inventory.eventListed',
  UNLISTED: 'inventory.eventUnlisted',
  LISTING_STARTED: 'inventory.eventListingStarted',
  PUBLISHED: 'inventory.eventPublished',
  CHANNEL_ENDED: 'inventory.eventChannelEnded',
  SOLD: 'inventory.eventSold',
  SALE_CORRECTED: 'inventory.eventSaleCorrected',
  SALE_UNDONE: 'inventory.eventSaleUndone',
  RETURNED: 'inventory.eventReturned',
  WRITTEN_OFF: 'inventory.eventWrittenOff',
  CANCELLED: 'inventory.eventCancelled',
  REOPENED: 'inventory.eventReopened',
  LISTING_DISCARDED: 'inventory.eventListingDiscarded',
  LISTING_RESTORED: 'inventory.eventListingRestored',
};

const ENDED_DETAIL_KEY: Record<string, MessageKey> = {
  user: 'inventory.detailEndedUser',
  sold_here: 'inventory.detailEndedSoldHere',
  sold_elsewhere: 'inventory.detailEndedSoldElsewhere',
  returned: 'inventory.detailEndedReturned',
  written_off: 'inventory.detailEndedWrittenOff',
};

const WRITE_OFF_KEY: Record<WriteOffReason, MessageKey> = {
  lost: 'inventory.writeOffReasonLost',
  broken: 'inventory.writeOffReasonBroken',
  unsellable: 'inventory.writeOffReasonUnsellable',
  other: 'inventory.writeOffReasonOther',
};

export interface TimelineRow {
  id: string;
  type: InventoryEventType;
  title: string;
  /** Facts in words (amounts, where, why); empty when there are none. */
  details: string[];
  /** "15 Oct 2026, 14:02 · on your phone". */
  when: string;
  tone: 'profit' | 'loss' | 'info' | 'neutral';
}

const EVENT_TONE: Partial<Record<InventoryEventType, TimelineRow['tone']>> = {
  SOLD: 'profit',
  WRITTEN_OFF: 'loss',
  RETURNED: 'loss',
  CANCELLED: 'neutral',
  PUBLISHED: 'info',
};

/** The item's history (GET /inventory/:id/events), newest first, ready to render. */
export function timelineView(events: readonly InventoryEvent[], ctx: HuntFormContext, order: 'newest' | 'oldest' = 'newest'): TimelineRow[] {
  const { t } = ctx;
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const rows = events.map((e): TimelineRow => {
    const d = e.details;
    const marketplace = d.marketplace ? MARKETPLACE_LABEL[d.marketplace] : '';
    const details: string[] = [];
    switch (e.type) {
      case 'BOUGHT':
      case 'ADDED_MANUALLY':
        if (d.price) details.push(d.marketplace ? t('inventory.detailForOn', { amount: fmt(d.price), marketplace }) : t('inventory.detailFor', { amount: fmt(d.price) }));
        if (d.where) details.push(t('inventory.detailWhere', { where: d.where }));
        break;
      case 'PURCHASE_EDITED':
        if (d.before && d.price) details.push(t('inventory.detailPriceChanged', { before: fmt(d.before), after: fmt(d.price) }));
        break;
      case 'COSTS_EDITED':
        if (d.count !== undefined && d.total) details.push(t('inventory.detailCosts', { count: d.count, total: fmt(d.total) }));
        break;
      case 'PUBLISHED':
        if (d.simulated) details.push(t('inventory.detailSimulated'));
        break;
      case 'CHANNEL_ENDED':
        if (d.reason && ENDED_DETAIL_KEY[d.reason]) details.push(t(ENDED_DETAIL_KEY[d.reason]!));
        break;
      case 'SOLD':
      case 'SALE_CORRECTED':
      case 'SALE_UNDONE':
        if (d.price) details.push(d.marketplace ? t('inventory.detailForOn', { amount: fmt(d.price), marketplace }) : t('inventory.detailFor', { amount: fmt(d.price) }));
        break;
      case 'RETURNED':
        if (d.refund) details.push(t('inventory.detailRefund', { amount: fmt(d.refund) }));
        break;
      case 'WRITTEN_OFF':
        if (d.reason && (WRITE_OFF_REASONS as readonly string[]).includes(d.reason)) details.push(t(WRITE_OFF_KEY[d.reason as WriteOffReason]));
        break;
      case 'CANCELLED':
        if (d.dealReopened) details.push(t('inventory.detailDealReopened'));
        break;
      case 'REOPENED':
        break;
      default:
        break;
    }
    if (d.note) details.push(d.note);
    if (d.removeManually && d.removeManually.length > 0) {
      details.push(t('inventory.detailRemoveManually', { marketplaces: d.removeManually.map((m) => MARKETPLACE_LABEL[m]).join(', ') }));
    }
    if (d.backfilled) details.push(t('inventory.detailBackfilled'));
    const date = dateTimeText(e.at, ctx.localeTag);
    const source = e.source === 'web' ? t('inventory.sourceWeb') : e.source === 'mobile' ? t('inventory.sourceMobile') : null;
    return {
      id: e.id,
      type: e.type,
      title: t(EVENT_KEY[e.type], { marketplace }),
      details,
      when: source ? t('inventory.eventWhenSource', { date, source }) : t('inventory.eventWhen', { date }),
      tone: EVENT_TONE[e.type] ?? 'neutral',
    };
  });
  return order === 'newest' ? rows.reverse() : rows;
}

// ---------------------------------------------------------------------------
// Sell sections (one Sell area, step 91) and listing tabs
// ---------------------------------------------------------------------------

const SECTION_KEY: Record<InventorySection, MessageKey> = {
  holding: 'inventory.sectionHolding',
  listed: 'inventory.sectionListed',
  sold: 'inventory.sectionSold',
  other: 'inventory.sectionOther',
};

/** Section chips (GET /inventory?section=...), with counts from GET /inventory/counts when given. */
export function inventorySections(t: Translator = translator('en'), counts?: InventoryCounts): { value: InventorySection; label: string; count: number | null }[] {
  return (Object.keys(SECTION_KEY) as InventorySection[]).map((value) => {
    const count = counts ? counts[value] : null;
    return { value, label: count === null ? t(SECTION_KEY[value]) : t('inventory.sectionCount', { label: t(SECTION_KEY[value]), count }), count };
  });
}

const VIEW_KEY: Record<SellListingView, MessageKey> = { drafts: 'sell.viewDrafts', active: 'sell.viewActive', closed: 'sell.viewClosed', discarded: 'sell.viewDiscarded' };

/** Listing tabs (GET /sell/listings?view=...), with counts when given. */
export function sellListingViews(t: Translator = translator('en'), counts?: InventoryCounts['listings']): { value: SellListingView; label: string; count: number | null }[] {
  return (Object.keys(VIEW_KEY) as SellListingView[]).map((value) => {
    const count = counts ? (value === 'drafts' ? counts.drafts : value === 'active' ? counts.active : value === 'discarded' ? counts.discarded : null) : null;
    return { value, label: count === null ? t(VIEW_KEY[value]) : t('inventory.sectionCount', { label: t(VIEW_KEY[value]), count }), count };
  });
}

// ---------------------------------------------------------------------------
// Add item (bought outside Rein Drop)
// ---------------------------------------------------------------------------

export interface AddItemForm {
  title: string;
  price: string;
  currency: string;
  day: string;
  where: SoldWhere | null;
  /** When `where` is "other": e.g. "garage sale" (optional). */
  whereText: string;
  notes: string;
  costs: CostDraft<PurchaseCostCategory>[];
}

export function addItemFormDefaults(ctx: Pick<HuntFormContext, 'currency'>, now: Date): AddItemForm {
  return { title: '', price: '', currency: ctx.currency, day: localDay(now), where: null, whereText: '', notes: '', costs: [] };
}

/** Purchase cost row for the Add item form. */
export const newPurchaseCostDraft = (category: PurchaseCostCategory = 'SHIPPING') => newCostDraft<PurchaseCostCategory>(category);

export type AddItemErrors = Partial<Record<'title' | 'price' | 'day', string>> & { costs?: Record<string, string> };

export function buildCreateItemRequest(
  form: AddItemForm,
  now: Date,
  t: Translator = translator('en'),
): { ok: true; request: CreateInventoryItemRequest } | { ok: false; errors: AddItemErrors } {
  const errors: AddItemErrors = {};
  const title = form.title.trim();
  if (!title) errors.title = t('inventory.errorName');
  const price = parseMoneyInput(form.price, form.currency, t);
  if (!price.ok) errors.price = price.message;
  else if (!price.money || price.money.amountMinor <= 0) errors.price = t('inventory.errorPricePaid');
  const day = form.day.trim();
  if (!isValidDay(day)) errors.day = t('inventory.errorDateFormat');
  else if (day > localDay(now)) errors.day = t('inventory.errorFuture');
  const costs = parseCostDrafts(form.costs, form.currency, t);
  if (!costs.ok) errors.costs = costs.errors;
  if (Object.keys(errors).length > 0 || !costs.ok || !price.ok || !price.money) return { ok: false, errors };
  const whereText = form.whereText.trim().slice(0, 100);
  return {
    ok: true,
    request: {
      title: title.slice(0, 200),
      purchasePrice: price.money,
      purchasedAt: instantForDay(day, now).toISOString(),
      boughtFrom: form.where === null ? null : form.where === 'other' ? (whereText ? { kind: 'other', text: whereText } : null) : { kind: 'marketplace', marketplace: form.where },
      ...(form.notes.trim() ? { notes: form.notes.trim().slice(0, 1000) } : {}),
      costs: costs.costs,
    },
  };
}

// ---------------------------------------------------------------------------
// Return / write off
// ---------------------------------------------------------------------------

export interface ReturnForm {
  /** Prefilled with the price paid (a full refund of the price). */
  refund: string;
  day: string;
  note: string;
}

export function returnFormDefaults(item: InventoryItem, now: Date): ReturnForm {
  return { refund: moneyToInput(item.purchase.price), day: localDay(now), note: '' };
}

export function buildReturnRequest(
  form: ReturnForm,
  item: InventoryItem,
  now: Date,
  t: Translator = translator('en'),
): { ok: true; request: ReturnItemRequest } | { ok: false; errors: Partial<Record<'refund' | 'day', string>> } {
  const errors: Partial<Record<'refund' | 'day', string>> = {};
  const currency = item.purchase.price.currency;
  const refund = parseMoneyInput(form.refund, currency, t);
  if (!refund.ok) errors.refund = refund.message;
  else if (!refund.money) errors.refund = t('inventory.errorRefund');
  const day = dayError(form.day, item, now, t);
  if (day) errors.day = day;
  if (Object.keys(errors).length > 0 || !refund.ok || !refund.money) return { ok: false, errors };
  return {
    ok: true,
    request: { refund: refund.money, returnedAt: closingInstant(form.day.trim(), item, now).toISOString(), ...(form.note.trim() ? { note: form.note.trim().slice(0, 500) } : {}) },
  };
}

export interface WriteOffForm {
  reason: WriteOffReason | null;
  day: string;
  note: string;
}

export function writeOffFormDefaults(now: Date): WriteOffForm {
  return { reason: null, day: localDay(now), note: '' };
}

export function writeOffReasonOptions(t: Translator = translator('en')): { value: WriteOffReason; label: string }[] {
  return WRITE_OFF_REASONS.map((value) => ({ value, label: t(WRITE_OFF_KEY[value]) }));
}

export function buildWriteOffRequest(
  form: WriteOffForm,
  item: InventoryItem,
  now: Date,
  t: Translator = translator('en'),
): { ok: true; request: WriteOffItemRequest } | { ok: false; errors: Partial<Record<'day', string>> } {
  const day = dayError(form.day, item, now, t);
  if (day) return { ok: false, errors: { day } };
  return {
    ok: true,
    request: {
      ...(form.reason ? { reason: form.reason } : {}),
      writtenOffAt: closingInstant(form.day.trim(), item, now).toISOString(),
      ...(form.note.trim() ? { note: form.note.trim().slice(0, 500) } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Sold from a listing ("Sold on eBay for $X")
// ---------------------------------------------------------------------------

export interface ListingSoldForm {
  price: string;
  currency: string;
  day: string;
  /** One of the listing's marketplaces, or "other". */
  where: SoldWhere | null;
  costs: CostDraft<SaleCostCategory>[];
}

/** Where it can have sold: the listing's marketplaces (live first), then "somewhere else". */
export function listingSoldWhereOptions(listing: SellListing, t: Translator = translator('en')): { value: SoldWhere; label: string }[] {
  const seen = new Set<MarketplaceKey>();
  const ordered = [...listing.channels].sort((a, b) => Number(b.status === 'PUBLISHED') - Number(a.status === 'PUBLISHED'));
  const options: { value: SoldWhere; label: string }[] = [];
  for (const c of ordered) {
    if (seen.has(c.marketplace)) continue;
    seen.add(c.marketplace);
    options.push({ value: c.marketplace, label: MARKETPLACE_LABEL[c.marketplace] });
  }
  options.push({ value: 'other', label: t('sell.soldElsewhere') });
  return options;
}

/** Defaults: the listing's asking price (the seller corrects it), today, the only live marketplace if there is one. */
export function listingSoldFormDefaults(listing: SellListing, now: Date): ListingSoldForm {
  const live = listing.channels.filter((c) => c.status === 'PUBLISHED');
  return {
    price: listing.price ? moneyToInput(listing.price) : '',
    currency: listing.currency,
    day: localDay(now),
    where: live.length === 1 ? live[0]!.marketplace : null,
    costs: [
      { key: 'sold-0', category: 'MARKETPLACE_FEE', amount: '', note: '' },
      { key: 'sold-1', category: 'PAYMENT_FEE', amount: '', note: '' },
      { key: 'sold-2', category: 'SHIPPING', amount: '', note: '' },
    ],
  };
}

export type ListingSoldErrors = Partial<Record<'price' | 'day' | 'where', string>> & { costs?: Record<string, string> };

/**
 * Body of POST /sell/listings/:id/sold. `purchasedAt` (the item's purchase date, when the screen
 * has it) refuses a sale date before the purchase; the API checks it anyway.
 */
export function buildListingSoldRequest(
  form: ListingSoldForm,
  listing: SellListing,
  now: Date,
  t: Translator = translator('en'),
  purchasedAt?: string,
): { ok: true; request: RecordSaleRequest } | { ok: false; errors: ListingSoldErrors } {
  const errors: ListingSoldErrors = {};
  const price = parseMoneyInput(form.price, form.currency, t);
  if (!price.ok) errors.price = price.message;
  else if (!price.money || price.money.amountMinor <= 0) errors.price = t('inventory.errorSalePrice');
  const day = form.day.trim();
  if (!isValidDay(day)) errors.day = t('inventory.errorDateFormat');
  else if (day > localDay(now)) errors.day = t('inventory.errorFuture');
  else if (purchasedAt && day < localDay(new Date(purchasedAt))) errors.day = t('inventory.errorBeforePurchase');
  if (form.where === null || (form.where !== 'other' && !listing.channels.some((c) => c.marketplace === form.where))) errors.where = t('sell.errorSoldWhere');
  const costs = parseCostDrafts(form.costs, form.currency, t);
  if (!costs.ok) errors.costs = costs.errors;
  if (Object.keys(errors).length > 0 || !costs.ok || !price.ok || !price.money) return { ok: false, errors };
  let soldAt = instantForDay(day, now);
  if (purchasedAt && soldAt < new Date(purchasedAt)) soldAt = new Date(purchasedAt);
  return {
    ok: true,
    request: { price: price.money, soldAt: soldAt.toISOString(), marketplace: form.where === 'other' || form.where === null ? null : form.where, costs: costs.costs },
  };
}

/** Toast after "Sold": mentions the other listings that were ended. */
export function listingSoldDoneText(endedOthers: number, t: Translator = translator('en')): string {
  return endedOthers > 0 ? t('sell.doneSoldEnded', { count: endedOthers }) : t('sell.doneSold');
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

export interface AccountDeletionText {
  title: string;
  /** Paragraphs, in order: what happens, billing, signing in again. */
  paragraphs: string[];
  /** The word to type (never translated - the API expects it exactly). */
  confirmWord: typeof DELETE_ACCOUNT_CONFIRMATION;
  typeToConfirm: string;
  confirmLabel: string;
  cancelLabel: string;
  progress: string;
  done: string;
}

export function accountDeletionText(t: Translator = translator('en')): AccountDeletionText {
  return {
    title: t('account.deleteTitle'),
    paragraphs: [t('account.deleteIntro'), t('account.deleteWhatGoes'), t('account.deleteBilling'), t('account.deleteSignIn')],
    confirmWord: DELETE_ACCOUNT_CONFIRMATION,
    typeToConfirm: t('account.deleteTypeToConfirm', { word: DELETE_ACCOUNT_CONFIRMATION }),
    confirmLabel: t('account.deleteConfirm'),
    cancelLabel: t('account.deleteCancel'),
    progress: t('account.deleting'),
    done: t('account.deleteDone'),
  };
}

/** The typed confirmation matches (trimmed, case-insensitive). */
export function deletionConfirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_ACCOUNT_CONFIRMATION;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Now for today, otherwise local noon of that day (a calendar day is all the person told us). */
function instantForDay(day: string, now: Date): Date {
  if (day === localDay(now)) return now;
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0);
}

function closingInstant(day: string, item: InventoryItem, now: Date): Date {
  const at = instantForDay(day, now);
  const purchasedAt = new Date(item.purchase.purchasedAt);
  return at < purchasedAt ? purchasedAt : at;
}

function dayError(text: string, item: InventoryItem, now: Date, t: Translator): string | null {
  const day = text.trim();
  if (!isValidDay(day)) return t('inventory.errorDateFormat');
  if (day > localDay(now)) return t('inventory.errorFuture');
  if (day < localDay(new Date(item.purchase.purchasedAt))) return t('inventory.errorBeforePurchase');
  return null;
}

function dayText(iso: string, localeTag: string): string {
  try {
    return new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function dateTimeText(iso: string, localeTag: string): string {
  try {
    return new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}
