import { describe, expect, it } from 'vitest';
import { compareAmounts, type InventoryEvent, type InventoryItem, type Money, type SellListing } from '@rein-drop/contracts';
import { displayContext } from './hunt-form.js';
import {
  accountDeletionText,
  addItemFormDefaults,
  buildCreateItemRequest,
  buildListingSoldRequest,
  buildReturnRequest,
  buildWriteOffRequest,
  cancelBlockedHint,
  closureView,
  deletionConfirmed,
  inventorySections,
  itemActionsView,
  listingSoldDoneText,
  listingSoldFormDefaults,
  listingSoldWhereOptions,
  removeManuallyView,
  returnFormDefaults,
  sellListingViews,
  timelineView,
  writeOffFormDefaults,
} from './item-lifecycle-view.js';
import { inventoryRowView } from './inventory-view.js';
import { channelView, sellListingStatusLabel } from './sell-view.js';

const ZA = displayContext({ currency: 'ZAR', distanceUnit: 'km' as const, localeTag: 'en-ZA' });
const DE = displayContext({ currency: 'EUR', distanceUnit: 'km' as const, localeTag: 'de-DE' }, 'de');
const ZAR = (amountMinor: number): Money => ({ amountMinor, currency: 'ZAR' });
const nbsp = (s: string | null | undefined) => s?.replace(/[  ]/g, ' ');
const NOW = new Date(2026, 9, 8, 15, 0, 0);
const BOUGHT = new Date(2026, 8, 28, 10, 0, 0);
const ID = '00000000-0000-7000-8000-000000000001';

function item(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: ID,
    title: 'Desk lamp',
    status: 'IN_STOCK',
    holding: true,
    notes: null,
    dealId: ID,
    source: null,
    purchase: { price: ZAR(100_00), purchasedAt: BOUGHT.toISOString(), costs: [], total: ZAR(100_00) },
    sale: null,
    result: null,
    daysHeld: 3,
    expected: null,
    comparison: { purchasePrice: compareAmounts(null, ZAR(100_00)), salePrice: compareAmounts(null, null), profit: compareAmounts(null, null) },
    origin: 'deal',
    boughtFrom: null,
    closure: null,
    sellListing: null,
    actions: ['edit_purchase', 'mark_listed', 'list_for_sale', 'mark_sold', 'return', 'write_off', 'cancel'],
    createdAt: BOUGHT.toISOString(),
    updatedAt: BOUGHT.toISOString(),
    ...over,
  };
}

function listing(over: Partial<SellListing> = {}): SellListing {
  return {
    id: ID,
    inventoryItemId: ID,
    status: 'PUBLISHED',
    title: 'Desk lamp',
    description: 'Works',
    price: ZAR(250_00),
    currency: 'ZAR',
    condition: 'good',
    itemSpecifics: [],
    photos: [],
    sourcePhotos: [],
    channels: [
      { marketplace: 'facebook', mode: 'assisted', status: 'AWAITING_CONFIRMATION', url: null, simulated: false, assist: null, error: null, publishedAt: null, endedReason: null, removalPending: false },
      { marketplace: 'ebay', mode: 'api', status: 'PUBLISHED', url: null, simulated: true, assist: null, error: null, publishedAt: BOUGHT.toISOString(), endedReason: null, removalPending: false },
    ],
    aiAssisted: false,
    missing: [],
    itemStatus: 'LISTED',
    sale: null,
    removeManually: [],
    canDiscard: false,
    canSell: true,
    createdAt: BOUGHT.toISOString(),
    updatedAt: BOUGHT.toISOString(),
    ...over,
  };
}

const event = (type: InventoryEvent['type'], details: InventoryEvent['details'] = {}, source: InventoryEvent['source'] = null): InventoryEvent => ({
  id: `${ID.slice(0, -2)}${String(Math.floor(Math.random() * 90) + 10)}`,
  type,
  at: BOUGHT.toISOString(),
  source,
  details,
});

describe('item actions', () => {
  it('labels the API actions; Mark sold is primary; ending actions ask first', () => {
    const actions = itemActionsView(item(), ZA.t);
    expect(actions.map((a) => [a.action, a.label, a.tone])).toEqual([
      ['edit_purchase', 'Edit purchase', 'secondary'],
      ['mark_listed', 'I listed it elsewhere', 'secondary'],
      ['list_for_sale', 'List for sale', 'secondary'],
      ['mark_sold', 'Mark sold', 'primary'],
      ['return', 'Returned it', 'danger'],
      ['write_off', 'Write off', 'danger'],
      ['cancel', 'Undo bought', 'danger'],
    ]);
    expect(actions.find((a) => a.action === 'cancel')?.confirm?.body).toMatch(/deal shows as not bought again/);
    expect(itemActionsView(item({ origin: 'manual' }), ZA.t).find((a) => a.action === 'cancel')?.confirm?.body).toMatch(/added it by mistake/);
    expect(actions.find((a) => a.action === 'mark_sold')?.confirm).toBeNull();
  });

  it('explains why Undo bought is missing while it is live', () => {
    const live = item({ status: 'LISTED', actions: ['edit_purchase', 'list_for_sale', 'mark_sold', 'return', 'write_off'], sellListing: { id: ID, status: 'PUBLISHED', price: null, channels: [], activeChannels: 1, removeManually: [] } });
    expect(cancelBlockedHint(live, ZA.t)).toMatch(/take the listing down in Sell first/);
    expect(cancelBlockedHint(item(), ZA.t)).toBeNull();
  });

  it('reminds to take assisted listings down', () => {
    expect(removeManuallyView(['facebook'], ZA.t)?.body).toBe("Rein Drop can't remove listings on Facebook Marketplace - delete it there so nobody else buys it.");
    expect(removeManuallyView([], ZA.t)).toBeNull();
  });
});

describe('closed items', () => {
  const writtenOff = item({
    status: 'WRITTEN_OFF',
    holding: false,
    actions: ['edit_purchase', 'reopen'],
    closure: { status: 'WRITTEN_OFF', closedAt: NOW.toISOString(), note: null, refund: null, result: { status: 'ok', costBasis: ZAR(100_00), recovered: ZAR(0), realizedProfit: ZAR(-100_00) } },
  });

  it('a write-off shows a REALIZED loss, and the row opens the item page', () => {
    const view = closureView(writtenOff, ZA)!;
    expect(view.headline).toMatch(/^Written off 0?8 Oct 2026$/);
    expect(view.result).toMatchObject({ label: 'Realized loss', tone: 'loss' });
    expect(nbsp(view.result?.value)).toMatch(/-?R\s?100[,.]00|−/);
    const row = inventoryRowView(writtenOff, ZA);
    expect(row.result).toMatchObject({ label: 'Realized loss', tone: 'loss' });
    expect(row.action.kind).toBe('details');
    expect(row.status.label).toBe('Written off');
  });

  it('a cancelled purchase has no result and says it is left out of the figures', () => {
    const cancelled = item({ status: 'CANCELLED', holding: false, actions: ['reopen'], closure: { status: 'CANCELLED', closedAt: NOW.toISOString(), note: 'mis-tap', refund: null, result: null } });
    expect(closureView(cancelled, ZA)).toMatchObject({ result: null, lines: [], note: 'mis-tap', explanation: expect.stringMatching(/left out of your figures/) });
    expect(inventoryRowView(cancelled, ZA)).toMatchObject({ result: null, status: { label: 'Cancelled' } });
    expect(inventoryRowView(cancelled, DE).status.label).toBe('Storniert');
  });
});

describe('timeline', () => {
  it('turns events into readable rows, newest first, with where the change was made', () => {
    const rows = timelineView(
      [
        event('BOUGHT', { price: ZAR(100_00), marketplace: 'ebay' }, 'mobile'),
        event('CHANNEL_ENDED', { marketplace: 'facebook', reason: 'sold_elsewhere', removeManually: ['facebook'] }, 'web'),
        event('SOLD', { price: ZAR(250_00), marketplace: 'ebay', backfilled: true }),
      ],
      ZA,
    );
    expect(rows.map((r) => r.title)).toEqual(['Sold', 'Taken down on Facebook Marketplace', 'Bought']);
    expect(rows[0]!.tone).toBe('profit');
    expect(rows[0]!.details).toContain('From earlier records');
    expect(rows[1]!.details).toEqual(['It sold elsewhere', 'Remove it on Facebook Marketplace yourself.']);
    expect(rows[1]!.when).toMatch(/ · in a browser$/);
    expect(nbsp(rows[2]!.details[0])).toMatch(/^R\s?100[,.]00 on eBay$/);
    expect(rows[2]!.when).toMatch(/on your phone$/);
  });

  it('German draft', () => {
    const [row] = timelineView([event('CANCELLED', { dealReopened: true })], DE);
    expect(row).toMatchObject({ title: 'Kauf storniert', details: ['Der Deal gilt wieder als nicht gekauft.'] });
  });
});

describe('forms', () => {
  it('Add item: validates and builds the request (marketplace or free text)', () => {
    const form = { ...addItemFormDefaults(ZA, NOW), title: ' Lamp ', price: '50', where: 'other' as const, whereText: 'garage sale', day: '2026-10-07' };
    const built = buildCreateItemRequest(form, NOW, ZA.t);
    expect(built).toMatchObject({ ok: true, request: { title: 'Lamp', purchasePrice: ZAR(50_00), boughtFrom: { kind: 'other', text: 'garage sale' }, costs: [] } });
    expect(buildCreateItemRequest({ ...form, where: 'ebay' }, NOW, ZA.t)).toMatchObject({ ok: true, request: { boughtFrom: { kind: 'marketplace', marketplace: 'ebay' } } });
    expect(buildCreateItemRequest({ ...form, title: '', price: '0', day: '2026-12-01' }, NOW, ZA.t)).toEqual({
      ok: false,
      errors: { title: 'Give it a name', price: 'Enter what you paid', day: "Can't be in the future" },
    });
  });

  it('Return: refund prefilled with the price, 0 allowed, never before the purchase', () => {
    const it0 = item();
    const form = returnFormDefaults(it0, NOW);
    expect(form.refund).toBe('100.00');
    expect(buildReturnRequest({ ...form, refund: '0' }, it0, NOW, ZA.t)).toMatchObject({ ok: true, request: { refund: ZAR(0) } });
    expect(buildReturnRequest({ ...form, refund: '' }, it0, NOW, ZA.t)).toMatchObject({ ok: false, errors: { refund: 'Enter the refund (0 if none)' } });
    expect(buildReturnRequest({ ...form, day: '2026-09-01' }, it0, NOW, ZA.t)).toMatchObject({ ok: false, errors: { day: "Can't be before you bought it" } });
  });

  it('Write off: optional reason', () => {
    expect(buildWriteOffRequest({ ...writeOffFormDefaults(NOW), reason: 'broken' }, item(), NOW, ZA.t)).toMatchObject({ ok: true, request: { reason: 'broken' } });
  });

  it('Sold from a listing: where = one of its marketplaces or elsewhere', () => {
    const l = listing();
    expect(listingSoldWhereOptions(l, ZA.t).map((o) => o.value)).toEqual(['ebay', 'facebook', 'other']);
    const defaults = listingSoldFormDefaults(l, NOW);
    expect(defaults).toMatchObject({ price: '250.00', where: 'ebay', currency: 'ZAR' });
    const built = buildListingSoldRequest({ ...defaults, price: '240' }, l, NOW, ZA.t, BOUGHT.toISOString());
    expect(built).toMatchObject({ ok: true, request: { price: ZAR(240_00), marketplace: 'ebay', costs: [] } });
    expect(buildListingSoldRequest({ ...defaults, where: null }, l, NOW, ZA.t)).toMatchObject({ ok: false, errors: { where: 'Choose where it sold' } });
    expect(buildListingSoldRequest({ ...defaults, where: 'other' }, l, NOW, ZA.t)).toMatchObject({ ok: true, request: { marketplace: null } });
    expect(listingSoldDoneText(1, ZA.t)).toBe('Sale recorded - your other listing was ended.');
    expect(listingSoldDoneText(0, ZA.t)).toBe('Sale recorded.');
  });
});

describe('sections, tabs, listing states', () => {
  it('section chips with counts', () => {
    expect(inventorySections(ZA.t, { holding: 2, listed: 1, sold: 0, other: 3, listings: { drafts: 1, active: 0, discarded: 2 } }).map((s) => s.label)).toEqual(['In stock (2)', 'Listings (1)', 'Sold (0)', 'Other (3)']);
    expect(sellListingViews(ZA.t).map((v) => v.label)).toEqual(['Drafts', 'Active', 'Sold or ended', 'Discarded']);
    expect(sellListingViews(ZA.t, { drafts: 1, active: 0, discarded: 2 }).map((v) => v.count)).toEqual([1, 0, null, 2]);
  });

  it('discarded label and channels ended by a sale', () => {
    expect(sellListingStatusLabel('DISCARDED', ZA.t).label).toBe('Discarded');
    const ended = channelView({ ...listing().channels[0]!, status: 'ENDED', endedReason: 'sold_elsewhere', removalPending: true }, 'en-ZA', ZA.t);
    expect(ended).toMatchObject({ label: 'Ended - sold elsewhere', removalPending: true, canEnd: false, detail: "Remove it on Facebook Marketplace yourself - Rein Drop can't." });
  });
});

describe('account deletion', () => {
  it('explains what happens and needs the exact word', () => {
    const text = accountDeletionText(ZA.t);
    expect(text.confirmWord).toBe('DELETE');
    expect(text.paragraphs).toHaveLength(4);
    expect(text.typeToConfirm).toBe('Type DELETE to confirm');
    expect(accountDeletionText(DE.t).typeToConfirm).toBe('Gib DELETE ein, um zu bestätigen');
    expect(deletionConfirmed(' delete ')).toBe(true);
    expect(deletionConfirmed('DELET')).toBe(false);
  });
});
