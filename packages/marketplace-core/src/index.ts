/**
 * Marketplace boundary. Domain code depends on this package, never on a
 * specific marketplace SDK or API.
 *
 * TODO(marketplace): define the normalized Listing model and the
 * MarketplaceProvider/adapter interface. Fields are intentionally not
 * defined yet - they must come from a product decision, not be invented.
 * TODO(marketplace): FacebookDataProvider implementation source is TBD.
 */

/** Launch marketplaces, per the project contract. */
export const MARKETPLACE_IDS = ['ebay', 'facebook'] as const;

export type MarketplaceId = (typeof MARKETPLACE_IDS)[number];

export function isMarketplaceId(value: unknown): value is MarketplaceId {
  return typeof value === 'string' && (MARKETPLACE_IDS as readonly string[]).includes(value);
}
