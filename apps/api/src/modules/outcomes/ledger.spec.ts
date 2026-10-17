import { computeEconomics, DEFAULT_SCORING_POLICY } from '@rein-drop/scoring';
import { expectedSnapshot, toInventoryItem, type InventoryRow } from './ledger.js';

const zar = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });
const t0 = new Date('2026-09-01T10:00:00.000Z');
const day = (n: number) => new Date(t0.getTime() + n * 86_400_000);
const cost = (category: InventoryRow['costs'][number]['category'], amountMinor: number, currency = 'ZAR') => ({
  id: `00000000-0000-7000-8000-${String(amountMinor).padStart(12, '0')}`,
  category,
  amountMinor,
  currency,
  note: null,
  incurredAt: t0,
});

function row(over: Partial<InventoryRow> = {}): InventoryRow {
  return {
    id: '00000000-0000-7000-8000-000000000001',
    title: 'Switch',
    status: 'IN_STOCK',
    notes: null,
    huntMatchId: '00000000-0000-7000-8000-000000000002',
    purchasePriceMinor: 100_00,
    currency: 'ZAR',
    purchasedAt: t0,
    expected: null,
    createdAt: t0,
    updatedAt: t0,
    listing: { url: 'https://dev.example/1', marketplace: { key: 'ebay' } },
    costs: [],
    sale: null,
    ...over,
  };
}

describe('toInventoryItem', () => {
  it('a held item has no result - holding is neither profit nor loss', () => {
    const item = toInventoryItem(row({ costs: [cost('TAX', 15_00)] }), day(4));
    expect(item).toMatchObject({ holding: true, sale: null, result: null, daysHeld: 4, purchase: { total: zar(115_00) } });
    expect(item.comparison.profit).toEqual({ expected: null, actual: null, difference: null });
  });

  it('a sold item gets the realized result from purchase + selling costs', () => {
    const item = toInventoryItem(
      row({
        status: 'SOLD',
        costs: [cost('SHIPPING', 10_00), cost('REPAIR', 20_00)],
        sale: { salePriceMinor: 200_00, currency: 'ZAR', soldAt: day(6), marketplace: null, costs: [cost('MARKETPLACE_FEE', 20_00), cost('PAYMENT_FEE', 5_00)] },
      }),
      day(30),
    );
    expect(item).toMatchObject({
      holding: false,
      daysHeld: 6,
      result: { status: 'ok', costBasis: zar(130_00), netProceeds: zar(175_00), realizedProfit: zar(45_00) },
    });
  });

  it('a sale in another currency is recorded but its result is unavailable (never converted)', () => {
    const item = toInventoryItem(row({ status: 'SOLD', sale: { salePriceMinor: 20_00, currency: 'USD', soldAt: day(1), marketplace: null, costs: [] } }), day(2));
    expect(item.result).toEqual({ status: 'unavailable', reason: 'currency_mismatch' });
    expect(item.comparison.profit.actual).toBeNull();
  });

  it('drops a malformed expected snapshot instead of failing', () => {
    expect(toInventoryItem(row({ expected: { nonsense: true } }), t0).expected).toBeNull();
  });
});

describe('expectedSnapshot', () => {
  it('copies estimates only when comparable sales produced them', () => {
    const withComps = computeEconomics(
      {
        asking: zar(400_00),
        knownCosts: [{ kind: 'shipping', label: 'Shipping', amount: zar(50_00) }],
        maxPrice: null,
        target: null,
        comparables: { source: 'test', sampleSize: 9, low: zar(500_00), typical: zar(600_00), high: zar(700_00), asOf: t0.toISOString() },
      },
      DEFAULT_SCORING_POLICY,
    );
    expect(expectedSnapshot({ asking: zar(400_00), economics: withComps, strength: 'strong', confidence: 'high', capturedAt: t0 })).toEqual({
      capturedAt: t0.toISOString(),
      askingPrice: zar(400_00),
      knownCosts: zar(50_00),
      estimatedResale: zar(600_00),
      estimatedUpside: zar(150_00),
      strength: 'strong',
      confidence: 'high',
    });

    const noComps = computeEconomics({ asking: zar(400_00), knownCosts: [], maxPrice: null, target: null, comparables: null }, DEFAULT_SCORING_POLICY);
    expect(expectedSnapshot({ asking: zar(400_00), economics: noComps, strength: null, confidence: null, capturedAt: t0 })).toMatchObject({
      knownCosts: null,
      estimatedResale: null,
      estimatedUpside: null,
    });
    // No analysis at all: just the asking price.
    expect(expectedSnapshot({ asking: null, economics: null, strength: null, confidence: null, capturedAt: t0 }).askingPrice).toBeNull();
  });
});

describe('toInventoryItem - lifecycle (decision 0021)', () => {
  it('a written-off item has a realized loss of its whole cost basis, and can only be reopened or edited', () => {
    const item = toInventoryItem(row({ status: 'WRITTEN_OFF', closedAt: day(5), closedNote: 'cracked screen', costs: [cost('REPAIR', 20_00)] }), day(30));
    expect(item).toMatchObject({
      holding: false,
      daysHeld: 5,
      closure: { status: 'WRITTEN_OFF', note: 'cracked screen', refund: null, result: { status: 'ok', costBasis: zar(120_00), recovered: zar(0), realizedProfit: zar(-120_00) } },
      result: null,
      actions: ['edit_purchase', 'reopen'],
    });
  });

  it('a returned item: refund minus cost basis (refund defaults to the price paid)', () => {
    expect(toInventoryItem(row({ status: 'RETURNED', closedAt: day(2), refundMinor: 90_00 }), day(3)).closure).toMatchObject({ refund: zar(90_00), result: { realizedProfit: zar(-10_00) } });
    expect(toInventoryItem(row({ status: 'RETURNED', closedAt: day(2), refundMinor: null }), day(3)).closure?.result).toMatchObject({ realizedProfit: zar(0) });
  });

  it('a cancelled purchase has no result at all and can only be reopened', () => {
    const item = toInventoryItem(row({ status: 'CANCELLED', closedAt: day(1) }), day(3));
    expect(item.closure).toMatchObject({ status: 'CANCELLED', result: null });
    expect(item.actions).toEqual(['reopen']);
  });

  it('a live listing blocks Undo bought and shows the listing summary; manual items show where they were bought', () => {
    const item = toInventoryItem(
      row({
        status: 'LISTED',
        huntMatchId: null,
        listing: null,
        boughtFromText: 'garage sale',
        sellListing: {
          id: 'l1',
          status: 'PUBLISHED',
          priceMinor: 150_00,
          currency: 'ZAR',
          channels: [
            { marketplace: 'ebay', status: 'PUBLISHED', removalPending: false },
            { marketplace: 'facebook', status: 'ENDED', removalPending: true },
          ],
        },
      }),
      day(1),
    );
    expect(item.actions).not.toContain('cancel');
    expect(item).toMatchObject({
      origin: 'manual',
      boughtFrom: { marketplace: null, text: 'garage sale' },
      sellListing: { id: 'l1', status: 'PUBLISHED', price: zar(150_00), activeChannels: 1, removeManually: ['facebook'] },
    });
  });
});
