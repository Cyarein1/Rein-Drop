import {
  compareAmounts,
  expectedSnapshotSchema,
  HOLDING_STATUSES,
  realizedResult,
  type CostCategory,
  type ExpectedSnapshot,
  type InventoryItem,
  type InventoryStatus,
  type MarketplaceKey,
  type Money,
} from '@rein-drop/contracts';
import type { DealEconomics } from '@rein-drop/scoring';

/**
 * Pure ledger mapping: database rows -> InventoryItem. The realized result comes only from the
 * shared `realizedResult` formula and only once a sale exists; estimates are carried beside it
 * (`expected` / `comparison`), never mixed into it.
 */

const DAY_MS = 86_400_000;

export interface CostRow {
  id: string;
  category: CostCategory;
  amountMinor: number;
  currency: string;
  note: string | null;
  incurredAt: Date;
}

export interface InventoryRow {
  id: string;
  title: string;
  status: InventoryStatus;
  notes: string | null;
  huntMatchId: string | null;
  purchasePriceMinor: number;
  currency: string;
  purchasedAt: Date;
  expected: unknown;
  createdAt: Date;
  updatedAt: Date;
  listing: { url: string; marketplace: { key: string } } | null;
  costs: CostRow[];
  sale: {
    salePriceMinor: number;
    currency: string;
    soldAt: Date;
    marketplace: { key: string } | null;
    costs: CostRow[];
  } | null;
}

const money = (amountMinor: number, currency: string): Money => ({ amountMinor, currency });
const costMoney = (c: CostRow) => money(c.amountMinor, c.currency);
const toCost = (c: CostRow) => ({ id: c.id, category: c.category, amount: costMoney(c), note: c.note, incurredAt: c.incurredAt.toISOString() });

export const isHolding = (status: InventoryStatus) => (HOLDING_STATUSES as readonly string[]).includes(status);

/** Purchase price + purchase costs, or null if they aren't all in one currency. */
function purchaseTotal(price: Money, costs: readonly Money[]): Money | null {
  if (costs.some((c) => c.currency !== price.currency)) return null;
  return money(price.amountMinor + costs.reduce((s, c) => s + c.amountMinor, 0), price.currency);
}

/** Snapshots written by older code (or hand-edited) are dropped rather than failing the read. */
function parseExpected(value: unknown): ExpectedSnapshot | null {
  if (value === null || value === undefined) return null;
  const parsed = expectedSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function toInventoryItem(row: InventoryRow, now: Date): InventoryItem {
  const purchasePrice = money(row.purchasePriceMinor, row.currency);
  const purchaseCosts = row.costs.map(costMoney);
  const sale = row.sale;
  const salePrice = sale ? money(sale.salePriceMinor, sale.currency) : null;
  const result =
    sale && salePrice ? realizedResult({ purchasePrice, purchaseCosts, salePrice, saleCosts: sale.costs.map(costMoney) }) : null;
  const expected = parseExpected(row.expected);
  const heldUntil = sale?.soldAt ?? now;

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    holding: isHolding(row.status) && !sale,
    notes: row.notes,
    dealId: row.huntMatchId,
    source: row.listing ? { marketplace: row.listing.marketplace.key as MarketplaceKey, url: row.listing.url } : null,
    purchase: {
      price: purchasePrice,
      purchasedAt: row.purchasedAt.toISOString(),
      costs: row.costs.map(toCost),
      total: purchaseTotal(purchasePrice, purchaseCosts),
    },
    sale: sale
      ? {
          price: salePrice!,
          soldAt: sale.soldAt.toISOString(),
          marketplace: (sale.marketplace?.key as MarketplaceKey | undefined) ?? null,
          costs: sale.costs.map(toCost),
        }
      : null,
    result,
    daysHeld: Math.max(0, Math.floor((heldUntil.getTime() - row.purchasedAt.getTime()) / DAY_MS)),
    expected,
    comparison: {
      purchasePrice: compareAmounts(expected?.askingPrice ?? null, purchasePrice),
      salePrice: compareAmounts(expected?.estimatedResale ?? null, salePrice),
      // Expected = the ESTIMATED upside; actual = REALIZED profit, only once sold.
      profit: compareAmounts(expected?.estimatedUpside ?? null, result?.status === 'ok' ? result.realizedProfit : null),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * What Rein Drop expected at the moment of Bought, from the listing and the latest analysis.
 * Estimates are copied only when they exist (comparable sales); nothing is invented.
 */
export function expectedSnapshot(input: {
  asking: Money | null;
  economics: DealEconomics | null;
  strength: string | null;
  confidence: string | null;
  capturedAt: Date;
}): ExpectedSnapshot {
  const { economics } = input;
  const known = economics?.knownCosts ?? [];
  const knownCosts = known.length > 0 ? money(known.reduce((s, c) => s + c.amount.amountMinor, 0), known[0]!.amount.currency) : null;
  return {
    capturedAt: input.capturedAt.toISOString(),
    askingPrice: economics?.asking ?? input.asking,
    knownCosts,
    estimatedResale: economics?.resale.status === 'estimated' ? economics.resale.typical : null,
    estimatedUpside: economics?.estimatedUpside.status === 'estimated' ? economics.estimatedUpside.typical : null,
    strength: input.strength,
    confidence: input.confidence,
  };
}
