import { MarketplaceError, type MarketplaceErrorCode } from '../../errors.js';
import type { MarketplaceId } from '../../ids.js';
import { LISTING_CONDITIONS, type ListingCondition } from '../../listing.js';
import type { MarketplaceSearchCriteria } from '../../search.js';

/**
 * Deterministic fake listings for local development and tests (no network, no credentials).
 * The same query always yields the same listings. URLs use the reserved `.invalid` domain so
 * they can never point at a real site. This is mock data - not the shape of any real API.
 */

export const MOCK_HOST = 'https://mock.reindrop.invalid';

/** Fixed anchor so `listedAt` values never depend on the clock. */
const ANCHOR_MS = Date.UTC(2026, 0, 1);
const HOUR_MS = 3_600_000;

export interface MockItem {
  ref: string;
  title: string;
  /** Null for "price on request" listings (every 9th). */
  priceMinor: number | null;
  currency: string;
  condition: ListingCondition;
  place: string;
  sold: boolean;
  listedAt: Date;
  photo: string;
}

/** FNV-1a: a stable, dependency-free string hash. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function mockCatalogue(
  prefix: string,
  criteria: MarketplaceSearchCriteria,
  options: { totalResults: number; currency: string },
): MockItem[] {
  const query = criteria.query.trim();
  const seed = hash(query.toLowerCase());
  const currency = criteria.maxPrice?.currency ?? options.currency;
  const items: MockItem[] = [];
  for (let n = 0; n < options.totalResults; n += 1) {
    const ref = `${prefix}-${seed.toString(36)}-${n}`;
    items.push({
      ref,
      title: `${query} (mock listing ${n + 1})`,
      priceMinor: n % 9 === 8 ? null : 1_000 + ((seed % 5_000) * 7 + n * 1_373) % 60_000,
      currency,
      condition: LISTING_CONDITIONS[(seed + n) % LISTING_CONDITIONS.length]!,
      place: criteria.location?.text ?? 'Mock City',
      sold: n % 7 === 6,
      listedAt: new Date(ANCHOR_MS - n * HOUR_MS),
      photo: `${MOCK_HOST}/img/${ref}.jpg`,
    });
  }
  // Behave like a source that applies the filters it was given (adapters pass only supported ones).
  return items.filter(
    (item) =>
      (criteria.conditions.length === 0 || criteria.conditions.includes(item.condition)) &&
      (!criteria.maxPrice || item.priceMinor === null || item.priceMinor <= criteria.maxPrice.amountMinor),
  );
}

const CURSOR = /^o:(\d+)$/;

/** Offset cursors (`o:<offset>`). An unknown cursor is a caller error. */
export function mockPage<T>(
  items: T[],
  criteria: MarketplaceSearchCriteria,
  source: { marketplace: MarketplaceId; provider: string },
): { page: T[]; nextCursor: string | null } {
  let offset = 0;
  if (criteria.cursor !== null) {
    const match = CURSOR.exec(criteria.cursor);
    if (!match) {
      throw new MarketplaceError('UNSUPPORTED_CRITERIA', 'Unrecognised cursor', { ...source, details: ['cursor: Not recognised'] });
    }
    offset = Number(match[1]);
  }
  const end = offset + criteria.limit;
  return { page: items.slice(offset, end), nextCursor: end < items.length ? `o:${end}` : null };
}

/** Simulated failure, for exercising error states locally. */
export function mockFailure(code: MarketplaceErrorCode, source: { marketplace: MarketplaceId; provider: string }, now: Date) {
  return new MarketplaceError(code, `Simulated ${code} from the mock source`, {
    ...source,
    retryAfter: code === 'RATE_LIMITED' ? new Date(now.getTime() + 60_000) : null,
  });
}
