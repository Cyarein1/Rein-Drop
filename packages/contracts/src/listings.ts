import { z } from 'zod';
import { idSchema, isoDateTimeSchema, marketplaceKeySchema, moneySchema } from './common.js';

/** Mirrors the ListingStatus database enum (checked by a test in apps/api). */
export const LISTING_STATUSES = ['ACTIVE', 'SOLD', 'ENDED', 'REMOVED', 'UNKNOWN'] as const;
export const listingStatusSchema = z.enum(LISTING_STATUSES);
export type ListingStatus = z.infer<typeof listingStatusSchema>;

/**
 * Normalized, marketplace-agnostic listing for lists and cards. Contains only
 * fields every marketplace provides - never marketplace-specific data.
 */
export const listingSummarySchema = z.object({
  id: idSchema,
  marketplace: marketplaceKeySchema,
  /** Link to the listing on its marketplace. */
  url: z.url(),
  title: z.string(),
  /** Null when the source shows no price. */
  price: moneySchema.nullable(),
  /** Source wording; not yet normalized across marketplaces. */
  conditionText: z.string().nullable(),
  /** Source wording; not yet structured. */
  locationText: z.string().nullable(),
  /** First image, for thumbnails. */
  imageUrl: z.url().nullable(),
  status: listingStatusSchema,
  listedAt: isoDateTimeSchema.nullable(),
  lastSeenAt: isoDateTimeSchema,
});
export type ListingSummary = z.infer<typeof listingSummarySchema>;

/** Listing with the extra fields needed on a detail screen. */
export const listingDetailSchema = listingSummarySchema.extend({
  description: z.string().nullable(),
  imageUrls: z.array(z.url()),
});
export type ListingDetail = z.infer<typeof listingDetailSchema>;
