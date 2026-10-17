import {
  closedResult,
  compareAmounts,
  expectedSnapshotSchema,
  HOLDING_STATUSES,
  inventoryActions,
  isClosedStatus,
  realizedResult,
  type CostCategory,
  type ExpectedSnapshot,
  type InventoryItem,
  type InventoryStatus,
  type MarketplaceKey,
  type Money,
  type SellListingStatus,
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
  // Step 90 (optional so older fixtures stay valid).
  boughtFromMarketplace?: string | null;
  boughtFromText?: string | null;
  closedAt?: Date | null;
  closedNote?: string | null;
  refundMinor?: number | null;
  sellListing?: { id: string; status: SellListingStatus; priceMinor?: number | null; currency?: string | null; channels: ChannelRow[] } | null;
}

export interface ChannelRow {
  marketplace: string;
  status: 'PUBLISHED' | 'AWAITING_CONFIRMATION' | 'FAILED' | 'ENDED';
  removalPending: boolean;
}

/** Live on a marketplace, or waiting for the seller to post it (assisted). */
export const isActiveChannel = (c: Pick<ChannelRow, 'status'>) => c.status === 'PUBLISHED' || c.status === 'AWAITING_CONFIRMATION';

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
  const closedAt = isClosedStatus(row.status) ? (row.closedAt ?? row.updatedAt) : null;
  const heldUntil = sale?.soldAt ?? closedAt ?? now;
  const listing = row.sellListing ?? null;
  const activeChannels = listing ? listing.channels.filter(isActiveChannel).length : 0;
  const refund = row.status === 'RETURNED' ? money(row.refundMinor ?? row.purchasePriceMinor, row.currency) : null;
  const boughtFrom = row.listing
    ? { marketplace: row.listing.marketplace.key as MarketplaceKey, text: null }
    : row.boughtFromMarketplace || row.boughtFromText
      ? { marketplace: (row.boughtFromMarketplace as MarketplaceKey | null | undefined) ?? null, text: row.boughtFromText ?? null }
      : null;

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
    origin: row.huntMatchId ? 'deal' : 'manual',
    boughtFrom,
    closure:
      closedAt && isClosedStatus(row.status)
        ? {
            status: row.status,
            closedAt: closedAt.toISOString(),
            note: row.closedNote ?? null,
            refund,
            // A cancelled item never counts, so it has no result.
            result: row.status === 'CANCELLED' ? null : closedResult({ purchasePrice, purchaseCosts, recovered: refund }),
          }
        : null,
    sellListing: listing
      ? {
          id: listing.id,
          status: listing.status,
          price: listing.priceMinor != null ? money(listing.priceMinor, listing.currency ?? row.currency) : null,
          channels: listing.channels.map((c) => ({ marketplace: c.marketplace as MarketplaceKey, status: c.status })),
          activeChannels,
          removeManually: listing.channels.filter((c) => c.status === 'ENDED' && c.removalPending).map((c) => c.marketplace as MarketplaceKey),
        }
      : null,
    actions: inventoryActions({ status: row.status, activeChannels }),
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
