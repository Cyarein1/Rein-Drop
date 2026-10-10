import { potentialGrossUpsideUsd, usd } from "../illustrative";
import {
  DEMO_CONDITION_LABEL,
  DEMO_CONDITIONS,
  DEMO_COSTS_BEFORE_PROFIT,
  DEMO_DISCLAIMERS,
  DEMO_MARKETPLACES,
  demoProduct,
  type DemoConditionChoice,
  type DemoHuntConfig,
  type DemoListing,
  type DemoMarketplace,
  type DemoProduct,
  type DemoProductKey,
  type DemoResaleEstimate,
} from "./demo-fixtures";

/**
 * The landing demo as a pure finite-state machine (Landing 14):
 *
 *   choose -> configure -> scan -> candidate -> evaluation
 *                            \-> no_match (back to configure)
 *
 * `demoTransition(state, event)` is pure and deterministic: no network, no AI, no clock, no
 * randomness. The scan advances one fixture listing per SCAN_TICK - the UI (Landing 15) decides
 * the pace, and SCAN_COMPLETE finishes at once (reduced motion). An event that doesn't apply to
 * the current step returns the SAME state object, so the UI can ignore it safely.
 */

// ---------------------------------------------------------------------------
// States and events
// ---------------------------------------------------------------------------

export type ListingCheck = "match" | "marketplace_off" | "condition" | "over_max_price" | "too_far";

export interface ScannedListing {
  listing: DemoListing;
  result: ListingCheck;
  /** Plain words for the scan log, e.g. "Over your max price ($450)". */
  note: string;
}

export interface Candidate {
  listing: DemoListing;
  resale: DemoResaleEstimate;
  /** Estimated typical resale minus asking - GROSS. */
  grossUpsideUsd: number;
}

export type DemoState =
  | { step: "choose" }
  | { step: "configure"; product: DemoProductKey; config: DemoHuntConfig }
  | { step: "scan"; product: DemoProductKey; config: DemoHuntConfig; scanned: ScannedListing[] }
  | { step: "candidate"; product: DemoProductKey; config: DemoHuntConfig; scanned: ScannedListing[]; candidate: Candidate }
  | { step: "no_match"; product: DemoProductKey; config: DemoHuntConfig; scanned: ScannedListing[] }
  | { step: "evaluation"; product: DemoProductKey; config: DemoHuntConfig; scanned: ScannedListing[]; candidate: Candidate; evaluation: Evaluation };

export type DemoStep = DemoState["step"];

export type DemoEvent =
  | { type: "SELECT_PRODUCT"; product: DemoProductKey }
  | { type: "SET_MAX_PRICE"; usd: number }
  | { type: "SET_CONDITION"; condition: DemoConditionChoice }
  | { type: "TOGGLE_MARKETPLACE"; marketplace: DemoMarketplace }
  | { type: "SET_RADIUS"; miles: number }
  | { type: "START_SCAN" }
  | { type: "SCAN_TICK" }
  | { type: "SCAN_COMPLETE" }
  | { type: "VIEW_EVALUATION" }
  | { type: "BACK" }
  | { type: "RESTART" };

export const DEMO_INITIAL_STATE: DemoState = { step: "choose" };

// ---------------------------------------------------------------------------
// Scan rules
// ---------------------------------------------------------------------------

const MARKETPLACE_NAME: Record<DemoMarketplace, string> = { ebay: "eBay", facebook: "Facebook Marketplace" };

/** One listing against the Hunt, checked in a fixed order so the reason is always the same. */
export function checkListing(listing: DemoListing, config: DemoHuntConfig): ScannedListing {
  const out = (result: ListingCheck, note: string): ScannedListing => ({ listing, result, note });
  if (!config.marketplaces.includes(listing.marketplace)) return out("marketplace_off", `${MARKETPLACE_NAME[listing.marketplace]} isn't in this Hunt`);
  if (config.condition !== "any" && listing.condition !== config.condition) return out("condition", `${DEMO_CONDITION_LABEL[listing.condition]}, not ${DEMO_CONDITION_LABEL[config.condition].toLowerCase()}`);
  if (listing.askingUsd > config.maxPriceUsd) return out("over_max_price", `Over your max price (${usd(config.maxPriceUsd)})`);
  if (listing.distanceMiles !== null && listing.distanceMiles > config.radiusMiles) return out("too_far", `${listing.distanceMiles} mi away - outside ${config.radiusMiles} mi`);
  return out("match", "Fits your Hunt");
}

/** Best match = highest estimated gross upside; ties go to the fixture order. */
export function pickCandidate(product: DemoProduct, scanned: readonly ScannedListing[]): Candidate | null {
  let best: Candidate | null = null;
  for (const s of scanned) {
    if (s.result !== "match") continue;
    const resale = product.resale[s.listing.condition];
    const candidate = { listing: s.listing, resale, grossUpsideUsd: potentialGrossUpsideUsd({ askingUsd: s.listing.askingUsd, estimatedResaleUsd: resale.typicalUsd }) };
    if (!best || candidate.grossUpsideUsd > best.grossUpsideUsd) best = candidate;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type DemoConfidence = "high" | "medium" | "low";

export interface Evaluation {
  askingUsd: number;
  /** Illustrative estimate - always shown with `disclaimers.estimate`. */
  estimatedResale: { lowUsd: number; typicalUsd: number; highUsd: number };
  /** Resale estimate minus asking - GROSS, before costs. Never called profit. */
  grossUpside: { lowUsd: number; typicalUsd: number; highUsd: number };
  strength: "Strong deal" | "Worth a look" | "Thin margin";
  confidence: { level: DemoConfidence; text: string };
  why: string[];
  questionsForSeller: readonly string[];
  costsBeforeProfit: readonly string[];
  disclaimers: typeof DEMO_DISCLAIMERS;
}

/** Share of the typical resale price the gross upside represents. */
const STRONG_SHARE = 0.2;
const WORTH_A_LOOK_SHARE = 0.08;

export function confidenceFor(comparableSales: number): Evaluation["confidence"] {
  if (comparableSales >= 10) return { level: "high", text: "High confidence - plenty of similar sales to compare" };
  if (comparableSales >= 5) return { level: "medium", text: "Medium confidence - a handful of similar sales to compare" };
  return { level: "low", text: "Low confidence - only a few similar sales, so treat the estimate loosely" };
}

export function evaluate(product: DemoProduct, config: DemoHuntConfig, candidate: Candidate): Evaluation {
  const { listing, resale } = candidate;
  const share = candidate.grossUpsideUsd / resale.typicalUsd;
  const strength = share >= STRONG_SHARE ? "Strong deal" : share >= WORTH_A_LOOK_SHARE ? "Worth a look" : "Thin margin";
  const why = [
    `Under your max price (${usd(config.maxPriceUsd)})`,
    config.condition === "any" ? `${DEMO_CONDITION_LABEL[listing.condition]} - you accept any condition` : `${DEMO_CONDITION_LABEL[listing.condition]}, as you asked`,
    listing.distanceMiles !== null ? `Local pickup, ${listing.distanceMiles} mi away` : `Ships via ${MARKETPLACE_NAME[listing.marketplace]}`,
    candidate.grossUpsideUsd > 0
      ? `Asking is ${usd(candidate.grossUpsideUsd)} below the typical estimated resale for a ${listing.condition} one`
      : `Asking is at or above the typical estimated resale for a ${listing.condition} one`,
  ];
  return {
    askingUsd: listing.askingUsd,
    estimatedResale: { lowUsd: resale.lowUsd, typicalUsd: resale.typicalUsd, highUsd: resale.highUsd },
    grossUpside: { lowUsd: resale.lowUsd - listing.askingUsd, typicalUsd: candidate.grossUpsideUsd, highUsd: resale.highUsd - listing.askingUsd },
    strength,
    confidence: confidenceFor(resale.comparableSales),
    why,
    questionsForSeller: product.questionsForSeller,
    costsBeforeProfit: DEMO_COSTS_BEFORE_PROFIT,
    disclaimers: DEMO_DISCLAIMERS,
  };
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/** Keeps a price inside the product's range, on its step. */
export function clampPrice(product: DemoProduct, value: number): number {
  const { minUsd, maxUsd, stepUsd } = product.priceRange;
  if (!Number.isFinite(value)) return product.defaults.maxPriceUsd;
  const stepped = minUsd + Math.round((value - minUsd) / stepUsd) * stepUsd;
  return Math.min(maxUsd, Math.max(minUsd, stepped));
}

const copyConfig = (c: DemoHuntConfig): DemoHuntConfig => ({ ...c, marketplaces: [...c.marketplaces] });

/** After the last listing: a candidate if anything matched, otherwise no_match. */
function finishScan(product: DemoProductKey, config: DemoHuntConfig, scanned: ScannedListing[]): DemoState {
  const candidate = pickCandidate(demoProduct(product), scanned);
  return candidate ? { step: "candidate", product, config, scanned, candidate } : { step: "no_match", product, config, scanned };
}

export function demoTransition(state: DemoState, event: DemoEvent): DemoState {
  if (event.type === "RESTART") return state.step === "choose" ? state : DEMO_INITIAL_STATE;

  switch (state.step) {
    case "choose":
      if (event.type === "SELECT_PRODUCT") return { step: "configure", product: event.product, config: copyConfig(demoProduct(event.product).defaults) };
      return state;

    case "configure": {
      const product = demoProduct(state.product);
      const withConfig = (config: DemoHuntConfig): DemoState => ({ ...state, config });
      switch (event.type) {
        case "SET_MAX_PRICE": {
          const maxPriceUsd = clampPrice(product, event.usd);
          return maxPriceUsd === state.config.maxPriceUsd ? state : withConfig({ ...state.config, maxPriceUsd });
        }
        case "SET_CONDITION":
          return !DEMO_CONDITIONS.includes(event.condition) || event.condition === state.config.condition ? state : withConfig({ ...state.config, condition: event.condition });
        case "TOGGLE_MARKETPLACE": {
          const on = state.config.marketplaces.includes(event.marketplace);
          // A Hunt always watches at least one marketplace: the last one can't be switched off.
          if (on && state.config.marketplaces.length === 1) return state;
          const marketplaces = on ? state.config.marketplaces.filter((m) => m !== event.marketplace) : DEMO_MARKETPLACES.filter((m) => m === event.marketplace || state.config.marketplaces.includes(m));
          return withConfig({ ...state.config, marketplaces });
        }
        case "SET_RADIUS":
          return !product.radiusOptions.includes(event.miles) || event.miles === state.config.radiusMiles ? state : withConfig({ ...state.config, radiusMiles: event.miles });
        case "START_SCAN":
          return { step: "scan", product: state.product, config: state.config, scanned: [] };
        case "BACK":
          return DEMO_INITIAL_STATE;
        default:
          return state;
      }
    }

    case "scan": {
      const listings = demoProduct(state.product).listings;
      switch (event.type) {
        case "SCAN_TICK": {
          const scanned = [...state.scanned, checkListing(listings[state.scanned.length]!, state.config)];
          return scanned.length === listings.length ? finishScan(state.product, state.config, scanned) : { ...state, scanned };
        }
        case "SCAN_COMPLETE":
          return finishScan(state.product, state.config, listings.map((l) => checkListing(l, state.config)));
        case "BACK":
          return { step: "configure", product: state.product, config: state.config };
        default:
          return state;
      }
    }

    case "candidate":
      if (event.type === "VIEW_EVALUATION") {
        return { ...state, step: "evaluation", evaluation: evaluate(demoProduct(state.product), state.config, state.candidate) };
      }
      if (event.type === "BACK") return { step: "configure", product: state.product, config: state.config };
      return state;

    case "no_match":
      if (event.type === "BACK") return { step: "configure", product: state.product, config: state.config };
      return state;

    case "evaluation":
      if (event.type === "BACK") return { step: "candidate", product: state.product, config: state.config, scanned: state.scanned, candidate: state.candidate };
      return state;
  }
}

/** Runs a list of events from a state (tests, and replaying a demo path). */
export const runDemo = (events: readonly DemoEvent[], from: DemoState = DEMO_INITIAL_STATE): DemoState => events.reduce(demoTransition, from);

/** "Checked 2 of 4 listings" - progress for the scan step. */
export function scanProgress(state: Extract<DemoState, { step: "scan" }>): { checked: number; total: number } {
  return { checked: state.scanned.length, total: demoProduct(state.product).listings.length };
}
