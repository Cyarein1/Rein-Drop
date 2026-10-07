import type { ListingCondition } from '../../listing.js';

/**
 * SYNTHETIC development catalogue - phones and electronics resellers commonly flip.
 *
 * `typicalUsd` is a rough, hand-picked "typical second-hand asking price" used only to make
 * development listings look plausible. It is not market data, not a valuation and must never be
 * used for deal maths outside development.
 */
export interface DevProduct {
  key: string;
  title: string;
  category: 'phones' | 'tablets' | 'consoles' | 'audio' | 'computers' | 'cameras';
  /** Extra search words (title words are searchable too). */
  keywords: readonly string[];
  typicalUsd: number;
}

export const DEV_PRODUCTS: readonly DevProduct[] = [
  { key: 'iphone12', title: 'Apple iPhone 12 64GB', category: 'phones', keywords: ['phone', 'smartphone', 'ios'], typicalUsd: 230 },
  { key: 'iphone13', title: 'Apple iPhone 13 128GB', category: 'phones', keywords: ['phone', 'smartphone', 'ios'], typicalUsd: 330 },
  { key: 'iphone14pro', title: 'Apple iPhone 14 Pro 256GB', category: 'phones', keywords: ['phone', 'smartphone', 'ios'], typicalUsd: 650 },
  { key: 'galaxys23', title: 'Samsung Galaxy S23 128GB', category: 'phones', keywords: ['phone', 'smartphone', 'android', 's23'], typicalUsd: 420 },
  { key: 'galaxya54', title: 'Samsung Galaxy A54 5G 128GB', category: 'phones', keywords: ['phone', 'smartphone', 'android', 'a54'], typicalUsd: 220 },
  { key: 'pixel7', title: 'Google Pixel 7 128GB', category: 'phones', keywords: ['phone', 'smartphone', 'android'], typicalUsd: 260 },
  { key: 'ipad9', title: 'Apple iPad 9th Gen 64GB Wi-Fi', category: 'tablets', keywords: ['tablet', 'ipad9'], typicalUsd: 210 },
  { key: 'switcholed', title: 'Nintendo Switch OLED', category: 'consoles', keywords: ['console', 'gaming'], typicalUsd: 260 },
  { key: 'ps5disc', title: 'Sony PlayStation 5 Disc Edition', category: 'consoles', keywords: ['ps5', 'console', 'gaming', 'playstation5'], typicalUsd: 400 },
  { key: 'xboxseriesx', title: 'Microsoft Xbox Series X 1TB', category: 'consoles', keywords: ['console', 'gaming', 'xsx'], typicalUsd: 380 },
  { key: 'airpodspro2', title: 'Apple AirPods Pro (2nd generation)', category: 'audio', keywords: ['earbuds', 'headphones', 'airpods'], typicalUsd: 150 },
  { key: 'sonyxm4', title: 'Sony WH-1000XM4 Wireless Headphones', category: 'audio', keywords: ['headphones', 'xm4', 'noise', 'cancelling'], typicalUsd: 160 },
  { key: 'macbookairm1', title: 'Apple MacBook Air M1 8GB 256GB', category: 'computers', keywords: ['laptop', 'macbook', 'm1'], typicalUsd: 550 },
  { key: 'gopro10', title: 'GoPro HERO10 Black', category: 'cameras', keywords: ['camera', 'action', 'hero10'], typicalUsd: 220 },
  { key: 'djimini2', title: 'DJI Mini 2 Drone Fly More Combo', category: 'cameras', keywords: ['drone', 'camera', 'mini2'], typicalUsd: 300 },
];

/**
 * Listing situations every product appears in, chosen to exercise deal analysis and UI states.
 * Ages are minutes before the adapter's epoch; `lifetimeMinutes` is how long after being listed
 * the listing sells / ends (null = stays up), so freshness changes as the clock moves.
 */
export interface DevCase {
  key: string;
  /** Multiplier on the typical price; null = no price shown. */
  priceFactor: number | null;
  condition: ListingCondition;
  /** For-parts listings are "used" for filtering but described as faulty. */
  faulty?: boolean;
  ageMinutes: number;
  lifetimeMinutes: number | null;
  /** eBay only: auction instead of fixed price. */
  auction?: boolean;
  marketplaces: readonly ('ebay' | 'facebook')[];
  description: (title: string) => string;
}

const BOTH = ['ebay', 'facebook'] as const;
const DAY = 24 * 60;

export const DEV_CASES: readonly DevCase[] = [
  {
    key: 'deal',
    priceFactor: 0.68,
    condition: 'used',
    ageMinutes: 25,
    lifetimeMinutes: 3 * 60,
    marketplaces: BOTH,
    description: (t) => `Selling my ${t}, upgraded so need it gone quickly. Works perfectly, minor scuffs on the frame. Box and cable included.`,
  },
  {
    key: 'just-listed-hot',
    priceFactor: 0.6,
    condition: 'used',
    ageMinutes: 50,
    lifetimeMinutes: 60,
    marketplaces: BOTH,
    description: (t) => `${t} - priced to go today. Moving overseas. First come first served.`,
  },
  {
    key: 'fair',
    priceFactor: 1,
    condition: 'used',
    ageMinutes: 3 * 60,
    lifetimeMinutes: null,
    marketplaces: BOTH,
    description: (t) => `${t} in good working order. Normal signs of use, no cracks. Charger included.`,
  },
  {
    key: 'overpriced',
    priceFactor: 1.38,
    condition: 'used',
    ageMinutes: 2 * DAY,
    lifetimeMinutes: null,
    marketplaces: BOTH,
    description: (t) => `${t}, excellent condition, always kept in a case. Price is firm, no lowballers.`,
  },
  {
    key: 'new-sealed',
    priceFactor: 1.15,
    condition: 'new',
    ageMinutes: 6 * 60,
    lifetimeMinutes: 2 * DAY,
    marketplaces: BOTH,
    description: (t) => `Brand new ${t}, factory sealed. Unwanted gift.`,
  },
  {
    key: 'refurbished',
    priceFactor: 0.88,
    condition: 'refurbished',
    ageMinutes: DAY,
    lifetimeMinutes: null,
    marketplaces: BOTH,
    description: (t) => `Refurbished ${t}. New battery fitted, tested and cleaned. 90-day warranty from the refurbisher.`,
  },
  {
    key: 'for-parts',
    priceFactor: 0.3,
    condition: 'used',
    faulty: true,
    ageMinutes: 4 * DAY,
    lifetimeMinutes: null,
    marketplaces: BOTH,
    description: (t) => `${t} for parts or repair. Cracked screen and does not power on. Sold as is, no returns.`,
  },
  {
    key: 'auction',
    priceFactor: 0.45,
    condition: 'used',
    auction: true,
    ageMinutes: 7 * DAY - 120,
    lifetimeMinutes: 7 * DAY,
    marketplaces: ['ebay'],
    description: (t) => `${t} up for auction, no reserve. Fully working, light wear.`,
  },
  {
    key: 'no-price',
    priceFactor: null,
    condition: 'used',
    ageMinutes: 9 * 60,
    lifetimeMinutes: null,
    marketplaces: ['facebook'],
    description: (t) => `${t} available. Message me with offers.`,
  },
  {
    key: 'stale',
    priceFactor: 0.8,
    condition: 'used',
    ageMinutes: 40 * DAY,
    lifetimeMinutes: null,
    marketplaces: BOTH,
    description: (t) => `${t}. Still available. Reposting.`,
  },
];

/** Lower-case words used for matching. */
export function searchWords(product: DevProduct): Set<string> {
  const words = `${product.title} ${product.keywords.join(' ')}`.toLowerCase().split(/[^a-z0-9]+/);
  return new Set(words.filter(Boolean));
}

/**
 * Every query word must match a product word (prefix match, so "iphone" matches the iPhones and
 * "galax" matches Galaxy). Queries that match nothing give realistic empty results.
 */
export function matchingProducts(query: string): DevProduct[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return [];
  return DEV_PRODUCTS.filter((product) => {
    const productWords = [...searchWords(product)];
    return words.every((w) => productWords.some((p) => p.startsWith(w)));
  });
}
