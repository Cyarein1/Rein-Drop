import { z } from 'zod';
import { idSchema, isoDateTimeSchema, marketplaceKeySchema, moneyInputSchema, moneySchema, type Money } from './common.js';
import { sellChannelStatusSchema, sellListingSchema, sellListingStatusSchema } from './sell.js';
import { CLOSED_STATUSES, HOLDING_STATUSES, inventoryActionSchema, inventoryStatusSchema, WRITE_OFF_REASONS } from './inventory-lifecycle.js';

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

// Item statuses, the lifecycle state machine and item events: inventory-lifecycle.ts.

const positiveMoney = moneyInputSchema.refine((m) => m.amountMinor > 0, { message: 'Must be more than zero', path: ['amountMinor'] });
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

/**
 * Realized result of an item that ended WITHOUT a sale (decision 0021):
 * RETURNED: refund - (purchase price + purchase costs); WRITTEN_OFF: nothing recovered, so the whole
 * cost basis is a realized loss. CANCELLED items have no result (they are left out entirely).
 */
export type ClosedResult =
  | {
      status: 'ok';
      /** Purchase price + purchase costs. */
      costBasis: Money;
      /** What came back (the refund); zero for a write-off. */
      recovered: Money;
      /** recovered - costBasis (usually negative or zero). */
      realizedProfit: Money;
    }
  | { status: 'unavailable'; reason: 'currency_mismatch' };

export function closedResult(input: { purchasePrice: Money; purchaseCosts: readonly Money[]; recovered: Money | null }): ClosedResult {
  const currency = input.purchasePrice.currency;
  const recovered = input.recovered ?? { amountMinor: 0, currency };
  if ([recovered, ...input.purchaseCosts].some((m) => m.currency !== currency)) return { status: 'unavailable', reason: 'currency_mismatch' };
  const costBasis = input.purchasePrice.amountMinor + input.purchaseCosts.reduce((s, m) => s + m.amountMinor, 0);
  return {
    status: 'ok',
    costBasis: { amountMinor: costBasis, currency },
    recovered,
    realizedProfit: { amountMinor: recovered.amountMinor - costBasis, currency },
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
  /** Days from purchase to sale (or to now, while holding; or to when it was closed). */
  daysHeld: z.number().int().nonnegative(),
  /** deal = marked Bought on a deal; manual = added by hand ("Add item", bought outside Rein Drop). */
  origin: z.enum(['deal', 'manual']),
  /** Where it was bought: a marketplace, or free text ("garage sale"); null when not known. */
  boughtFrom: z.object({ marketplace: marketplaceKeySchema.nullable(), text: z.string().nullable() }).nullable(),
  /** Set when it ended without a sale (RETURNED / WRITTEN_OFF / CANCELLED). */
  closure: z
    .object({
      status: z.enum(CLOSED_STATUSES),
      closedAt: isoDateTimeSchema,
      note: z.string().nullable(),
      /** RETURNED: what the seller refunded. */
      refund: moneySchema.nullable(),
      /** RETURNED / WRITTEN_OFF: the realized result (see closedResult); null for CANCELLED. */
      result: z
        .discriminatedUnion('status', [
          z.object({ status: z.literal('ok'), costBasis: moneySchema, recovered: moneySchema, realizedProfit: moneySchema }),
          z.object({ status: z.literal('unavailable'), reason: z.literal('currency_mismatch') }),
        ])
        .nullable(),
    })
    .nullable(),
  /** Its sell listing (Sell workspace), if one was started. */
  sellListing: z
    .object({
      id: idSchema,
      status: sellListingStatusSchema,
      /** The seller's asking price (null until set). */
      price: moneySchema.nullable(),
      /** Every marketplace it was published to, with that listing's status. */
      channels: z.array(z.object({ marketplace: marketplaceKeySchema, status: sellChannelStatusSchema })),
      /** Marketplaces where it is live or waiting to be posted. */
      activeChannels: z.number().int().nonnegative(),
      /**
       * Ended by Rein Drop, but Rein Drop can't take it down there itself (assisted marketplaces such
       * as Facebook): remind the seller to remove it. Cleared when they confirm.
       */
      removeManually: z.array(marketplaceKeySchema),
    })
    .nullable(),
  /** What can be done with it now (the lifecycle state machine, inventory-lifecycle.ts). */
  actions: z.array(inventoryActionSchema),
  expected: expectedSnapshotSchema.nullable(),
  /** Expected (estimate / asking) vs actual, side by side. */
  comparison: z.object({ purchasePrice: comparisonSchema, salePrice: comparisonSchema, profit: comparisonSchema }),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

/**
 * Sections of the Sell area (step 91) - every item is in exactly one:
 * - holding: IN_STOCK with no sell listing, or only a DISCARDED / ENDED one (nothing being sold);
 * - listed:  IN_STOCK / LISTED with a DRAFT or PUBLISHED sell listing, or LISTED by hand ("listed elsewhere");
 * - sold:    SOLD;
 * - other:   RETURNED / WRITTEN_OFF / CANCELLED.
 */
export const INVENTORY_SECTIONS = ['holding', 'listed', 'sold', 'other'] as const;
export type InventorySection = (typeof INVENTORY_SECTIONS)[number];

export const listInventoryQuerySchema = z.object({
  /**
   * Older filter: holding = in stock / listed (any listing); closed = returned / written off /
   * cancelled; all = everything. Ignored when `section` is given.
   */
  status: z.enum(['holding', 'sold', 'closed', 'all']).default('holding'),
  /** A Sell-area section (INVENTORY_SECTIONS); takes precedence over `status`. */
  section: z.enum(INVENTORY_SECTIONS).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: idSchema.optional(),
});
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type ListInventoryQueryInput = z.input<typeof listInventoryQuerySchema>;
export const inventoryPageSchema = z.object({ items: z.array(inventoryItemSchema), nextCursor: z.string().nullable() });

/** `GET /inventory/counts` - chip counts for the Sell area in one call (right now, not period-based). */
export const inventoryCountsSchema = z.object({
  holding: z.number().int().nonnegative(),
  listed: z.number().int().nonnegative(),
  sold: z.number().int().nonnegative(),
  other: z.number().int().nonnegative(),
  /** Sell listings by tab (Listings section): drafts, active (published), discarded (under drafts). */
  listings: z.object({ drafts: z.number().int().nonnegative(), active: z.number().int().nonnegative(), discarded: z.number().int().nonnegative() }),
});
export type InventoryCounts = z.infer<typeof inventoryCountsSchema>;

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

/** Where something added by hand was bought: a marketplace, or anywhere else in words. */
export const boughtFromInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('marketplace'), marketplace: marketplaceKeySchema }),
  z.object({ kind: z.literal('other'), text: z.string().trim().min(1).max(100) }),
]);
export type BoughtFromInput = z.infer<typeof boughtFromInputSchema>;

/**
 * `POST /inventory` - "Add item": something bought outside Rein Drop. Works like any other item
 * afterwards (list it, sell it, see the result). One currency per item: costs use the price's.
 */
export const createInventoryItemRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    purchasePrice: positiveMoney,
    purchasedAt: isoDateTimeSchema,
    boughtFrom: boughtFromInputSchema.nullable().default(null),
    notes: z.string().trim().max(1000).optional(),
    costs: z.array(purchaseCostInputSchema).max(MAX_COSTS).default([]),
  })
  .superRefine(costsInCurrency((v) => v.purchasePrice));
export type CreateInventoryItemRequest = z.infer<typeof createInventoryItemRequestSchema>;
export type CreateInventoryItemRequestInput = z.input<typeof createInventoryItemRequestSchema>;

const closeNoteSchema = z.string().trim().min(1).max(500).optional();

/**
 * `POST /inventory/:id/return` - returned to the seller / refunded. `refund` defaults to the
 * purchase price (a full refund of the price; purchase costs not refunded); it must be in the
 * item's currency and can be 0.
 */
export const returnItemRequestSchema = z.object({
  refund: moneyInputSchema.optional(),
  returnedAt: isoDateTimeSchema.optional(),
  note: closeNoteSchema,
});
export type ReturnItemRequest = z.infer<typeof returnItemRequestSchema>;

/** `POST /inventory/:id/write-off` - lost, broken or unsellable: its whole cost becomes a realized loss. */
export const writeOffItemRequestSchema = z.object({
  reason: z.enum(WRITE_OFF_REASONS).optional(),
  writtenOffAt: isoDateTimeSchema.optional(),
  note: closeNoteSchema,
});
export type WriteOffItemRequest = z.infer<typeof writeOffItemRequestSchema>;

/**
 * `POST /inventory/:id/cancel` - "bought by mistake" / Undo bought. Only while it has no sale and
 * nothing is live on a marketplace. A deal's item re-opens the deal (shown as not bought again).
 */
export const cancelItemRequestSchema = z.object({ note: closeNoteSchema });
export type CancelItemRequest = z.infer<typeof cancelItemRequestSchema>;

/** `PUT /inventory/:id/purchase-costs` - the full list (replaces what was there). */
export const replacePurchaseCostsRequestSchema = z.object({ costs: z.array(purchaseCostInputSchema).max(MAX_COSTS) });
export type ReplacePurchaseCostsRequest = z.infer<typeof replacePurchaseCostsRequestSchema>;

/**
 * `PUT /inventory/:id/sale` - Mark Sold, or correct the recorded sale (replaces it). Recording a
 * sale also ends the item's live marketplace listings and its sell listing (decision 0021); see
 * `sellListing.removeManually` in the response for listings the seller must take down themselves.
 * Also the body of `POST /sell/listings/:id/sold`.
 */
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

/**
 * `POST /sell/listings/:id/sold` - "Sold on eBay for $X" from a listing. Body: recordSaleRequestSchema
 * (`marketplace` = where it sold: one of the listing's marketplaces or null for elsewhere). Records
 * the sale exactly like PUT /inventory/:id/sale, ends every other live marketplace listing and ends
 * this listing.
 */
export const listingSoldResponseSchema = z.object({
  listing: sellListingSchema,
  item: inventoryItemSchema,
  /** Marketplaces where the seller must take the listing down themselves (assisted, e.g. Facebook). */
  removeManually: z.array(marketplaceKeySchema),
});
export type ListingSoldResponse = z.infer<typeof listingSoldResponseSchema>;

/** `GET /inventory/:id/events`: inventoryEventListSchema (inventory-lifecycle.ts). */
