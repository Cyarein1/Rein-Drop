import type { productPhotos } from "../photos";

/**
 * Landing demo fixtures (Landing 14, Technical Decisions: "deterministic demo, no live data").
 * Everything here is MADE UP for the demo: the listings are not real listings, the resale figures
 * are illustrative estimates, and nothing is fetched from a marketplace or produced by AI.
 * Prices in whole US dollars (the landing speaks to US resellers first).
 */

/** Only the launch-target marketplaces - the demo never implies others work today. */
export const DEMO_MARKETPLACES = ["ebay", "facebook"] as const;
export type DemoMarketplace = (typeof DEMO_MARKETPLACES)[number];

export const DEMO_CONDITIONS = ["any", "new", "used"] as const;
export type DemoConditionChoice = (typeof DEMO_CONDITIONS)[number];
export type DemoCondition = Exclude<DemoConditionChoice, "any">;

export const DEMO_CONDITION_LABEL: Record<DemoConditionChoice, string> = { any: "Any condition", new: "New", used: "Used" };

/** The demo's always-visible label (Landing 15). */
export const DEMO_LABEL = "Illustrative demo — not live listings";

/** Shown with the demo and repeated in every evaluation. */
export const DEMO_DISCLAIMERS = {
  demo: `${DEMO_LABEL}. Nothing here was fetched from a marketplace.`,
  estimate: "Resale figures are illustrative estimates, not quotes or guarantees.",
  gross: "Upside is gross: before selling fees, shipping, taxes and repairs. It is not profit.",
} as const;

export type DemoProductKey = "iphone" | "playstation" | "macbook";

export interface DemoHuntConfig {
  maxPriceUsd: number;
  condition: DemoConditionChoice;
  marketplaces: DemoMarketplace[];
  /** Local pickup distance; only applies to Facebook Marketplace listings. */
  radiusMiles: number;
}

/** Illustrative resale estimate for one condition, from a stated number of similar sales. */
export interface DemoResaleEstimate {
  lowUsd: number;
  typicalUsd: number;
  highUsd: number;
  comparableSales: number;
}

export interface DemoListing {
  /** Always "demo-..." - never a real listing id. */
  id: string;
  title: string;
  askingUsd: number;
  condition: DemoCondition;
  marketplace: DemoMarketplace;
  /** Facebook Marketplace (local pickup) only; null for shipped listings. */
  distanceMiles: number | null;
  postedMinutesAgo: number;
}

export interface DemoProduct {
  key: DemoProductKey;
  name: string;
  /** What a person would type into a Hunt. */
  query: string;
  /** Example photo from the landing register, or null (a neutral visual is used). */
  photo: keyof typeof productPhotos | null;
  defaults: DemoHuntConfig;
  priceRange: { minUsd: number; maxUsd: number; stepUsd: number };
  radiusOptions: readonly number[];
  resale: Record<DemoCondition, DemoResaleEstimate>;
  /** In the order the demo "checks" them. */
  listings: readonly DemoListing[];
  questionsForSeller: readonly string[];
}

const RADIUS_OPTIONS = [10, 25, 50] as const;

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  {
    key: "iphone",
    name: "iPhone 13 Pro",
    query: "iPhone 13 Pro 128GB",
    photo: "iphone13Pro",
    defaults: { maxPriceUsd: 450, condition: "any", marketplaces: ["ebay", "facebook"], radiusMiles: 25 },
    priceRange: { minUsd: 200, maxUsd: 800, stepUsd: 10 },
    radiusOptions: RADIUS_OPTIONS,
    resale: {
      used: { lowUsd: 390, typicalUsd: 430, highUsd: 470, comparableSales: 14 },
      new: { lowUsd: 560, typicalUsd: 600, highUsd: 640, comparableSales: 4 },
    },
    listings: [
      { id: "demo-iphone-1", title: "iPhone 13 Pro 128GB unlocked - Sierra Blue, small scratch on frame", askingUsd: 520, condition: "new", marketplace: "ebay", distanceMiles: null, postedMinutesAgo: 95 },
      { id: "demo-iphone-2", title: "iPhone 13 Pro 128GB, battery 88%, with case", askingUsd: 395, condition: "used", marketplace: "ebay", distanceMiles: null, postedMinutesAgo: 40 },
      { id: "demo-iphone-3", title: "iPhone 13 Pro 128 GB - Graphite, works perfectly", askingUsd: 310, condition: "used", marketplace: "facebook", distanceMiles: 38, postedMinutesAgo: 25 },
      { id: "demo-iphone-4", title: "iPhone 13 Pro 128GB Sierra Blue - upgrading, quick sale", askingUsd: 340, condition: "used", marketplace: "facebook", distanceMiles: 6, postedMinutesAgo: 12 },
    ],
    questionsForSeller: ["Is it unlocked and free of carrier or iCloud locks?", "What is the battery health?", "Any repairs or replaced parts (screen, battery)?"],
  },
  {
    key: "playstation",
    name: "PlayStation 5",
    query: "PlayStation 5 console",
    photo: "playstation5",
    defaults: { maxPriceUsd: 350, condition: "used", marketplaces: ["ebay", "facebook"], radiusMiles: 25 },
    priceRange: { minUsd: 150, maxUsd: 600, stepUsd: 10 },
    radiusOptions: RADIUS_OPTIONS,
    resale: {
      used: { lowUsd: 380, typicalUsd: 420, highUsd: 450, comparableSales: 9 },
      new: { lowUsd: 450, typicalUsd: 480, highUsd: 500, comparableSales: 6 },
    },
    listings: [
      { id: "demo-ps5-1", title: "PS5 console, barely used, boxed", askingUsd: 360, condition: "used", marketplace: "facebook", distanceMiles: 9, postedMinutesAgo: 50 },
      { id: "demo-ps5-2", title: "PlayStation 5 - sealed, unwanted gift", askingUsd: 430, condition: "new", marketplace: "facebook", distanceMiles: 4, postedMinutesAgo: 70 },
      { id: "demo-ps5-3", title: "PlayStation 5 console + 1 controller, good condition", askingUsd: 300, condition: "used", marketplace: "ebay", distanceMiles: null, postedMinutesAgo: 18 },
      { id: "demo-ps5-4", title: "PS5 with 2 controllers and 3 games", askingUsd: 340, condition: "used", marketplace: "ebay", distanceMiles: null, postedMinutesAgo: 130 },
    ],
    questionsForSeller: ["Any overheating, fan noise or drift on the controller?", "Original controller and cables included?", "Pickup or shipped - and who pays shipping?"],
  },
  {
    key: "macbook",
    name: "MacBook Air M2",
    query: "MacBook Air M2 13-inch",
    photo: null,
    defaults: { maxPriceUsd: 700, condition: "any", marketplaces: ["ebay", "facebook"], radiusMiles: 25 },
    priceRange: { minUsd: 300, maxUsd: 1200, stepUsd: 10 },
    radiusOptions: RADIUS_OPTIONS,
    resale: {
      used: { lowUsd: 620, typicalUsd: 680, highUsd: 740, comparableSales: 6 },
      new: { lowUsd: 860, typicalUsd: 900, highUsd: 950, comparableSales: 3 },
    },
    listings: [
      { id: "demo-macbook-1", title: "MacBook Air M2 13\" 8GB/256GB - new in box", askingUsd: 820, condition: "new", marketplace: "ebay", distanceMiles: null, postedMinutesAgo: 30 },
      { id: "demo-macbook-2", title: "MacBook Air M2 8/256 Midnight, 41 battery cycles", askingUsd: 640, condition: "used", marketplace: "ebay", distanceMiles: null, postedMinutesAgo: 75 },
      { id: "demo-macbook-3", title: "M2 MacBook Air, light use, charger included", askingUsd: 560, condition: "used", marketplace: "facebook", distanceMiles: 15, postedMinutesAgo: 22 },
      { id: "demo-macbook-4", title: "MacBook Air M2 2022 - moving sale", askingUsd: 520, condition: "used", marketplace: "facebook", distanceMiles: 41, postedMinutesAgo: 8 },
    ],
    questionsForSeller: ["Is it signed out of iCloud and Find My (activation lock off)?", "What is the battery cycle count?", "Any dents, screen marks or keyboard issues?"],
  },
];

export const demoProduct = (key: DemoProductKey): DemoProduct => DEMO_PRODUCTS.find((p) => p.key === key)!;

/** The costs the demo names (never with invented amounts) before anything could count as profit. */
export const DEMO_COSTS_BEFORE_PROFIT = ["Selling fees", "Shipping and packaging", "Sales tax", "Repairs or cleaning"] as const;
