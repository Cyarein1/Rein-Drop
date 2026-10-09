/**
 * Marketplace roadmap for the landing page (Landing 08, Technical Decisions sections 2-3): "show
 * many, activate few". The gallery is a roadmap and interest-validation tool, not a promise.
 *
 * Honesty rules, enforced by types + tests:
 * - `live` and `beta` REQUIRE `proof` (when and how it was verified in production). Nothing has
 *   proof today: eBay and Facebook Marketplace are launch targets (eBay's adapter is built but not
 *   live; Facebook needs a production source - D12).
 * - Statuses describe intentions, not dates or guarantees.
 * Logos: official files from each company's own site, unaltered (decision L-D6, register in
 * docs/LANDING_ASSETS.md); `logo: null` = no usable official file yet -> the brand name in text.
 */
export const MARKETPLACE_STATUSES = ["live", "beta", "in_development", "launch_target", "coming_soon", "exploring", "unavailable"] as const;
export type MarketplaceStatus = (typeof MARKETPLACE_STATUSES)[number];

export const MARKETPLACE_STATUS_INFO: Record<MarketplaceStatus, { label: string; meaning: string }> = {
  live: { label: "Live", meaning: "Verified working in production." },
  beta: { label: "Beta", meaning: "Available to a limited group, with known limitations." },
  in_development: { label: "In development", meaning: "Being built and tested - not available yet." },
  launch_target: { label: "Launch target", meaning: "What Rein Drop launches with - being built and tested, not live yet." },
  coming_soon: { label: "Coming soon / Exploring", meaning: "Next in line - access and terms are still being checked. No dates." },
  exploring: { label: "Exploring", meaning: "On our radar - whether it can work isn't established yet." },
  unavailable: { label: "Unavailable", meaning: "Paused or not possible right now." },
};

export interface MarketplaceLogo {
  src: string;
  width: number;
  height: number;
  /** icon = square app icon; wordmark = the brand's name logo (wider than tall). */
  kind: "icon" | "wordmark";
}

/** When and how a live / beta source was verified. Required for those statuses. */
export interface MarketplaceProof {
  verifiedAt: string;
  evidence: string;
}

type Base = { key: string; name: string; category: string; logo: MarketplaceLogo | null };
export type MarketplaceEntry =
  | (Base & { status: "live" | "beta"; proof: MarketplaceProof })
  | (Base & { status: Exclude<MarketplaceStatus, "live" | "beta">; proof?: never });

const icon = (key: string, ext = "png", size = 180): MarketplaceLogo => ({ src: `/assets/third-party/marketplaces/${key}.${ext}`, width: size, height: size, kind: "icon" });

export const MARKETPLACES = [
  // ---- Starting with (P0) ----
  { key: "ebay", name: "eBay", category: "Everything secondhand", status: "launch_target", logo: { src: "/assets/third-party/marketplaces/ebay.svg", width: 191, height: 77, kind: "wordmark" } },
  { key: "facebook", name: "Facebook Marketplace", category: "Local deals", status: "launch_target", logo: icon("facebook", "webp") },
  // ---- Coming soon / Exploring (P1) ----
  { key: "offerup", name: "OfferUp", category: "Local deals", status: "coming_soon", logo: null },
  { key: "craigslist", name: "Craigslist", category: "Local classifieds", status: "coming_soon", logo: icon("craigslist", "png", 57) },
  { key: "mercari", name: "Mercari", category: "Everything secondhand", status: "coming_soon", logo: icon("mercari", "png", 64) },
  { key: "poshmark", name: "Poshmark", category: "Fashion", status: "coming_soon", logo: icon("poshmark") },
  // ---- Exploring (P2 / P3) ----
  { key: "depop", name: "Depop", category: "Fashion & streetwear", status: "exploring", logo: icon("depop", "png", 48) },
  { key: "stockx", name: "StockX", category: "Sneakers & collectibles", status: "exploring", logo: icon("stockx") },
  { key: "goat", name: "GOAT", category: "Sneakers", status: "exploring", logo: null },
  { key: "grailed", name: "Grailed", category: "Menswear", status: "exploring", logo: icon("grailed", "png", 152) },
  { key: "reverb", name: "Reverb", category: "Music gear", status: "exploring", logo: icon("reverb") },
  { key: "swappa", name: "Swappa", category: "Phones & electronics", status: "exploring", logo: null },
  { key: "etsy", name: "Etsy", category: "Vintage & handmade", status: "exploring", logo: null },
  { key: "whatnot", name: "Whatnot", category: "Live shopping", status: "exploring", logo: icon("whatnot") },
  { key: "vinted", name: "Vinted", category: "Fashion", status: "exploring", logo: icon("vinted", "png", 192) },
  { key: "amazon", name: "Amazon", category: "Retail", status: "exploring", logo: icon("amazon", "png", 48) },
  { key: "walmart", name: "Walmart Marketplace", category: "Retail", status: "exploring", logo: icon("walmart") },
] as const satisfies readonly MarketplaceEntry[];

export type MarketplaceKey = (typeof MARKETPLACES)[number]["key"];

export const marketplaceByKey = (key: MarketplaceKey): MarketplaceEntry => MARKETPLACES.find((m) => m.key === key)!;

/** "Starting with": what Rein Drop launches with (and anything verified later). */
const STARTING: readonly MarketplaceStatus[] = ["live", "beta", "in_development", "launch_target"];
export const startingWith = (all: readonly MarketplaceEntry[] = MARKETPLACES) => all.filter((m) => STARTING.includes(m.status));
/** "On our radar": prioritized next. Shown by default. */
export const comingSoon = (all: readonly MarketplaceEntry[] = MARKETPLACES) => all.filter((m) => m.status === "coming_soon");
/** "On our radar": exploring. Behind "See more" so the section stays compact. */
export const exploring = (all: readonly MarketplaceEntry[] = MARKETPLACES) => all.filter((m) => m.status === "exploring");
