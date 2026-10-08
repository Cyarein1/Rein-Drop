import { MarketplaceError } from '../../errors.js';
import type { SourceHealthStatus } from '../../health.js';
import type { ListingStatus } from '../../listing.js';
import type { CancellationSignal, MarketplaceSearchCriteria } from '../../search.js';
import { DEV_CASES, DEV_PRODUCTS, matchingProducts, type DevCase, type DevProduct } from './catalogue.js';

/**
 * Shared engine behind the development eBay adapter and Facebook data provider: deterministic
 * synthetic listings that age with the clock, keyset pagination and controlled failure
 * scenarios. No network, no credentials. Nothing here imitates a real marketplace API format.
 */

/** Reserved `.invalid` domain: development links can never reach a real site. */
export const DEV_HOST = 'https://dev-listings.reindrop.invalid';

/**
 * Controlled source behaviours for exercising error / degraded / empty states locally.
 * - normal: healthy, full results.
 * - empty: healthy, no results for any query.
 * - degraded: health `degraded`; searches return a short first page only (no more pages),
 *   flagged `partial`.
 * - slow: health `degraded`; full results, but every request takes DEV_SLOW_LATENCY_MS longer.
 * - flaky: health `degraded`; every other request fails UNAVAILABLE (retryable) - exercises retry.
 * - rate_limited: health `degraded` with retryAfter; searches fail RATE_LIMITED (retryable).
 * - unavailable: health `down`; searches fail UNAVAILABLE (retryable).
 * - not_configured: health `not_configured`; searches fail NOT_CONFIGURED.
 * - invalid_response: the source returns records with no id; the adapter rejects them
 *   (INVALID_RESPONSE).
 * - malformed_payloads: every 4th record has a payload that can't be read; normalization
 *   returns FAILED for those.
 */
export const DEV_SCENARIOS = [
  'normal',
  'empty',
  'degraded',
  'rate_limited',
  'unavailable',
  'not_configured',
  'invalid_response',
  'malformed_payloads',
  'slow',
  'flaky',
] as const;

/** Extra delay of the `slow` scenario. */
export const DEV_SLOW_LATENCY_MS = 6_000;
export type DevScenario = (typeof DEV_SCENARIOS)[number];

export function isDevScenario(value: unknown): value is DevScenario {
  return typeof value === 'string' && (DEV_SCENARIOS as readonly string[]).includes(value);
}

export interface DevSourceOptions {
  scenario?: DevScenario;
  /** Currency for listings when the search has no max price (default USD). */
  currency?: string;
  now?: () => Date;
  /** Moment the synthetic listings are aged from (default: construction time). */
  epoch?: Date;
  /** Simulated network latency per request, in ms (default 0). The `slow` scenario adds more. */
  latencyMs?: number;
}

// This package has no DOM / Node typings; timers exist on every runtime it targets.
const timers = globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown };
const ABORT_POLL_MS = 50;

/**
 * Waits like a network call would. CancellationSignal has no events, so the wait is sliced and
 * the signal checked between slices: an abort rejects within ABORT_POLL_MS.
 */
export async function devDelay(ms: number, signal?: CancellationSignal): Promise<void> {
  let left = ms;
  while (left > 0) {
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    const slice = Math.min(left, ABORT_POLL_MS);
    await new Promise<void>((resolve) => timers.setTimeout(resolve, slice));
    left -= slice;
  }
  if (signal?.aborted) throw signal.reason ?? new Error('aborted');
}

/** Total simulated latency for a request under a scenario. */
export const devLatency = (scenario: DevScenario, latencyMs: number) => Math.max(0, latencyMs) + (scenario === 'slow' ? DEV_SLOW_LATENCY_MS : 0);

export type DevMarketplace = 'ebay' | 'facebook';

/** A generated, marketplace-neutral listing; each source turns it into its own payload. */
export interface DevListing {
  id: string;
  product: DevProduct;
  devCase: DevCase;
  title: string;
  description: string;
  /** Major units (e.g. 4500 = R 4 500); null = no price shown. */
  priceMajor: number | null;
  currency: string;
  listedAt: Date;
  /** When it sells / ends; null = stays up. */
  endsAt: Date | null;
  /** Stable 32-bit hash of the id, for deterministic variation. */
  seed: number;
}

/** FNV-1a: stable, dependency-free. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Rough multipliers so development prices look plausible in common local currencies. NOT
 * exchange rates - development data only. Other currencies fall back to USD listings.
 */
const SYNTHETIC_PRICE_SCALE: Readonly<Record<string, number>> = {
  USD: 1,
  EUR: 1,
  GBP: 0.8,
  CAD: 1.4,
  AUD: 1.5,
  NZD: 1.6,
  ZAR: 18,
};

export function listingCurrency(requested: string): string {
  return requested in SYNTHETIC_PRICE_SCALE ? requested : 'USD';
}

import { currencyDigits } from '../money.js';
export { currencyDigits };

/** Asking prices people actually type: R 4 450, $245, $1 150. */
function niceRound(amount: number): number {
  if (amount >= 1000) return Math.round(amount / 50) * 50;
  if (amount >= 100) return Math.round(amount / 5) * 5;
  return Math.max(1, Math.round(amount));
}

export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** currencyDigits(currency));
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export function devListingId(marketplace: DevMarketplace, product: DevProduct, devCase: DevCase): string {
  return `dev-${marketplace}-${product.key}-${devCase.key}`;
}

export function parseDevListingId(
  marketplace: DevMarketplace,
  id: string,
): { product: DevProduct; devCase: DevCase } | null {
  const prefix = `dev-${marketplace}-`;
  if (!id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  for (const product of DEV_PRODUCTS) {
    if (!rest.startsWith(`${product.key}-`)) continue;
    const devCase = DEV_CASES.find((c) => c.key === rest.slice(product.key.length + 1));
    if (devCase && devCase.marketplaces.includes(marketplace)) return { product, devCase };
  }
  return null;
}

export function buildDevListing(
  marketplace: DevMarketplace,
  product: DevProduct,
  devCase: DevCase,
  context: { currency: string; epoch: Date },
): DevListing {
  const id = devListingId(marketplace, product, devCase);
  const seed = hash(id);
  const currency = listingCurrency(context.currency);
  // +-5% so equal cases across products don't all land on the same ratio.
  const jitter = 1 + ((seed % 11) - 5) / 100;
  const priceMajor =
    devCase.priceFactor === null
      ? null
      : niceRound(product.typicalUsd * devCase.priceFactor * jitter * (SYNTHETIC_PRICE_SCALE[currency] ?? 1));
  // Products are staggered by a few minutes so results interleave by freshness.
  const productIndex = DEV_PRODUCTS.indexOf(product);
  const listedAt = new Date(context.epoch.getTime() - (devCase.ageMinutes + productIndex * 3) * 60_000);
  const endsAt = devCase.lifetimeMinutes === null ? null : new Date(listedAt.getTime() + devCase.lifetimeMinutes * 60_000);
  const title = devCase.faulty ? `${product.title} - for parts` : devCase.condition === 'new' ? `NEW ${product.title} sealed` : product.title;
  return { id, product, devCase, title, description: devCase.description(product.title), priceMajor, currency, listedAt, endsAt, seed };
}

export function isActiveAt(listing: DevListing, at: Date): boolean {
  return listing.endsAt === null || at.getTime() < listing.endsAt.getTime();
}

/** Status a listing has at a moment: how sold / ended / removed listings show up on refresh. */
export function statusAt(listing: DevListing, marketplace: DevMarketplace, at: Date): ListingStatus {
  if (isActiveAt(listing, at)) return 'ACTIVE';
  if (marketplace === 'ebay') return listing.devCase.auction ? 'ENDED' : 'SOLD';
  return listing.devCase.key === 'new-sealed' ? 'REMOVED' : 'SOLD';
}

/**
 * Active listings matching the criteria, newest first. Applies only the filters it is given
 * (adapters pass just the ones their capabilities support).
 */
export function devSearch(
  marketplace: DevMarketplace,
  criteria: MarketplaceSearchCriteria,
  context: { currency: string; epoch: Date; now: Date },
): DevListing[] {
  const currency = criteria.maxPrice?.currency ?? context.currency;
  return matchingProducts(criteria.query)
    .flatMap((product) =>
      DEV_CASES.filter((c) => c.marketplaces.includes(marketplace)).map((c) =>
        buildDevListing(marketplace, product, c, { currency, epoch: context.epoch }),
      ),
    )
    .filter((l) => isActiveAt(l, context.now))
    .filter((l) => criteria.conditions.length === 0 || criteria.conditions.includes(l.devCase.condition))
    .filter((l) => {
      const max = criteria.maxPrice;
      // Unpriced listings and listings in another currency are left for Hunt matching to judge.
      if (!max || l.priceMajor === null || l.currency !== max.currency) return true;
      return toMinor(l.priceMajor, l.currency) <= max.amountMinor;
    })
    .sort(newestFirst);
}

function newestFirst(a: { listedAt: Date; id: string }, b: { listedAt: Date; id: string }): number {
  return b.listedAt.getTime() - a.listedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Pagination (keyset: stable even when listings sell between pages)
// ---------------------------------------------------------------------------

const CURSOR = /^k1\.(\d+)\.(.+)$/;

export function keysetPage<T extends { id: string; listedAt: Date }>(
  items: readonly T[],
  cursor: string | null,
  limit: number,
  source: { marketplace: DevMarketplace; provider: string },
): { page: T[]; nextCursor: string | null } {
  let rest = items;
  if (cursor !== null) {
    const match = CURSOR.exec(cursor);
    if (!match) {
      throw new MarketplaceError('UNSUPPORTED_CRITERIA', 'Unrecognised cursor', { ...source, details: ['cursor: Not recognised'] });
    }
    const after = { listedAt: new Date(Number(match[1])), id: match[2]! };
    rest = items.filter((item) => newestFirst(after, item) < 0);
  }
  const page = rest.slice(0, limit);
  const last = page.at(-1);
  return {
    page,
    nextCursor: rest.length > limit && last ? `k1.${last.listedAt.getTime()}.${last.id}` : null,
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export function scenarioHealth(
  scenario: DevScenario,
  now: Date,
): { status: SourceHealthStatus; message: string | null; retryAfter: Date | null } {
  switch (scenario) {
    case 'degraded':
      return { status: 'degraded', message: 'Development scenario: slow, partial results', retryAfter: null };
    case 'slow':
      return { status: 'degraded', message: 'Development scenario: slow responses', retryAfter: null };
    case 'flaky':
      return { status: 'degraded', message: 'Development scenario: intermittent errors', retryAfter: null };
    case 'rate_limited':
      return { status: 'degraded', message: 'Development scenario: rate limited', retryAfter: new Date(now.getTime() + 60_000) };
    case 'unavailable':
      return { status: 'down', message: 'Development scenario: source unavailable', retryAfter: null };
    case 'not_configured':
      return { status: 'not_configured', message: 'Development scenario: no credentials configured', retryAfter: null };
    default:
      return { status: 'healthy', message: null, retryAfter: null };
  }
}

/**
 * The error a scenario makes a request fail with, if any. `call` is the source's 1-based request
 * count: the flaky scenario fails odd-numbered requests and lets even ones through.
 */
export function scenarioError(
  scenario: DevScenario,
  source: { marketplace: DevMarketplace; provider: string },
  now: Date,
  call = 1,
): MarketplaceError | null {
  switch (scenario) {
    case 'flaky':
      return call % 2 === 1 ? new MarketplaceError('UNAVAILABLE', 'Development scenario: intermittent error', source) : null;
    case 'rate_limited':
      return new MarketplaceError('RATE_LIMITED', 'Development scenario: rate limited', {
        ...source,
        retryAfter: new Date(now.getTime() + 60_000),
      });
    case 'unavailable':
      return new MarketplaceError('UNAVAILABLE', 'Development scenario: source unavailable', source);
    case 'not_configured':
      return new MarketplaceError('NOT_CONFIGURED', 'Development scenario: no credentials configured', source);
    default:
      return null;
  }
}

/** Degraded sources return a short first page and no further pages. */
export function degradedLimit(limit: number): number {
  return Math.max(1, Math.floor(limit / 2));
}
