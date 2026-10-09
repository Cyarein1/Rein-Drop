import type { MarketplaceAdapter } from './adapter.js';
import { isMarketplaceId, type MarketplaceId } from './ids.js';
import { isJsonValue, type JsonValue } from './json.js';
import { normalizedListingSchema, type NormalizedListing } from './listing.js';

/**
 * A listing exactly as a source returned it. Stored append-only (RawListing table) before
 * normalization, so a normalizer bug can be fixed and re-run without fetching again.
 *
 * `payload` is opaque to domain code: only the adapter (or Facebook data provider) that produced
 * it may read it.
 */
export interface RawListingRecord {
  marketplace: MarketplaceId;
  /**
   * Which implementation fetched it (e.g. `mock`). Lets a swapped Facebook provider refuse
   * payloads it doesn't understand. Stored in the RawListing `provider` column.
   */
  provider: string;
  /** The marketplace's own id for the listing. */
  externalId: string;
  /** Unmodified source payload; must be JSON so it can be stored as-is. */
  payload: JsonValue;
  fetchedAt: Date;
}

/**
 * Outcome of normalizing one raw record. Statuses mirror the RawListingStatus database enum
 * (PENDING is the state before normalization runs).
 * - NORMALIZED: produced a valid Listing.
 * - FAILED: the payload is broken or unreadable - worth investigating.
 * - SKIPPED: deliberately not normalized (e.g. written by a different provider).
 */
export type NormalizeResult =
  | { status: 'NORMALIZED'; listing: NormalizedListing }
  | { status: 'FAILED' | 'SKIPPED'; reason: string };

/** Structural problems with a raw record (empty array = valid). */
export function rawListingProblems(raw: RawListingRecord): string[] {
  const problems: string[] = [];
  if (!isMarketplaceId(raw.marketplace)) problems.push(`Unknown marketplace "${String(raw.marketplace)}"`);
  if (typeof raw.provider !== 'string' || raw.provider.trim() === '') problems.push('Missing provider');
  if (typeof raw.externalId !== 'string' || raw.externalId.trim() === '') problems.push('Missing externalId');
  if (!(raw.fetchedAt instanceof Date) || Number.isNaN(raw.fetchedAt.getTime())) problems.push('Invalid fetchedAt');
  if (!isJsonValue(raw.payload)) problems.push('Payload is not JSON-serializable');
  return problems;
}

/**
 * The one way domain code turns a raw record into a Listing. Never throws: a broken payload or
 * a misbehaving adapter becomes a FAILED result with a reason, and the output is checked against
 * the normalized Listing contract before anyone can use it.
 */
export function normalizeRawListing(adapter: MarketplaceAdapter, raw: RawListingRecord): NormalizeResult {
  const problems = rawListingProblems(raw);
  if (problems.length > 0) return { status: 'FAILED', reason: `Invalid raw record: ${problems.join('; ')}` };
  if (raw.marketplace !== adapter.marketplace) {
    return {
      status: 'FAILED',
      reason: `Record is from ${raw.marketplace}, but the ${adapter.marketplace} adapter was asked to normalize it`,
    };
  }

  let result: NormalizeResult;
  try {
    result = adapter.normalize(raw);
  } catch (err) {
    return { status: 'FAILED', reason: `Normalizer threw: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (result.status !== 'NORMALIZED') return result;

  const parsed = normalizedListingSchema.safeParse(result.listing);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    return { status: 'FAILED', reason: `Listing breaks the normalized contract: ${issues.join('; ')}` };
  }
  if (parsed.data.marketplace !== raw.marketplace || parsed.data.externalId !== raw.externalId) {
    return { status: 'FAILED', reason: 'Normalized listing does not match the raw record (marketplace / externalId)' };
  }
  return { status: 'NORMALIZED', listing: parsed.data };
}
