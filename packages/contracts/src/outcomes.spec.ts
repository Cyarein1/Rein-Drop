import { describe, expect, it } from 'vitest';
import { markDealBoughtRequestSchema } from './deals.js';
import {
  compareAmounts,
  realizedResult,
  recordSaleRequestSchema,
  replacePurchaseCostsRequestSchema,
  updateInventoryItemRequestSchema,
} from './outcomes.js';

const zar = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });
const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

describe('realizedResult', () => {
  it('is sale price minus purchase price when there are no costs', () => {
    const r = realizedResult({ purchasePrice: zar(100_00), purchaseCosts: [], salePrice: zar(150_00), saleCosts: [] });
    expect(r).toEqual({
      status: 'ok',
      costBasis: zar(100_00),
      netProceeds: zar(150_00),
      realizedProfit: zar(50_00),
      marginPercent: 33,
      returnPercent: 50,
    });
  });

  it('subtracts purchase costs (tax, shipping, repair) and selling costs (fees, shipping)', () => {
    const r = realizedResult({
      purchasePrice: zar(1000_00),
      purchaseCosts: [zar(150_00), zar(80_00), zar(120_00)], // tax, shipping in, repair
      salePrice: zar(2000_00),
      saleCosts: [zar(200_00), zar(30_00), zar(100_00)], // marketplace fee, payment fee, shipping out
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.costBasis).toEqual(zar(1350_00));
    expect(r.netProceeds).toEqual(zar(1670_00));
    expect(r.realizedProfit).toEqual(zar(320_00));
    expect(r.marginPercent).toBe(16); // 320 / 2000
    expect(r.returnPercent).toBe(23); // 320 / 1350 = 23.7 -> toward zero
  });

  it('reports a realized loss as a negative profit', () => {
    const r = realizedResult({ purchasePrice: zar(500_00), purchaseCosts: [zar(50_00)], salePrice: zar(520_00), saleCosts: [zar(60_00)] });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.realizedProfit).toEqual(zar(-90_00));
    expect(r.marginPercent).toBe(-17); // -90 / 520 = -17.3 -> toward zero
    expect(r.returnPercent).toBe(-16); // -90 / 550 = -16.4
  });

  it('can be a loss purely from fees even when sold above the purchase price', () => {
    const r = realizedResult({ purchasePrice: zar(100_00), purchaseCosts: [], salePrice: zar(110_00), saleCosts: [zar(15_00)] });
    expect(r.status === 'ok' && r.realizedProfit.amountMinor).toBe(-5_00);
  });

  it('breaks even at zero', () => {
    const r = realizedResult({ purchasePrice: zar(100_00), purchaseCosts: [zar(10_00)], salePrice: zar(120_00), saleCosts: [zar(10_00)] });
    expect(r.status === 'ok' && r.realizedProfit.amountMinor).toBe(0);
  });

  it('works in integer minor units (no floating-point drift)', () => {
    const r = realizedResult({ purchasePrice: zar(10), purchaseCosts: [zar(20)], salePrice: zar(60), saleCosts: [zar(1)] });
    expect(r.status === 'ok' && r.realizedProfit.amountMinor).toBe(29);
  });

  it('never mixes currencies', () => {
    expect(realizedResult({ purchasePrice: usd(100_00), purchaseCosts: [], salePrice: zar(2000_00), saleCosts: [] })).toEqual({
      status: 'unavailable',
      reason: 'currency_mismatch',
    });
    expect(realizedResult({ purchasePrice: zar(100_00), purchaseCosts: [usd(1_00)], salePrice: zar(200_00), saleCosts: [] }).status).toBe('unavailable');
    expect(realizedResult({ purchasePrice: zar(100_00), purchaseCosts: [], salePrice: zar(200_00), saleCosts: [usd(1_00)] }).status).toBe('unavailable');
  });

  it('only measures what happened: missed potential is not an input at all', () => {
    // An item that sold below an estimated resale is still a realized profit of (sale - costs);
    // the difference to the estimate is a comparison, not a loss.
    const r = realizedResult({ purchasePrice: zar(100_00), purchaseCosts: [], salePrice: zar(130_00), saleCosts: [] });
    expect(r.status === 'ok' && r.realizedProfit.amountMinor).toBe(30_00);
    const vsEstimate = compareAmounts(zar(200_00), zar(130_00));
    expect(vsEstimate.difference).toEqual(zar(-70_00));
  });
});

describe('compareAmounts', () => {
  it('has no difference when either side is missing or currencies differ', () => {
    expect(compareAmounts(null, zar(1)).difference).toBeNull();
    expect(compareAmounts(zar(1), null).difference).toBeNull();
    expect(compareAmounts(usd(1), zar(1)).difference).toBeNull();
    expect(compareAmounts(zar(100), zar(80))).toEqual({ expected: zar(100), actual: zar(80), difference: zar(-20) });
  });
});

describe('request schemas', () => {
  it('Mark Sold needs a positive price and costs in the same currency, from the selling categories', () => {
    const base = { price: zar(100_00), soldAt: '2026-10-01T10:00:00.000Z' };
    expect(recordSaleRequestSchema.parse(base)).toEqual({ ...base, marketplace: null, costs: [] });
    expect(recordSaleRequestSchema.safeParse({ ...base, price: zar(0) }).success).toBe(false);
    expect(recordSaleRequestSchema.safeParse({ ...base, costs: [{ category: 'MARKETPLACE_FEE', amount: usd(1_00) }] }).success).toBe(false);
    expect(recordSaleRequestSchema.safeParse({ ...base, costs: [{ category: 'TAX', amount: zar(1_00) }] }).success).toBe(false);
    expect(recordSaleRequestSchema.safeParse({ ...base, costs: [{ category: 'MARKETPLACE_FEE', amount: zar(-1) }] }).success).toBe(false);
    expect(recordSaleRequestSchema.safeParse({ ...base, costs: [{ category: 'PAYMENT_FEE', amount: zar(5_00) }] }).success).toBe(true);
  });

  it('purchase costs come from the purchase categories', () => {
    expect(replacePurchaseCostsRequestSchema.safeParse({ costs: [{ category: 'TAX', amount: zar(1) }, { category: 'REPAIR', amount: zar(2) }] }).success).toBe(true);
    expect(replacePurchaseCostsRequestSchema.safeParse({ costs: [{ category: 'MARKETPLACE_FEE', amount: zar(1) }] }).success).toBe(false);
    expect(replacePurchaseCostsRequestSchema.safeParse({ costs: [] }).success).toBe(true);
  });

  it('an inventory update needs at least one field and only allows holding statuses', () => {
    expect(updateInventoryItemRequestSchema.safeParse({}).success).toBe(false);
    expect(updateInventoryItemRequestSchema.safeParse({ status: 'LISTED' }).success).toBe(true);
    expect(updateInventoryItemRequestSchema.safeParse({ status: 'SOLD' }).success).toBe(false);
    expect(updateInventoryItemRequestSchema.safeParse({ notes: null }).success).toBe(true);
  });

  it('Bought accepts optional purchase costs in one currency', () => {
    expect(markDealBoughtRequestSchema.safeParse({}).success).toBe(true);
    expect(markDealBoughtRequestSchema.safeParse({ price: zar(100_00), costs: [{ category: 'SHIPPING', amount: zar(50_00) }] }).success).toBe(true);
    expect(markDealBoughtRequestSchema.safeParse({ price: zar(100_00), costs: [{ category: 'SHIPPING', amount: usd(50_00) }] }).success).toBe(false);
    expect(
      markDealBoughtRequestSchema.safeParse({ costs: [{ category: 'TAX', amount: zar(1) }, { category: 'SHIPPING', amount: usd(1) }] }).success,
    ).toBe(false);
  });
});
