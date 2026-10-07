/**
 * Scoring policy: every threshold the classification and alert rules use, in one versioned place.
 *
 * TODO(product): these are PROPOSED DEFAULTS, not product decisions. The App Flow Blueprint
 * (section 22) leaves open "what qualifies as Strong vs Exceptional" and "what minimum resale-price
 * data is trustworthy enough". Change the values here (and bump SCORING_VERSION) once decided -
 * see docs/decisions/0005-deal-scoring.md.
 */

/** Bump whenever the rules or the default policy change, so stored analyses can be re-scored. */
export const SCORING_VERSION = 1;

/** Strongest first. `weak` = matched the hunt but something rules it out as a buy. */
export const DEAL_STRENGTHS = ['exceptional', 'strong', 'moderate', 'weak'] as const;
export type DealStrength = (typeof DEAL_STRENGTHS)[number];

/** How sure Rein Drop is about its own assessment (not about the deal being good). */
export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export interface ScoringPolicy {
  /** Fewest comparable sales a resale estimate may rest on. Below it, no estimate is made. */
  minComparableSales: number;
  /**
   * Exceptional = the low end of the estimated upside meets the hunt's target AND the typical
   * upside is at least this multiple of it ("materially above the strong-buy threshold",
   * Mascot Usage Guide). Needs comparables, so it cannot happen until a resale source exists.
   */
  exceptionalTargetMultiple: number;
  /**
   * While no resale source exists, a hunt's profit / margin target can't be checked. When true,
   * an unverified target doesn't stop a deal being `strong` - provided another of the user's
   * own price criteria (max price) was verified. Alerts then say the upside wasn't estimated.
   */
  allowStrongWithUnverifiedTarget: boolean;
  /** Weakest strength that may alert. */
  minAlertStrength: DealStrength;
  /** Lowest confidence that may alert. */
  minAlertConfidence: ConfidenceLevel;
  /**
   * Listings the seller posted longer ago than this don't alert (they still appear in the feed),
   * so a new hunt's first search doesn't alert on its whole backlog. Ignored when the source
   * doesn't say when the listing was posted.
   */
  maxAlertListingAgeHours: number;
}

export const DEFAULT_SCORING_POLICY: Readonly<ScoringPolicy> = Object.freeze({
  minComparableSales: 5,
  exceptionalTargetMultiple: 2,
  allowStrongWithUnverifiedTarget: true,
  minAlertStrength: 'strong',
  minAlertConfidence: 'medium',
  maxAlertListingAgeHours: 48,
});

const rank = <T extends string>(order: readonly T[], value: T) => order.length - order.indexOf(value);

/** True when `a` is at least as strong as `b`. */
export const atLeastStrength = (a: DealStrength, b: DealStrength) => rank(DEAL_STRENGTHS, a) >= rank(DEAL_STRENGTHS, b);
/** True when `a` is at least as confident as `b`. */
export const atLeastConfidence = (a: ConfidenceLevel, b: ConfidenceLevel) => rank(CONFIDENCE_LEVELS, a) >= rank(CONFIDENCE_LEVELS, b);
