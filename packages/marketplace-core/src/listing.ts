import { z } from 'zod';
import { MARKETPLACE_IDS } from './ids.js';
import { jsonValueSchema } from './json.js';

/**
 * The normalized Listing contract: what every adapter must produce from a raw record, whatever
 * the marketplace. Mirrors the `Listing` table (packages/db) minus database-owned columns
 * (id, firstSeenAt, lastSeenAt, timestamps). Only fields common to every marketplace belong here;
 * anything else goes in `sourceMetadata`.
 */

/** Availability on the source marketplace. Mirrors the ListingStatus database enum. */
export const LISTING_STATUSES = ['ACTIVE', 'SOLD', 'ENDED', 'REMOVED', 'UNKNOWN'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/**
 * Condition filter values a search can ask for (also the Hunt condition choices).
 * TODO(marketplace): a normalized condition scale on Listing itself - for now listings keep the
 * source wording in `conditionText`.
 */
export const LISTING_CONDITIONS = ['new', 'used', 'refurbished'] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];

export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO-4217 code');

/** Integer minor units + currency, never floating point. */
export const listingMoneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: currencyCodeSchema,
});
export type Money = z.infer<typeof listingMoneySchema>;

const httpUrl = z.url({ protocol: /^https?$/, error: 'Must be an http(s) URL' });
const optionalText = z.string().trim().min(1).nullable();

export const normalizedListingSchema = z
  .object({
    marketplace: z.enum(MARKETPLACE_IDS),
    /** The marketplace's own id for the listing. Unique per marketplace. */
    externalId: z.string().trim().min(1).max(255),
    /** Link to the listing on its marketplace. */
    url: httpUrl,
    title: z.string().trim().min(1),
    description: z.string().nullable(),
    /** Null when the source shows no price. */
    price: listingMoneySchema.nullable(),
    /** Source wording, not normalized. */
    conditionText: optionalText,
    /** Source wording, not structured. */
    locationText: optionalText,
    imageUrls: z.array(httpUrl),
    status: z.enum(LISTING_STATUSES),
    /** When the seller listed it, if the source exposes it. */
    listedAt: z.date().nullable(),
    /** Marketplace-specific extras worth keeping. Never read by domain logic. */
    sourceMetadata: z.record(z.string(), jsonValueSchema).nullable(),
  })
  .strict();
export type NormalizedListing = z.infer<typeof normalizedListingSchema>;
