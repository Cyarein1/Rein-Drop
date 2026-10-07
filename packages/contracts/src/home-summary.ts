import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';

const count = z.number().int().min(0);

/**
 * `GET /me/home-summary` - at-a-glance numbers for the returning-user home
 * (App Flow Blueprint, section 8).
 *
 * Only counts derivable from existing tables. TODO(product): profit / bought /
 * sold snapshot for the current period once its definition is agreed.
 */
export const homeSummarySchema = z.object({
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
export type HomeSummary = z.infer<typeof homeSummarySchema>;
