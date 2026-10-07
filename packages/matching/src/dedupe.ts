import type { MarketplaceId, Money } from '@rein-drop/marketplace-core';
import { normalizeText, significantTokens } from './text.js';

/**
 * Heuristic duplicate detection, on top of source identity (marketplace + externalId, which the
 * database already enforces).
 *
 * Deliberately conservative - a false merge would hide a real listing:
 * - same significant title words (order-insensitive), exact same price and currency;
 * - same location text; without a location, only within one marketplace (seller relists);
 * - no key at all for listings without a price or with fewer than 3 significant title words
 *   ("iPhone" alone is too generic to call two listings the same).
 */
export interface DedupeInput {
  marketplace: MarketplaceId;
  title: string;
  price: Money | null;
  locationText: string | null;
}

export const MIN_DEDUPE_TITLE_WORDS = 3;

export function dedupeKeyFor(listing: DedupeInput): string | null {
  if (!listing.price) return null;
  const words = significantTokens(listing.title).sort();
  if (words.length < MIN_DEDUPE_TITLE_WORDS) return null;
  const location = listing.locationText ? normalizeText(listing.locationText).replace(/\s+/g, ' ').trim() : '';
  const scope = location ? `loc:${location}` : `mkt:${listing.marketplace}`;
  return [scope, listing.price.currency, listing.price.amountMinor, words.join(' ')].join('|');
}

export interface DedupeCandidate {
  id: string;
  firstSeenAt: Date;
}

/** The listing that represents a duplicate group: first seen, then lowest id (stable). */
export function canonicalOf<T extends DedupeCandidate>(members: readonly T[]): T | null {
  return (
    [...members].sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ??
    null
  );
}
