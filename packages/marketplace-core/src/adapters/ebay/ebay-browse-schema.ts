import { z } from 'zod';

/**
 * The subset of the eBay Buy > Browse API v1 we read (eBay's OpenAPI spec,
 * buy_browse_v1_oas3.json: SearchPagedCollection, ItemSummary, Item). Every field is optional and
 * unknown fields pass through, so eBay adding fields never breaks us; normalization decides
 * what's required. Field names are eBay's - do not rename.
 */

const amount = z.object({ value: z.string(), currency: z.string() }).passthrough();
const image = z.object({ imageUrl: z.string().optional() }).passthrough();

export const ebayItemSummarySchema = z
  .object({
    itemId: z.string(),
    legacyItemId: z.string().optional(),
    title: z.string().optional(),
    shortDescription: z.string().optional(),
    price: amount.optional(),
    /** Auctions: the current bid. */
    currentBidPrice: amount.optional(),
    bidCount: z.number().int().optional(),
    /** e.g. FIXED_PRICE, AUCTION, BEST_OFFER. */
    buyingOptions: z.array(z.string()).optional(),
    condition: z.string().optional(),
    conditionId: z.string().optional(),
    itemWebUrl: z.string().optional(),
    image: image.optional(),
    additionalImages: z.array(image).optional(),
    itemLocation: z
      .object({ city: z.string().optional(), stateOrProvince: z.string().optional(), postalCode: z.string().optional(), country: z.string().optional() })
      .passthrough()
      .optional(),
    shippingOptions: z.array(z.object({ shippingCostType: z.string().optional(), shippingCost: amount.optional() }).passthrough()).optional(),
    seller: z.object({ username: z.string().optional(), feedbackPercentage: z.string().optional(), feedbackScore: z.number().optional() }).passthrough().optional(),
    /** When the seller listed it (freshness). */
    itemCreationDate: z.string().optional(),
    itemEndDate: z.string().optional(),
    estimatedAvailabilities: z.array(z.object({ estimatedAvailabilityStatus: z.string().optional() }).passthrough()).optional(),
    /** Only on GET /item/{item_id}. */
    description: z.string().optional(),
  })
  .passthrough();
export type EbayItemSummary = z.infer<typeof ebayItemSummarySchema>;

export const ebaySearchPageSchema = z
  .object({
    total: z.number().int().optional(),
    limit: z.number().int().optional(),
    offset: z.number().int().optional(),
    next: z.string().optional(),
    itemSummaries: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const ebayTokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().int().positive() }).passthrough();

export const ebayErrorSchema = z
  .object({
    errors: z.array(z.object({ errorId: z.number().optional(), message: z.string().optional(), longMessage: z.string().optional() }).passthrough()).optional(),
  })
  .passthrough();

/**
 * eBay condition ids used for the condition FILTER (eBay item condition reference):
 * 1000 New, 1500 New other, 1750 New with defects; 2000 Certified refurbished,
 * 2010/2020/2030 refurbished grades, 2500 Seller refurbished; 3000 Used,
 * 4000/5000/6000 used grades; 7000 For parts or not working (never part of "used").
 */
export const EBAY_CONDITION_IDS: Record<'new' | 'used' | 'refurbished', readonly string[]> = {
  new: ['1000', '1500', '1750'],
  refurbished: ['2000', '2010', '2020', '2030', '2500'],
  used: ['3000', '4000', '5000', '6000'],
};

/**
 * Site currencies for price filtering (`priceCurrency` must match the site). Sites not listed
 * here simply don't get a price filter - the Hunt matcher re-applies the max price anyway.
 */
export const EBAY_SITE_CURRENCY: Record<string, string> = {
  EBAY_US: 'USD',
  EBAY_GB: 'GBP',
  EBAY_AU: 'AUD',
  EBAY_CA: 'CAD',
  EBAY_DE: 'EUR',
  EBAY_FR: 'EUR',
  EBAY_IT: 'EUR',
  EBAY_ES: 'EUR',
  EBAY_IE: 'EUR',
  EBAY_NL: 'EUR',
  EBAY_AT: 'EUR',
  EBAY_BE: 'EUR',
  EBAY_CH: 'CHF',
  EBAY_PL: 'PLN',
};

/** OAuth + REST hosts (eBay developer docs: production and sandbox environments). */
export const EBAY_HOSTS = {
  production: 'https://api.ebay.com',
  sandbox: 'https://api.sandbox.ebay.com',
} as const;
export type EbayEnvironment = keyof typeof EBAY_HOSTS;

/** Scope for application tokens (client credentials grant) used by the Browse API. */
export const EBAY_PUBLIC_SCOPE = 'https://api.ebay.com/oauth/api_scope';
/** The Browse search returns at most this many results (offset + limit). */
export const EBAY_MAX_RESULTS = 10_000;
