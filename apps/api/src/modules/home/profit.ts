import type { Money } from '@rein-drop/contracts';

/**
 * Realized results for a period - recorded purchases and sales only. Nothing here is an
 * estimate, and a deal that wasn't bought never counts (missed potential is not a loss).
 *
 * Currencies are never mixed or converted: results are per currency, and a sale whose purchase
 * price or costs are in another currency is counted as sold but left out of revenue / profit.
 * TODO(outcomes): FX conversion if multi-currency selling becomes common (Build Prompt 30).
 */

export interface PurchaseFact {
  purchasedAt: Date;
  price: Money;
}

export interface SaleFact {
  soldAt: Date;
  salePrice: Money;
  purchasePrice: Money;
  /** Every recorded cost of the item / sale (fees, shipping, repairs...). */
  costs: Money[];
}

export interface CurrencyResult {
  currency: string;
  spent: Money;
  revenue: Money;
  realizedProfit: Money;
  sold: number;
}

export interface ProfitSnapshot {
  bought: number;
  sold: number;
  byCurrency: CurrencyResult[];
}

export function profitSnapshot(purchases: readonly PurchaseFact[], sales: readonly SaleFact[], since: Date): ProfitSnapshot {
  const byCurrency = new Map<string, CurrencyResult>();
  const entry = (currency: string) => {
    let e = byCurrency.get(currency);
    if (!e) {
      const zero = { amountMinor: 0, currency };
      e = { currency, spent: { ...zero }, revenue: { ...zero }, realizedProfit: { ...zero }, sold: 0 };
      byCurrency.set(currency, e);
    }
    return e;
  };

  const inPeriodPurchases = purchases.filter((p) => p.purchasedAt >= since);
  for (const p of inPeriodPurchases) entry(p.price.currency).spent.amountMinor += p.price.amountMinor;

  const inPeriodSales = sales.filter((s) => s.soldAt >= since);
  for (const s of inPeriodSales) {
    const currency = s.salePrice.currency;
    const e = entry(currency);
    e.sold += 1;
    const comparable = s.purchasePrice.currency === currency && s.costs.every((c) => c.currency === currency);
    if (!comparable) continue;
    const costs = s.costs.reduce((sum, c) => sum + c.amountMinor, 0);
    e.revenue.amountMinor += s.salePrice.amountMinor;
    e.realizedProfit.amountMinor += s.salePrice.amountMinor - s.purchasePrice.amountMinor - costs;
  }

  return {
    bought: inPeriodPurchases.length,
    sold: inPeriodSales.length,
    byCurrency: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}
