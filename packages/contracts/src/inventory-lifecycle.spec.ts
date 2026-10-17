import { describe, expect, it } from 'vitest';
import {
  actionBlock,
  INVENTORY_ACTIONS,
  INVENTORY_STATUSES,
  INVENTORY_TRANSITIONS,
  inventoryActions,
  inventoryEventSchema,
  isClosedStatus,
  isHoldingStatus,
} from './inventory-lifecycle.js';
import { closedResult, createInventoryItemRequestSchema, listInventoryQuerySchema, returnItemRequestSchema } from './outcomes.js';
import { deleteAccountRequestSchema } from './account.js';

const zar = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });

describe('item lifecycle state machine', () => {
  it('allows exactly the documented moves', () => {
    expect(inventoryActions({ status: 'IN_STOCK', activeChannels: 0 })).toEqual(['edit_purchase', 'mark_listed', 'list_for_sale', 'mark_sold', 'return', 'write_off', 'cancel']);
    expect(inventoryActions({ status: 'LISTED', activeChannels: 0 })).toEqual(['edit_purchase', 'mark_unlisted', 'list_for_sale', 'mark_sold', 'return', 'write_off', 'cancel']);
    expect(inventoryActions({ status: 'SOLD', activeChannels: 0 })).toEqual(['edit_purchase', 'correct_sale', 'undo_sale']);
    expect(inventoryActions({ status: 'RETURNED', activeChannels: 0 })).toEqual(['edit_purchase', 'reopen']);
    expect(inventoryActions({ status: 'WRITTEN_OFF', activeChannels: 0 })).toEqual(['edit_purchase', 'reopen']);
    expect(inventoryActions({ status: 'CANCELLED', activeChannels: 0 })).toEqual(['reopen']);
  });

  it('undo bought (cancel) is refused while something is live on a marketplace', () => {
    expect(actionBlock('cancel', { status: 'LISTED', activeChannels: 1 })).toBe('live_on_marketplace');
    expect(actionBlock('mark_unlisted', { status: 'LISTED', activeChannels: 2 })).toBe('live_on_marketplace');
    expect(inventoryActions({ status: 'LISTED', activeChannels: 1 })).not.toContain('cancel');
    // Returning or writing off still works - the live listings are ended with it.
    expect(inventoryActions({ status: 'LISTED', activeChannels: 1 })).toEqual(expect.arrayContaining(['return', 'write_off', 'mark_sold']));
  });

  it('a sold item can never be cancelled, returned or written off without undoing the sale', () => {
    for (const a of ['cancel', 'return', 'write_off', 'reopen', 'mark_sold'] as const) {
      expect(actionBlock(a, { status: 'SOLD', activeChannels: 0 })).toBe('not_from_this_status');
    }
  });

  it('every transition leads to a real status and every closed status can reopen to In stock', () => {
    for (const status of INVENTORY_STATUSES) {
      for (const [action, to] of Object.entries(INVENTORY_TRANSITIONS[status])) {
        expect(INVENTORY_ACTIONS).toContain(action);
        expect(INVENTORY_STATUSES).toContain(to);
      }
      if (isClosedStatus(status)) expect(INVENTORY_TRANSITIONS[status].reopen).toBe('IN_STOCK');
    }
    expect(isHoldingStatus('LISTED')).toBe(true);
    expect(isHoldingStatus('CANCELLED')).toBe(false);
  });
});

describe('closedResult (returned / written off)', () => {
  it('a write-off loses the whole cost basis', () => {
    expect(closedResult({ purchasePrice: zar(100_00), purchaseCosts: [zar(15_00)], recovered: null })).toEqual({
      status: 'ok',
      costBasis: zar(115_00),
      recovered: zar(0),
      realizedProfit: zar(-115_00),
    });
  });

  it('a return is refund minus cost basis', () => {
    expect(closedResult({ purchasePrice: zar(100_00), purchaseCosts: [zar(10_00)], recovered: zar(100_00) })).toMatchObject({ realizedProfit: zar(-10_00) });
  });

  it('never converts currencies', () => {
    expect(closedResult({ purchasePrice: zar(100_00), purchaseCosts: [{ amountMinor: 5_00, currency: 'USD' }], recovered: null })).toEqual({ status: 'unavailable', reason: 'currency_mismatch' });
  });
});

describe('lifecycle requests', () => {
  it('Add item: one currency per item, where bought is a marketplace or free text', () => {
    const base = { title: 'Lamp', purchasePrice: zar(50_00), purchasedAt: '2026-10-01T10:00:00.000Z' };
    expect(createInventoryItemRequestSchema.parse({ ...base, boughtFrom: { kind: 'other', text: ' garage sale ' } })).toMatchObject({ boughtFrom: { kind: 'other', text: 'garage sale' }, costs: [] });
    expect(createInventoryItemRequestSchema.parse(base).boughtFrom).toBeNull();
    expect(createInventoryItemRequestSchema.safeParse({ ...base, costs: [{ category: 'TAX', amount: { amountMinor: 1, currency: 'USD' } }] }).success).toBe(false);
    expect(createInventoryItemRequestSchema.safeParse({ ...base, purchasePrice: zar(0) }).success).toBe(false);
  });

  it('a refund may be zero but never negative', () => {
    expect(returnItemRequestSchema.safeParse({ refund: zar(0) }).success).toBe(true);
    expect(returnItemRequestSchema.safeParse({ refund: zar(-1) }).success).toBe(false);
  });

  it('inventory sections and the older status filter both parse', () => {
    expect(listInventoryQuerySchema.parse({ section: 'other' })).toMatchObject({ section: 'other', status: 'holding' });
    expect(listInventoryQuerySchema.safeParse({ section: 'nope' }).success).toBe(false);
  });

  it('account deletion needs the exact confirmation', () => {
    expect(deleteAccountRequestSchema.safeParse({ confirmation: 'DELETE' }).success).toBe(true);
    expect(deleteAccountRequestSchema.safeParse({ confirmation: 'delete' }).success).toBe(false);
    expect(deleteAccountRequestSchema.safeParse({}).success).toBe(false);
  });

  it('event details drop unknown keys (no free-form payloads)', () => {
    const e = inventoryEventSchema.parse({ id: '00000000-0000-7000-8000-000000000001', type: 'SOLD', at: '2026-10-01T10:00:00.000Z', source: 'web', details: { price: zar(1), secret: 'x' } });
    expect(e.details).toEqual({ price: zar(1) });
  });
});
