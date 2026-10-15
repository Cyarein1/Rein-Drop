import { z } from 'zod';
import { idSchema, isoDateTimeSchema, marketplaceKeySchema, moneyInputSchema, moneySchema } from './common.js';

/**
 * Sell workspace (decision 0019): list a bought inventory item for sale and cross-list it on
 * marketplaces. One sell listing per inventory item; it is written once (manually or with AI help,
 * always editable) and published to one or more marketplaces (one channel each).
 *
 * Beta: open to every account and every marketplace Rein Drop supports (no plan gate yet).
 * Publishing goes through a per-marketplace publisher: eBay is a MOCK until real eBay seller
 * access exists (TODO(sell)); Facebook Marketplace has no listing API, so it is "assisted"
 * (ready-to-paste text + open Facebook, then the seller confirms it's posted).
 */

export const SELL_LISTING_STATUSES = ['DRAFT', 'PUBLISHED', 'ENDED'] as const;
export const sellListingStatusSchema = z.enum(SELL_LISTING_STATUSES);
export type SellListingStatus = z.infer<typeof sellListingStatusSchema>;

/** Mirrors the SellChannelStatus database enum. */
export const SELL_CHANNEL_STATUSES = ['PUBLISHED', 'AWAITING_CONFIRMATION', 'FAILED', 'ENDED'] as const;
export const sellChannelStatusSchema = z.enum(SELL_CHANNEL_STATUSES);
export type SellChannelStatus = z.infer<typeof sellChannelStatusSchema>;

export const LISTING_CONDITIONS = ['new', 'like_new', 'good', 'fair', 'for_parts'] as const;
export const listingConditionSchema = z.enum(LISTING_CONDITIONS);
export type ListingCondition = z.infer<typeof listingConditionSchema>;

export const SELL_TITLE_MAX = 80;
export const SELL_DESCRIPTION_MAX = 4000;
export const SELL_PHOTOS_MAX = 12;
export const SELL_PHOTO_BYTES_MAX = 8 * 1024 * 1024;
export const SELL_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
const SPECIFICS_MAX = 12;

/** How a marketplace is published to: through its API, or assisted (copy + open + confirm). */
export const PUBLISH_MODES = ['api', 'assisted'] as const;
export type PublishMode = (typeof PUBLISH_MODES)[number];

export const sellMarketplaceSchema = z.object({
  marketplace: marketplaceKeySchema,
  label: z.string(),
  mode: z.enum(PUBLISH_MODES),
  /** False while the publisher is a mock (nothing really appears on the marketplace). */
  live: z.boolean(),
  note: z.string(),
});
export type SellMarketplace = z.infer<typeof sellMarketplaceSchema>;

export const sellPhotoSchema = z.object({
  id: idSchema,
  /** own = taken / uploaded by the seller; source = from the listing the item was bought from. */
  source: z.enum(['own', 'source']),
  /**
   * Where to load it: an absolute URL (source photos) or, for own photos, a short-lived signed path on
   * the API ("/media/...") that clients resolve against their API base (photoSrc in client-core).
   */
  url: z.string().min(1),
  /** 0 = cover. */
  position: z.number().int().min(0),
});
export type SellPhoto = z.infer<typeof sellPhotoSchema>;

export const itemSpecificSchema = z.object({ name: z.string().trim().min(1).max(40), value: z.string().trim().min(1).max(80) });
export type ItemSpecific = z.infer<typeof itemSpecificSchema>;

export const sellChannelSchema = z.object({
  marketplace: marketplaceKeySchema,
  mode: z.enum(PUBLISH_MODES),
  status: sellChannelStatusSchema,
  /** The live listing on the marketplace (null until known). */
  url: z.string().url().nullable(),
  /** True when the publisher was a mock - the listing isn't really on the marketplace. */
  simulated: z.boolean(),
  /** Assisted marketplaces: the text to paste and where to post it. */
  assist: z.object({ text: z.string(), openUrl: z.string().url() }).nullable(),
  error: z.string().nullable(),
  publishedAt: isoDateTimeSchema.nullable(),
});
export type SellChannel = z.infer<typeof sellChannelSchema>;

export const sellListingSchema = z.object({
  id: idSchema,
  inventoryItemId: idSchema,
  status: sellListingStatusSchema,
  title: z.string(),
  description: z.string(),
  price: moneySchema.nullable(),
  condition: listingConditionSchema.nullable(),
  itemSpecifics: z.array(itemSpecificSchema),
  photos: z.array(sellPhotoSchema),
  /** Photos of the listing the item was bought from that can still be added. */
  sourcePhotos: z.array(z.string().url()),
  channels: z.array(sellChannelSchema),
  /** The last AI draft was used (shown as "Written with AI - check it"). */
  aiAssisted: z.boolean(),
  /** What still blocks publishing, in words (empty = ready). */
  missing: z.array(z.string()),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type SellListing = z.infer<typeof sellListingSchema>;

/** "List" on an inventory item: returns its sell listing, created on first use. */
export const startSellListingRequestSchema = z.object({ inventoryItemId: idSchema });

export const sellMarketplacesResponseSchema = z.object({
  items: z.array(sellMarketplaceSchema),
  /** Own photo uploads are available (false until photo storage is configured). */
  uploads: z.boolean(),
  /** "Use AI" is available. */
  ai: z.boolean(),
});
export type SellMarketplacesResponse = z.infer<typeof sellMarketplacesResponseSchema>;

export const listSellListingsQuerySchema = z.object({ status: sellListingStatusSchema.optional() });
export const sellListingListSchema = z.object({ items: z.array(sellListingSchema) });

export const updateSellListingRequestSchema = z
  .object({
    title: z.string().trim().max(SELL_TITLE_MAX),
    description: z.string().trim().max(SELL_DESCRIPTION_MAX),
    price: moneyInputSchema.refine((m) => m.amountMinor > 0, { message: 'Must be more than zero', path: ['amountMinor'] }).nullable(),
    condition: listingConditionSchema.nullable(),
    itemSpecifics: z.array(itemSpecificSchema).max(SPECIFICS_MAX),
    /** Set when the seller applied an AI draft. */
    aiAssisted: z.boolean(),
  })
  .partial();
export type UpdateSellListingRequest = z.infer<typeof updateSellListingRequestSchema>;

/** AI suggestion - NOT saved: the client fills the form with it and the seller edits and saves. */
export const sellDraftSuggestionSchema = z.object({
  title: z.string(),
  description: z.string(),
  condition: listingConditionSchema,
  itemSpecifics: z.array(itemSpecificSchema),
  /** Only from the resale estimate frozen at purchase; null = set your own price. */
  suggestedPrice: z.object({ amount: moneySchema, basis: z.literal('resale_estimate') }).nullable(),
  checks: z.array(z.string()),
  /** Provider that wrote it ("mock" until the AI service is configured). */
  provider: z.string(),
});
export type SellDraftSuggestion = z.infer<typeof sellDraftSuggestionSchema>;

export const sellDraftRequestSchema = z.object({
  /** Anything the seller wants the AI to know (e.g. "battery 89%, small scratch"). */
  notes: z.string().trim().max(500).optional(),
});
export type SellDraftRequest = z.infer<typeof sellDraftRequestSchema>;

export const addSourcePhotoRequestSchema = z.object({ url: z.string().url() });
export const reorderPhotosRequestSchema = z.object({ photoIds: z.array(idSchema).min(1).max(SELL_PHOTOS_MAX) });

export const publishSellListingRequestSchema = z.object({ marketplaces: z.array(marketplaceKeySchema).min(1) });
export type PublishSellListingRequest = z.infer<typeof publishSellListingRequestSchema>;

export const confirmSellChannelRequestSchema = z.object({ url: z.string().url().optional() });
