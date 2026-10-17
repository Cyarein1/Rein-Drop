import { z } from 'zod';
import { idSchema, isoDateTimeSchema, marketplaceKeySchema, moneySchema } from './common.js';

/**
 * Item lifecycle without deleting (decision 0021, step 90). An inventory item is never deleted:
 * mistakes and endings are statuses, and every change is an item event (the audit trail).
 *
 * State machine - the ONE definition, used by the API (to allow / refuse) and by the apps (which
 * buttons to show):
 *
 *   IN_STOCK  --mark_listed-->  LISTED  --mark_unlisted--> IN_STOCK   (listed elsewhere, by hand)
 *   IN_STOCK | LISTED  --mark_sold-->  SOLD  --undo_sale-->  IN_STOCK (listings stay ended)
 *   IN_STOCK | LISTED  --return-->     RETURNED     --reopen--> IN_STOCK
 *   IN_STOCK | LISTED  --write_off-->  WRITTEN_OFF  --reopen--> IN_STOCK
 *   IN_STOCK | LISTED  --cancel-->     CANCELLED    --reopen--> IN_STOCK
 *     cancel ("bought by mistake" / undo bought) only while nothing is live on a marketplace;
 *     an item from a deal re-opens that deal (it shows as not bought), and reopen marks it bought again.
 *   SOLD: correct_sale (same status). Every status but CANCELLED: edit_purchase.
 *   Return / write-off end the item's live marketplace listings (like a sale does).
 *
 * How each status counts (outcomes ledger + analytics):
 *   IN_STOCK / LISTED  holding - neither profit nor loss.
 *   SOLD               realized result of the sale (sale - selling costs - purchase - purchase costs).
 *   RETURNED           realized result = refund - (purchase price + purchase costs).
 *   WRITTEN_OFF        realized result = -(purchase price + purchase costs): a realized loss.
 *   CANCELLED          left out of everything (not a purchase, not spent, no result).
 */

/** Mirrors the InventoryStatus database enum (checked by a test in apps/api). */
export const INVENTORY_STATUSES = ['IN_STOCK', 'LISTED', 'SOLD', 'RETURNED', 'WRITTEN_OFF', 'CANCELLED'] as const;
export const inventoryStatusSchema = z.enum(INVENTORY_STATUSES);
export type InventoryStatus = z.infer<typeof inventoryStatusSchema>;
/** Holding = bought and not sold yet (neither profit nor loss). */
export const HOLDING_STATUSES = ['IN_STOCK', 'LISTED'] as const;
/** Ended without a sale: returned, written off, or cancelled (bought by mistake). */
export const CLOSED_STATUSES = ['RETURNED', 'WRITTEN_OFF', 'CANCELLED'] as const;
export type ClosedStatus = (typeof CLOSED_STATUSES)[number];

export const INVENTORY_ACTIONS = [
  'edit_purchase',
  'mark_listed',
  'mark_unlisted',
  'list_for_sale',
  'mark_sold',
  'correct_sale',
  'undo_sale',
  'return',
  'write_off',
  'cancel',
  'reopen',
] as const;
export const inventoryActionSchema = z.enum(INVENTORY_ACTIONS);
export type InventoryAction = z.infer<typeof inventoryActionSchema>;

/** Where each action leads from each status (absent = not allowed). Same status = an edit. */
export const INVENTORY_TRANSITIONS: Record<InventoryStatus, Partial<Record<InventoryAction, InventoryStatus>>> = {
  IN_STOCK: {
    edit_purchase: 'IN_STOCK',
    mark_listed: 'LISTED',
    list_for_sale: 'IN_STOCK',
    mark_sold: 'SOLD',
    return: 'RETURNED',
    write_off: 'WRITTEN_OFF',
    cancel: 'CANCELLED',
  },
  LISTED: {
    edit_purchase: 'LISTED',
    mark_unlisted: 'IN_STOCK',
    list_for_sale: 'LISTED',
    mark_sold: 'SOLD',
    return: 'RETURNED',
    write_off: 'WRITTEN_OFF',
    cancel: 'CANCELLED',
  },
  SOLD: { edit_purchase: 'SOLD', correct_sale: 'SOLD', undo_sale: 'IN_STOCK' },
  RETURNED: { edit_purchase: 'RETURNED', reopen: 'IN_STOCK' },
  WRITTEN_OFF: { edit_purchase: 'WRITTEN_OFF', reopen: 'IN_STOCK' },
  CANCELLED: { reopen: 'IN_STOCK' },
};

/** What the state machine needs to know about an item besides its status. */
export interface LifecycleFacts {
  status: InventoryStatus;
  /** Marketplace listings that are live or waiting for the seller to post (published / awaiting). */
  activeChannels: number;
}

/** Why an action is refused, or null when it is allowed. */
export type ActionBlock = 'not_from_this_status' | 'live_on_marketplace';

export function actionBlock(action: InventoryAction, facts: LifecycleFacts): ActionBlock | null {
  if (!INVENTORY_TRANSITIONS[facts.status][action]) return 'not_from_this_status';
  // Undo bought only while nothing is live: a buyer may already be looking at it.
  if (action === 'cancel' && facts.activeChannels > 0) return 'live_on_marketplace';
  // "I took it down elsewhere" is for listings made outside Rein Drop; live channels are ended in Sell.
  if (action === 'mark_unlisted' && facts.activeChannels > 0) return 'live_on_marketplace';
  return null;
}

/** Every action allowed right now, in INVENTORY_ACTIONS order. */
export function inventoryActions(facts: LifecycleFacts): InventoryAction[] {
  return INVENTORY_ACTIONS.filter((a) => actionBlock(a, facts) === null);
}

export const isHoldingStatus = (status: InventoryStatus) => (HOLDING_STATUSES as readonly string[]).includes(status);
export const isClosedStatus = (status: InventoryStatus): status is ClosedStatus => (CLOSED_STATUSES as readonly string[]).includes(status);

// ---------------------------------------------------------------------------
// Item events (audit trail / timeline)
// ---------------------------------------------------------------------------

/** Mirrors the InventoryEventType database enum (checked by a test in apps/api). */
export const INVENTORY_EVENT_TYPES = [
  'BOUGHT',
  'ADDED_MANUALLY',
  'PURCHASE_EDITED',
  'COSTS_EDITED',
  'LISTED',
  'UNLISTED',
  'LISTING_STARTED',
  'PUBLISHED',
  'CHANNEL_ENDED',
  'SOLD',
  'SALE_CORRECTED',
  'SALE_UNDONE',
  'RETURNED',
  'WRITTEN_OFF',
  'CANCELLED',
  'REOPENED',
  'LISTING_DISCARDED',
  'LISTING_RESTORED',
] as const;
export const inventoryEventTypeSchema = z.enum(INVENTORY_EVENT_TYPES);
export type InventoryEventType = z.infer<typeof inventoryEventTypeSchema>;

/** Where a change came from: the web app, the phone app (x-client-platform header), or Rein Drop itself. */
export const EVENT_SOURCES = ['web', 'mobile', 'system'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];
/** Header the apps send so item events record where a change was made ("web" | "mobile"). */
export const CLIENT_PLATFORM_HEADER = 'x-client-platform';

/** Why a marketplace listing ended. */
export const CHANNEL_END_REASONS = ['user', 'sold_here', 'sold_elsewhere', 'returned', 'written_off'] as const;
export type ChannelEndReason = (typeof CHANNEL_END_REASONS)[number];

export const WRITE_OFF_REASONS = ['lost', 'broken', 'unsellable', 'other'] as const;
export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

/**
 * Small facts about one change (every field optional; which ones appear depends on the type):
 * BOUGHT { dealId, price, marketplace } · ADDED_MANUALLY { price, marketplace | where }
 * PURCHASE_EDITED { fields, before, price } · COSTS_EDITED { count, total }
 * LISTING_STARTED / LISTING_DISCARDED / LISTING_RESTORED { listingId }
 * PUBLISHED { listingId, marketplace, simulated } · CHANNEL_ENDED { listingId, marketplace, reason, removeManually }
 * SOLD / SALE_CORRECTED { price, marketplace, via, endedChannels, removeManually } · SALE_UNDONE { price }
 * RETURNED { refund, note } · WRITTEN_OFF { reason, note } · CANCELLED { dealReopened, note } · REOPENED { from }
 * Backfilled history (written by the step 90 migration) has `backfilled: true`.
 */
export const inventoryEventDetailsSchema = z
  .object({
    dealId: idSchema,
    listingId: idSchema,
    price: moneySchema,
    before: moneySchema,
    refund: moneySchema,
    total: moneySchema,
    count: z.number().int(),
    marketplace: marketplaceKeySchema,
    where: z.string(),
    fields: z.array(z.string()),
    via: z.enum(['inventory', 'listing']),
    reason: z.string(),
    note: z.string(),
    simulated: z.boolean(),
    endedChannels: z.array(marketplaceKeySchema),
    removeManually: z.array(marketplaceKeySchema),
    dealReopened: z.boolean(),
    from: inventoryStatusSchema,
    backfilled: z.boolean(),
  })
  .partial();
export type InventoryEventDetails = z.infer<typeof inventoryEventDetailsSchema>;

export const inventoryEventSchema = z.object({
  id: idSchema,
  type: inventoryEventTypeSchema,
  at: isoDateTimeSchema,
  /** null = not known (e.g. a client that doesn't send x-client-platform). */
  source: z.enum(EVENT_SOURCES).nullable(),
  details: inventoryEventDetailsSchema,
});
export type InventoryEvent = z.infer<typeof inventoryEventSchema>;

/** `GET /inventory/:id/events` - the item's timeline, oldest first. */
export const inventoryEventListSchema = z.object({ items: z.array(inventoryEventSchema) });
export type InventoryEventList = z.infer<typeof inventoryEventListSchema>;
