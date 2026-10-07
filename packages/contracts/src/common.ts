import { z } from 'zod';
import { MARKETPLACE_IDS } from '@rein-drop/marketplace-core';

/** Entity ids are UUIDs (v7 in practice). */
export const idSchema = z.uuid();

/** Timestamps travel as ISO-8601 UTC strings (e.g. `2026-10-07T01:56:03.275Z`). */
export const isoDateTimeSchema = z.iso.datetime();

/** ISO-4217 code, upper case. */
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO-4217 code');

/** Money as integer minor units (cents) + currency. Never floating point. */
export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: currencySchema,
});
export type Money = z.infer<typeof moneySchema>;

/** Marketplace key (`ebay` | `facebook`), from @rein-drop/marketplace-core. */
export const marketplaceKeySchema = z.enum(MARKETPLACE_IDS);
export type MarketplaceKey = z.infer<typeof marketplaceKeySchema>;

// ---------------------------------------------------------------------------
// Cursor pagination
// ---------------------------------------------------------------------------

export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 100;

/** Query params shared by list endpoints. Coerces because query strings are strings. */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursor: z.string().min(1).optional(),
});

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    /** Null when there are no more pages. */
    nextCursor: z.string().nullable(),
  });
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
