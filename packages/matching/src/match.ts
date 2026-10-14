import type { ListingCondition, ListingStatus, MarketplaceId, Money } from '@rein-drop/marketplace-core';
import { classifyCondition } from './condition.js';
import { containsPhrase, isModelToken, significantTokens, tokenMatches, tokenize } from './text.js';

/**
 * Deterministic hunt matching - cheap filters only, no AI. Every check records an outcome and a
 * machine-readable code so the user (and later the AI stage) can see why a listing matched.
 *
 * Bump MATCHER_VERSION whenever the rules change, so stored matches can be re-evaluated.
 */
export const MATCHER_VERSION = 2;

export const CHECK_NAMES = [
  'availability',
  'marketplace',
  'relevance',
  'accessory',
  'condition',
  'geography',
  'price',
  'exclusions',
  'economics',
] as const;
export type CheckName = (typeof CHECK_NAMES)[number];

/**
 * - pass / fail: decided.
 * - unverified: not enough data to decide (never rejects - e.g. no price shown, no geocoding).
 * - not_applicable: the hunt doesn't ask for it.
 */
export type CheckOutcome = 'pass' | 'fail' | 'unverified' | 'not_applicable';

export interface MatchCheck {
  check: CheckName;
  outcome: CheckOutcome;
  code: string;
  detail: string;
}

export type HuntTarget = { kind: 'profit'; amount: Money } | { kind: 'margin'; percent: number };

export interface MatchPoint {
  lat: number;
  lng: number;
}

export interface MatchHunt {
  query: string;
  /** Marketplaces the hunt is enabled on. */
  marketplaces: readonly MarketplaceId[];
  /** Empty = any condition. */
  conditions: readonly ListingCondition[];
  /** `point` = the location's coordinates (decision 0017); null when it couldn't be placed. */
  location: { text: string; radiusKm: number | null; point: MatchPoint | null } | null;
  maxPrice: Money | null;
  exclusions: readonly string[];
  target: HuntTarget | null;
}

export interface MatchListing {
  marketplace: MarketplaceId;
  title: string;
  description: string | null;
  price: Money | null;
  conditionText: string | null;
  status: ListingStatus;
  /** Where the listing is, from its place text via the place cache; null when unknown / unplaced. */
  point?: MatchPoint | null;
}

export interface MatchContext {
  /** True when the source search applied the hunt's location (and radius, if any). */
  locationEnforcedBySource: boolean;
  /**
   * The listing's marketplace is local pickup (Facebook Marketplace). Distance only matters there;
   * shipped marketplaces (eBay) are not distance-checked. Defaults to true (the cautious reading).
   */
  localPickup?: boolean;
}

const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance in km (same formula as @rein-drop/geo distanceKm; no I/O dependency here). */
export function distanceBetweenKm(a: MatchPoint, b: MatchPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Inputs the valuation stage needs. No resale estimate exists before AI / market data. */
export interface EconomicsInputs {
  acquisition: Money | null;
  target: HuntTarget | null;
  resaleEstimate: null;
  estimatedProfit: null;
  status: 'awaiting_valuation' | 'no_target';
}

export interface MatchEvaluation {
  matched: boolean;
  /** 0-100: how well the title (and, at half weight, the description) covers the query. */
  relevanceScore: number;
  checks: MatchCheck[];
  failed: CheckName[];
  economics: EconomicsInputs;
  version: number;
}

/** Strong signals that a listing is an accessory *for* the product, not the product. */
const ACCESSORY_PATTERNS = [
  /\b(case|cover|sleeve|skin|protector|tempered glass|charger|cable|strap|stand|mount|holder)s? (for|compatible with)\b/,
  /\bcompatible with\b/,
  /\b(box only|empty box|replacement box)\b/,
];

export function evaluateMatch(hunt: MatchHunt, listing: MatchListing, context: MatchContext): MatchEvaluation {
  const relevance = relevanceCheck(hunt.query, listing);
  const checks: MatchCheck[] = [
    availabilityCheck(listing.status),
    hunt.marketplaces.includes(listing.marketplace)
      ? { check: 'marketplace', outcome: 'pass', code: 'enabled', detail: `${listing.marketplace} is enabled for this hunt` }
      : { check: 'marketplace', outcome: 'fail', code: 'not_enabled', detail: `${listing.marketplace} is not enabled for this hunt` },
    relevance.check,
    accessoryCheck(hunt.query, listing.title),
    conditionCheck(hunt.conditions, listing.conditionText),
    geographyCheck(hunt.location, listing.point ?? null, context),
    priceCheck(hunt.maxPrice, listing.price),
    exclusionsCheck(hunt.exclusions, listing),
    hunt.target
      ? { check: 'economics', outcome: 'unverified', code: 'awaiting_valuation', detail: 'Profit against your target is estimated in a later step' }
      : { check: 'economics', outcome: 'not_applicable', code: 'no_target', detail: 'No profit or margin target set' },
  ];
  const failed = checks.filter((c) => c.outcome === 'fail').map((c) => c.check);
  return {
    matched: failed.length === 0,
    relevanceScore: relevance.score,
    checks,
    failed,
    economics: {
      acquisition: listing.price,
      target: hunt.target,
      resaleEstimate: null,
      estimatedProfit: null,
      status: hunt.target ? 'awaiting_valuation' : 'no_target',
    },
    version: MATCHER_VERSION,
  };
}

function availabilityCheck(status: ListingStatus): MatchCheck {
  if (status === 'ACTIVE') return { check: 'availability', outcome: 'pass', code: 'active', detail: 'Listing is active' };
  if (status === 'UNKNOWN') return { check: 'availability', outcome: 'unverified', code: 'unknown', detail: 'Availability not reported' };
  return { check: 'availability', outcome: 'fail', code: 'not_available', detail: `Listing is ${status.toLowerCase()}` };
}

/**
 * Baseline relevance: the significant query words must appear in the listing (title, or the
 * description for plain words). Model numbers / codes must be in the title. Up to three words
 * all must match; longer queries need 75%.
 */
function relevanceCheck(query: string, listing: MatchListing): { check: MatchCheck; score: number } {
  const wanted = significantTokens(query);
  if (wanted.length === 0) {
    return { check: { check: 'relevance', outcome: 'unverified', code: 'no_keywords', detail: 'The search has no specific words to compare' }, score: 0 };
  }
  const title = tokenize(listing.title);
  const body = listing.description ? tokenize(listing.description) : [];
  const inTitle = wanted.filter((w) => title.some((t) => tokenMatches(w, t)));
  const inBody = wanted.filter((w) => !inTitle.includes(w) && !isModelToken(w) && body.some((t) => tokenMatches(w, t)));
  const score = Math.round((100 * (inTitle.length + inBody.length / 2)) / wanted.length);

  const missingNumbers = wanted.filter((w) => isModelToken(w) && !inTitle.includes(w));
  if (missingNumbers.length > 0) {
    return {
      check: { check: 'relevance', outcome: 'fail', code: 'missing_model_number', detail: `Title doesn't mention ${missingNumbers.join(', ')}` },
      score,
    };
  }
  const coverage = (inTitle.length + inBody.length) / wanted.length;
  const required = wanted.length <= 3 ? 1 : 0.75;
  if (coverage < required) {
    const missing = wanted.filter((w) => !inTitle.includes(w) && !inBody.includes(w));
    return { check: { check: 'relevance', outcome: 'fail', code: 'missing_keywords', detail: `Doesn't mention ${missing.join(', ')}` }, score };
  }
  return {
    check: {
      check: 'relevance',
      outcome: 'pass',
      code: inBody.length === 0 ? 'title_match' : 'title_and_description_match',
      detail: `Mentions ${[...inTitle, ...inBody].join(', ')}`,
    },
    score,
  };
}

function accessoryCheck(query: string, title: string): MatchCheck {
  const titleText = tokenize(title).join(' ');
  const queryText = tokenize(query).join(' ');
  const hit = ACCESSORY_PATTERNS.map((p) => p.exec(titleText)?.[0]).find((m): m is string => m !== undefined);
  if (hit && !queryText.includes(hit.split(' ')[0]!)) {
    return { check: 'accessory', outcome: 'fail', code: 'looks_like_accessory', detail: `Title suggests an accessory ("${hit}")` };
  }
  return { check: 'accessory', outcome: 'pass', code: 'not_accessory', detail: 'Not an accessory listing' };
}

function conditionCheck(wanted: readonly ListingCondition[], conditionText: string | null): MatchCheck {
  const category = classifyCondition(conditionText);
  if (wanted.length === 0) {
    return category === 'for_parts'
      ? { check: 'condition', outcome: 'pass', code: 'for_parts_any_condition', detail: 'Listed for parts / not working (you accept any condition)' }
      : { check: 'condition', outcome: 'not_applicable', code: 'any_condition', detail: 'Any condition accepted' };
  }
  if (category === null) {
    return { check: 'condition', outcome: 'unverified', code: 'unknown_condition', detail: conditionText ? `Couldn't read "${conditionText}"` : 'No condition given' };
  }
  if (category === 'for_parts') {
    return { check: 'condition', outcome: 'fail', code: 'for_parts', detail: 'Listed for parts / not working' };
  }
  return wanted.includes(category)
    ? { check: 'condition', outcome: 'pass', code: 'wanted_condition', detail: `Condition: ${category}` }
    : { check: 'condition', outcome: 'fail', code: 'condition_not_wanted', detail: `Condition ${category} isn't one you chose` };
}

/**
 * Distance (decision 0017). Only for local-pickup marketplaces: a listing outside the Hunt's radius
 * FAILS; inside passes with its distance. Without coordinates on either side it stays unverified
 * (never a reject on missing data). Distances in km here; the apps convert for display.
 */
function geographyCheck(location: MatchHunt['location'], listingPoint: MatchPoint | null, context: MatchContext): MatchCheck {
  if (!location) return { check: 'geography', outcome: 'not_applicable', code: 'no_location', detail: 'No location set' };
  if (context.localPickup === false) {
    return { check: 'geography', outcome: 'not_applicable', code: 'ships', detail: 'Shipped marketplace - distance doesn\'t apply' };
  }
  if (context.locationEnforcedBySource) {
    const area = location.radiusKm ? `within ${location.radiusKm} km of ${location.text}` : `around ${location.text}`;
    return { check: 'geography', outcome: 'pass', code: 'enforced_by_source', detail: `Found by a search ${area}` };
  }
  if (!location.point) {
    return { check: 'geography', outcome: 'unverified', code: 'hunt_not_placed', detail: `Couldn't place "${location.text}" on the map, so distance isn't checked` };
  }
  if (!listingPoint) {
    return { check: 'geography', outcome: 'unverified', code: 'listing_not_placed', detail: 'The listing\'s location is unknown, so distance isn\'t checked' };
  }
  const km = distanceBetweenKm(location.point, listingPoint);
  const about = km < 1 ? 'Under 1 km' : `About ${Math.round(km)} km`;
  if (location.radiusKm === null) {
    return { check: 'geography', outcome: 'pass', code: 'distance_known', detail: `${about} from ${location.text}` };
  }
  return km <= location.radiusKm
    ? { check: 'geography', outcome: 'pass', code: 'within_radius', detail: `${about} from ${location.text} (within ${location.radiusKm} km)` }
    : { check: 'geography', outcome: 'fail', code: 'outside_radius', detail: `${about} from ${location.text} - outside your ${location.radiusKm} km` };
}

function priceCheck(maxPrice: Money | null, price: Money | null): MatchCheck {
  if (!maxPrice) return { check: 'price', outcome: 'not_applicable', code: 'no_max_price', detail: 'No max price set' };
  if (!price) return { check: 'price', outcome: 'unverified', code: 'no_price', detail: 'No price shown' };
  if (price.currency !== maxPrice.currency) {
    return { check: 'price', outcome: 'unverified', code: 'other_currency', detail: `Priced in ${price.currency}, your max is in ${maxPrice.currency}` };
  }
  return price.amountMinor <= maxPrice.amountMinor
    ? { check: 'price', outcome: 'pass', code: 'within_max_price', detail: 'At or under your max price' }
    : { check: 'price', outcome: 'fail', code: 'above_max_price', detail: 'Above your max price' };
}

function exclusionsCheck(exclusions: readonly string[], listing: MatchListing): MatchCheck {
  if (exclusions.length === 0) return { check: 'exclusions', outcome: 'not_applicable', code: 'no_exclusions', detail: 'No words to ignore' };
  const text = `${listing.title} ${listing.description ?? ''}`;
  const hits = exclusions.filter((e) => containsPhrase(text, e));
  return hits.length > 0
    ? { check: 'exclusions', outcome: 'fail', code: 'excluded_word', detail: `Mentions ${hits.map((h) => `"${h}"`).join(', ')}` }
    : { check: 'exclusions', outcome: 'pass', code: 'no_excluded_words', detail: 'None of your ignored words' };
}
