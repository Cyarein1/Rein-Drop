import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';

const count = z.number().int().min(0);

/**
 * `GET /me/snapshot` - the seller's at-a-glance dashboard numbers.
 *
 * Only counts derivable from existing tables. TODO(product): profit / revenue /
 * sell-through metrics once their definitions are agreed (they depend on how
 * costs are allocated).
 */
export const sellerSnapshotSchema = z.object({
  /** Hunts with status ACTIVE. */
  activeHunts: count,
  /** Hunt matches with status NEW across the seller's hunts. */
  newMatches: count,
  /** Saved deals. */
  savedDeals: count,
  /** Inventory items with status IN_STOCK or LISTED. */
  inventoryOnHand: count,
  generatedAt: isoDateTimeSchema,
});
export type SellerSnapshot = z.infer<typeof sellerSnapshotSchema>;
