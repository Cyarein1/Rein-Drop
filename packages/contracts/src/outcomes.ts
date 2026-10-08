import { z } from 'zod';
import { idSchema, isoDateTimeSchema, marketplaceKeySchema, moneySchema, type Money } from './common.js';

/**
 * The reselling ledger: what was bought, what it cost, what it sold for, and the REALIZED result.
 *
 * Accounting rules (App Flow Blueprint section 11):
 * - Realized profit / loss exists only for an item with a recorded sale:
 *   sale price - purchase price - purchase costs - selling costs.
 * - An item not yet sold is "holding": no profit, no loss.
 * - A deal that was never bought (ignored, missed, expired) never enters the ledger, so missed
 *   potential can never become an accounting loss.
 * - Estimates (expected resale / upside) are kept beside the actuals for comparison, never mixed
 *   into them. Currencies are never mixed or converted.
 */

/** Mirrors the CostCategory database enum (checked by a test in apps/api). */
export const COST_CATEGORIES = ['TAX', 'SHIPPING', 'MARKETPLACE_FEE', 'PAYMENT_FEE', 'REPAIR', 'SUPPLIES', 'OTHER'] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];
/** Costs of buying an item. */
export const PURCHASE_COST_CATEGORIES = ['TAX', 'SHIPPING', 'REPAIR', 'SUPPLIES', 'OTHER'] as const;
/** Costs of selling it (shipping here = to your buyer). */
export const SALE_COST_CATEGORIES = ['MARKETPLACE_FEE', 'PAYMENT_FEE', 'SHIPPING', 'OTHER'] as const;

/** Mirrors the InventoryStatus database enum (checked by a test in apps/api). */
export const INVENTORY_STATUSES = ['IN_STOCK', 'LISTED', 'SOLD', 'RETURNED', 'WRITTEN_OFF'] as const;
export const inventoryStatusSchema = z.enum(INVENTORY_STATUSES);
export type InventoryStatus = z.infer<typeof inventoryStatusSchema>;
/** Holding = bought and not sold yet. TODO(outcomes): returns and write-offs. */
export const HOLDING_STATUSES = ['IN_STOCK', 'LISTED'] as const;

const positiveMoney = moneySchema.refine((m) => m.amountMinor > 0, { message: 'Must be more than zero', path: ['amountMinor'] });
const MAX_COSTS = 10;

/** Every cost must be in the same currency as the price it belongs to. */
function costsInCurrency<T extends { costs?: { amount: Money }[] }>(priceOf: (v: T) => Money | undefined) {
  return (value: T, ctx: z.RefinementCtx) => {
    const price = priceOf(value);
    if (!price) return;
    value.costs?.forEach((c, i) => {
      if (c.amount.currency !== price.currency) {
        ctx.addIssue({ code: 'custom', path: ['costs', i, 'amount', 'currency'], message: `Use ${price.currency}, like the price` });
      }
    });
  };
}

export const purchaseCostInputSchema = z.object({
  category: z.enum(PURCHASE_COST_CATEGORIES),
  amount: positiveMoney,
  note: z.string().trim().min(1).max(200).optional(),
});
export const saleCostInputSchema = z.object({
  category: z.enum(SALE_COST_CATEGORIES),
  amount: positiveMoney,
  note: z.string().trim().min(1).max(200).optional(),
});

// ---------------------------------------------------------------------------
// Realized result - the one formula, shared by the API and the Mark Sold preview
// ---------------------------------------------------------------------------

export interface RealizedInput {
  purchasePrice: Money;
  purchaseCosts: readonly Money[];
  salePrice: Money;
  saleCosts: readonly Money[];
}

export type RealizedResult =
  | {
      status: 'ok';
      /** Purchase price + purchase costs. */
      costBasis: Money;
      /** Sale price - selling costs. */
      netProceeds: Money;
      /** netProceeds - costBasis. Negative = a realized loss. */
      realizedProfit: Money;
      /** Realized profit / sale price, whole percent rounded toward zero; null when the sale price is 0. */
      marginPercent: number | null;
      /** Realized profit / cost basis, whole percent rounded toward zero; null when the cost basis is 0. */
      returnPercent: number | null;
    }
  | { status: 'unavailable'; reason: 'currency_mismatch' };

const pct = (part: number, whole: number) => (whole === 0 ? null : Math.trunc((100 * part) / whole));

/** Realized P/L of one sold item, in integer minor units. Never converts currencies. */
export function realizedResult(input: RealizedInput): RealizedResult {
  const currency = input.salePrice.currency;
  const all = [input.purchasePrice, input.salePrice, ...input.purchaseCosts, ...input.saleCosts];
  if (all.some((m) => m.currency !== currency)) return { status: 'unavailable', reason: 'currency_mismatch' };
  const sum = (list: readonly Money[]) => list.reduce((s, m) => s + m.amountMinor, 0);
  const costBasis = input.purchasePrice.amountMinor + sum(input.purchaseCosts);
  const netProceeds = input.salePrice.amountMinor - sum(input.saleCosts);
  const profit = netProceeds - costBasis;
  return {
    status: 'ok',
    costBasis: { amountMinor: costBasis, currency },
    netProceeds: { amountMinor: netProceeds, currency },
    realizedProfit: { amountMinor: profit, currency },
    marginPercent: pct(profit, input.salePrice.amountMinor),
    returnPercent: pct(profit, costBasis),
  };
}

// ---------------------------------------------------------------------------
// Expected (frozen at Bought) vs actual
// ---------------------------------------------------------------------------

/** What Rein Drop expected when the deal was bought. Estimates are labelled as such. */
export const expectedSnapshotSchema = z.object({
  capturedAt: isoDateTimeSchema,
  /** The listing's asking price at the time. */
  askingPrice: moneySchema.nullable(),
  /** Costs the listing stated (e.g. shipping), summed. */
  knownCosts: moneySchema.nullable(),
  /** ESTIMATED typical resale price - only if comparable sales supported one. */
  estimatedResale: moneySchema.nullable(),
  /** ESTIMATED typical upside - only if comparable sales supported one. */
  estimatedUpside: moneySchema.nullable(),
  strength: z.string().nullable(),
  confidence: z.string().nullable(),
});
export type ExpectedSnapshot = z.infer<typeof expectedSnapshotSchema>;

const comparisonSchema = z.object({
  expected: moneySchema.nullable(),
  actual: moneySchema.nullable(),
  /** actual - expected, when both exist in the same currency. */
  difference: moneySchema.nullable(),
});

export function compareAmounts(expected: Money | null, actual: Money | null) {
  const difference =
    expected && actual && expected.currency === actual.currency ? { amountMinor: actual.amountMinor - expected.amountMinor, currency: actual.currency } : null;
  return { expected, actual, difference };
}

// ---------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------

const costSchema = z.object({ id: idSchema, category: z.enum(COST_CATEGORIES), amount: moneySchema, note: z.string().nullable(), incurredAt: isoDateTimeSchema });

export const inventoryItemSchema = z.object({
  id: idSchema,
  title: z.string(),
  status: inventoryStatusSchema,
  /** Bought and not sold yet. */
  holding: z.boolean(),
  notes: z.string().nullable(),
  /** The deal it was bought from (HuntMatch id), when it came through Rein Drop. */
  dealId: idSchema.nullable(),
  source: z.object({ marketplace: marketplaceKeySchema, url: z.string() }).nullable(),
  purchase: z.object({ price: moneySchema, purchasedAt: isoDateTimeSchema, costs: z.array(costSchema), total: moneySchema.nullable() }),
  sale: z
    .object({ price: moneySchema, soldAt: isoDateTimeSchema, marketplace: marketplaceKeySchema.nullable(), costs: z.array(costSchema) })
    .nullable(),
  /** Realized only - null while holding. */
  result: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('ok'),
        costBasis: moneySchema,
        netProceeds: moneySchema,
        realizedProfit: moneySchema,
        marginPercent: z.number().int().nullable(),
        returnPercent: z.number().int().nullable(),
      }),
      z.object({ status: z.literal('unavailable'), reason: z.literal('currency_mismatch') }),
    ])
    .nullable(),
  /** Days from purchase to sale (or to now, while holding). */
  daysHeld: z.number().int().nonnegative(),
  expected: expectedSnapshotSchema.nullable(),
  /** Expected (estimate / asking) vs actual, side by side. */
  comparison: z.object({ purchasePrice: comparisonSchema, salePrice: comparisonSchema, profit: comparisonSchema }),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const listInventoryQuerySchema = z.object({
  status: z.enum(['holding', 'sold', 'all']).default('holding'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: idSchema.optional(),
});
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type ListInventoryQueryInput = z.input<typeof listInventoryQuerySchema>;
export const inventoryPageSchema = z.object({ items: z.array(inventoryItemSchema), nextCursor: z.string().nullable() });

/** `PATCH /inventory/:id` - correct the purchase or move between in stock and listed. */
export const updateInventoryItemRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    purchasePrice: positiveMoney.optional(),
    purchasedAt: isoDateTimeSchema.optional(),
    status: z.enum(HOLDING_STATUSES).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'Provide at least one field to update');
export type UpdateInventoryItemRequest = z.infer<typeof updateInventoryItemRequestSchema>;

/** `PUT /inventory/:id/purchase-costs` - the full list (replaces what was there). */
export const replacePurchaseCostsRequestSchema = z.object({ costs: z.array(purchaseCostInputSchema).max(MAX_COSTS) });
export type ReplacePurchaseCostsRequest = z.infer<typeof replacePurchaseCostsRequestSchema>;

/** `PUT /inventory/:id/sale` - Mark Sold, or correct the recorded sale (replaces it). */
export const recordSaleRequestSchema = z
  .object({
    price: positiveMoney,
    soldAt: isoDateTimeSchema,
    /** Where it sold; null for anywhere else. */
    marketplace: marketplaceKeySchema.nullable().default(null),
    costs: z.array(saleCostInputSchema).max(MAX_COSTS).default([]),
  })
  .superRefine(costsInCurrency((v) => v.price));
export type RecordSaleRequest = z.infer<typeof recordSaleRequestSchema>;
export type RecordSaleRequestInput = z.input<typeof recordSaleRequestSchema>;

/** Optional purchase costs sent with Bought (same rules as above). */
export const boughtCostsSchema = z.array(purchaseCostInputSchema).max(MAX_COSTS);
