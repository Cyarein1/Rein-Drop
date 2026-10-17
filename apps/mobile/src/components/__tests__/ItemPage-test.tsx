import { Alert } from 'react-native';
import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import type { InventoryEvent, InventoryItem, Money } from '@rein-drop/api-client';
import ItemScreen from '../../app/inventory/[id]/index';

/**
 * The one item page (decision 0021): actions come from the API's `item.actions` - the primary one
 * in the bottom bar, the others as rows; ending actions ask first; the timeline is shown.
 */
const ZAR = (amountMinor: number): Money => ({ amountMinor, currency: 'ZAR' });
const AT = '2026-10-01T10:00:00.000Z';
const ID = '00000000-0000-7000-8000-000000000001';

function item(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: ID,
    title: 'Desk lamp',
    status: 'IN_STOCK',
    holding: true,
    notes: null,
    dealId: null,
    source: null,
    purchase: { price: ZAR(100_00), purchasedAt: AT, costs: [], total: ZAR(100_00) },
    sale: null,
    result: null,
    daysHeld: 3,
    expected: null,
    comparison: {
      purchasePrice: { expected: null, actual: ZAR(100_00), difference: null },
      salePrice: { expected: null, actual: null, difference: null },
      profit: { expected: null, actual: null, difference: null },
    },
    origin: 'manual',
    boughtFrom: null,
    closure: null,
    sellListing: null,
    actions: ['edit_purchase', 'mark_listed', 'list_for_sale', 'mark_sold', 'return', 'write_off', 'cancel'],
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

const EVENTS: InventoryEvent[] = [{ id: 'e1', type: 'ADDED_MANUALLY', at: AT, source: 'mobile', details: { price: ZAR(100_00) } }];

let mockItem: InventoryItem = item();
const mockApi = {
  getInventoryItem: jest.fn(async () => mockItem),
  getInventoryEvents: jest.fn(async () => ({ items: EVENTS })),
  cancelInventoryItem: jest.fn(async () => item({ status: 'CANCELLED', holding: false, actions: ['reopen'] })),
};
jest.mock('@/config/api', () => ({ getApiClient: () => mockApi, apiBaseUrl: { url: 'http://api.test' } }));

const render = () =>
  renderRouter(
    {
      _layout: () => <Stack />,
      'inventory/[id]/index': ItemScreen,
      'inventory/[id]/sell': () => null,
    },
    { initialUrl: `/inventory/${ID}` },
  );

beforeEach(() => {
  mockItem = item();
  jest.clearAllMocks();
});

describe('item page actions (from item.actions)', () => {
  it('in stock: Mark sold is the main action, List for sale beside it, the rest as rows; the history shows', async () => {
    render();
    expect(await screen.findByText('Desk lamp')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mark sold' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'List for sale' })).toBeOnTheScreen();
    for (const label of ['I listed it elsewhere', 'Returned it', 'Write off', 'Undo bought']) {
      expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
    }
    expect(await screen.findByText('Added by you')).toBeOnTheScreen();
  });

  it('Undo bought asks first, then cancels through the API', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'Undo bought' }));
    expect(alert).toHaveBeenCalledWith('Undo this purchase?', expect.any(String), expect.any(Array));
    expect(mockApi.cancelInventoryItem).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]![2]!;
    await act(async () => {
      await buttons.find((b) => b.style === 'destructive')!.onPress!();
    });
    expect(mockApi.cancelInventoryItem).toHaveBeenCalledWith(ID);
    expect(await screen.findByText('Purchase undone. It stays in your history.')).toBeOnTheScreen();
  });

  it('cancelled: only Back in stock is offered, with the closure card', async () => {
    mockItem = item({
      status: 'CANCELLED',
      holding: false,
      actions: ['reopen'],
      closure: { status: 'CANCELLED', closedAt: AT, note: null, refund: null, result: null },
    });
    render();
    expect(await screen.findByRole('button', { name: 'Back in stock' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Mark sold' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo bought' })).toBeNull();
    expect(screen.getByText("Cancelled purchases are kept in your history but left out of your figures.")).toBeOnTheScreen();
  });

  it('live on a marketplace: no Undo bought, and the page says why', async () => {
    mockItem = item({
      status: 'LISTED',
      actions: ['edit_purchase', 'list_for_sale', 'mark_sold', 'return', 'write_off'],
      sellListing: { id: 'l1', status: 'PUBLISHED', price: ZAR(250_00), channels: [{ marketplace: 'ebay', status: 'PUBLISHED' }], activeChannels: 1, removeManually: [] },
    });
    render();
    expect(await screen.findByRole('button', { name: 'Manage listing' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Undo bought' })).toBeNull();
    expect(screen.getByText("It's live on a marketplace - take the listing down in Sell first.")).toBeOnTheScreen();
  });
});
