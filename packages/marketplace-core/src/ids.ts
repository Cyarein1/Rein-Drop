/** Launch marketplaces, per the project contract. */
export const MARKETPLACE_IDS = ['ebay', 'facebook'] as const;

export type MarketplaceId = (typeof MARKETPLACE_IDS)[number];

export function isMarketplaceId(value: unknown): value is MarketplaceId {
  return typeof value === 'string' && (MARKETPLACE_IDS as readonly string[]).includes(value);
}
