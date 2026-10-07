import type { ConditionRiskAssessment, ProductExtraction } from '@rein-drop/ai-core';
import type { DealEconomics } from './economics.js';
import {
  DEFAULT_SCORING_POLICY,
  SCORING_VERSION,
  type ConfidenceLevel,
  type DealStrength,
  type ScoringPolicy,
} from './policy.js';

/**
 * Overall classification of a candidate: deterministic economics (authoritative) combined with the
 * AIProvider's qualitative output (product identity, condition / risk). Every rule that fired is
 * returned as a reason, so the outcome can always be explained.
 */

export interface ScoreInput {
  economics: DealEconomics;
  /** The validated AI analysis (CandidateAnalysisResult product + risk). */
  analysis: { product: ProductExtraction; risk: ConditionRiskAssessment };
  /** 0-100 query coverage from the hunt matcher; null when unknown. */
  relevanceScore: number | null;
}

/**
 * - blocks: rules the deal out (strength `weak`);
 * - caps: keeps it below `strong`;
 * - supports: counts in its favour;
 * - note: worth knowing, no effect on strength.
 */
export interface ScoreReason {
  code: string;
  effect: 'blocks' | 'caps' | 'supports' | 'note';
  detail: string;
}

export interface DealAssessment {
  scoringVersion: number;
  strength: DealStrength;
  confidence: ConfidenceLevel;
  /**
   * 0-100 ranking score. Bands never overlap, so a stronger deal always outranks a weaker one:
   * weak 5-20, moderate 35-50, strong 65-80, exceptional 85-100. Freshness is NOT included -
   * it changes with time, so the feed applies it when reading.
   */
  score: number;
  strengthReasons: ScoreReason[];
  confidenceReasons: ScoreReason[];
}

const BAND_START: Record<DealStrength, number> = { weak: 5, moderate: 35, strong: 65, exceptional: 85 };
const MAX_BONUS = 15;

export function scoreCandidate(input: ScoreInput, policy: ScoringPolicy = DEFAULT_SCORING_POLICY): DealAssessment {
  const confidence = assessConfidence(input);
  const { strength, reasons } = assessStrength(input, confidence.level, policy);
  return {
    scoringVersion: SCORING_VERSION,
    strength,
    confidence: confidence.level,
    score: BAND_START[strength] + bonus(input, confidence.level),
    strengthReasons: reasons,
    confidenceReasons: confidence.reasons,
  };
}

function assessConfidence({ economics, analysis: { product, risk } }: ScoreInput): { level: ConfidenceLevel; reasons: ScoreReason[] } {
  const low: ScoreReason[] = [];
  if (product.confidence === 'low') low.push({ code: 'product_not_identified', effect: 'caps', detail: "Couldn't tell exactly which product this is" });
  if (product.queryFit === 'unclear') low.push({ code: 'fit_unclear', effect: 'caps', detail: product.queryFitNote });
  if (risk.riskLevel === 'unknown') low.push({ code: 'condition_unknown', effect: 'caps', detail: "The listing doesn't describe its condition" });
  if (!economics.asking) low.push({ code: 'no_price', effect: 'caps', detail: 'No asking price shown' });
  if (low.length > 0) return { level: 'low', reasons: low };

  const reasons: ScoreReason[] = [];
  if (product.confidence !== 'high') {
    reasons.push({ code: 'product_partly_identified', effect: 'caps', detail: 'Brand or model only partly identified' });
  } else {
    reasons.push({ code: 'product_identified', effect: 'supports', detail: product.normalizedName ?? 'Product identified' });
  }
  if (economics.resale.status !== 'estimated') {
    reasons.push({ code: 'no_resale_estimate', effect: 'caps', detail: economics.resale.detail });
  } else {
    reasons.push({ code: 'resale_estimated', effect: 'supports', detail: `${economics.resale.sampleSize} comparable sales` });
  }
  const high = product.confidence === 'high' && product.queryFit === 'matches' && economics.resale.status === 'estimated';
  return { level: high ? 'high' : 'medium', reasons };
}

function assessStrength(
  { economics, analysis: { product, risk } }: ScoreInput,
  confidence: ConfidenceLevel,
  policy: ScoringPolicy,
): { strength: DealStrength; reasons: ScoreReason[] } {
  const reasons: ScoreReason[] = [];
  const add = (code: string, effect: ScoreReason['effect'], detail: string) => reasons.push({ code, effect, detail });
  const { maxPrice, target, estimatedUpside } = economics;

  // Blockers: rule the deal out.
  if (product.queryFit === 'conflicts') add('product_conflicts', 'blocks', product.queryFitNote);
  if (risk.riskLevel === 'high') {
    const serious = risk.riskFactors.filter((f) => f.severity === 'high').map((f) => f.note);
    add('high_risk', 'blocks', serious.join('; ') || 'High risk');
  }
  if (maxPrice?.status === 'above') add('above_max_price', 'blocks', 'Asking price is above your max price');
  if (target?.status === 'not_met') add('target_not_met', 'blocks', target.detail);
  if (estimatedUpside.status === 'estimated' && estimatedUpside.typical.amountMinor <= 0) {
    add('no_estimated_upside', 'blocks', 'Comparable sales are at or below what it would cost you');
  }

  // Your own criteria, verified against known numbers.
  let verified = 0;
  if (maxPrice?.status === 'within') {
    if (maxPrice.withKnownCosts === 'within') {
      verified += 1;
      add('within_max_price', 'supports', 'Within your max price, including known costs');
    } else {
      add('over_max_with_costs', 'caps', 'Within your max price, but not once its shipping is added');
    }
  } else if (maxPrice?.status === 'unverified') {
    add('max_price_unverified', 'caps', maxPrice.reason === 'no_price' ? 'No asking price to compare with your max' : 'Priced in another currency');
  }
  if (target?.status === 'met') {
    verified += 1;
    add('target_met', 'supports', target.detail);
  } else if (target?.status === 'unverified') {
    add('target_unverified', policy.allowStrongWithUnverifiedTarget ? 'note' : 'caps', `Upside not estimated yet: ${target.detail.toLowerCase()}`);
  }
  if (verified === 0) {
    add(
      'no_verified_criterion',
      'caps',
      !maxPrice && !target ? 'Your hunt has no max price or target to check against' : "None of your price criteria could be checked",
    );
  }

  // Rein Drop's own bar.
  if (risk.riskLevel === 'low') add('low_risk', 'supports', 'No condition or risk concerns found');
  else if (risk.riskLevel === 'medium') add('some_risk', 'caps', risk.riskFactors.filter((f) => f.severity === 'medium').map((f) => f.note).join('; ') || 'Some risk');
  else if (risk.riskLevel === 'unknown') add('risk_unknown', 'caps', "The listing doesn't say enough to judge its condition");
  if (product.queryFit === 'matches') add('product_matches', 'supports', product.queryFitNote);
  if (confidence === 'low') add('low_confidence', 'caps', 'Rein Drop is not confident in this assessment');

  if (reasons.some((r) => r.effect === 'blocks')) return { strength: 'weak', reasons };
  if (reasons.some((r) => r.effect === 'caps')) return { strength: 'moderate', reasons };
  if (isExceptional(economics, confidence, policy)) {
    add('exceptional_upside', 'supports', `Estimated upside is at least ${policy.exceptionalTargetMultiple}x your target, even at the low end it meets it`);
    return { strength: 'exceptional', reasons };
  }
  return { strength: 'strong', reasons };
}

/** Needs a verified target AND comparables: never true while no resale source exists. */
function isExceptional(e: DealEconomics, confidence: ConfidenceLevel, policy: ScoringPolicy): boolean {
  if (confidence !== 'high' || e.target?.status !== 'met' || !e.target.metAtLowEnd || e.estimatedUpside.status !== 'estimated') return false;
  const { target } = e.target;
  if (target.kind === 'profit') return e.estimatedUpside.typical.amountMinor >= policy.exceptionalTargetMultiple * target.amount.amountMinor;
  const margin = e.estimatedUpside.typicalMarginPercent;
  return margin !== null && margin >= policy.exceptionalTargetMultiple * target.percent;
}

/** 0-15 within the strength band: confidence, query relevance and value (upside or headroom). */
function bonus({ economics, relevanceScore }: ScoreInput, confidence: ConfidenceLevel): number {
  const confidencePoints = { high: 5, medium: 2, low: 0 }[confidence];
  const relevancePoints = relevanceScore === null ? 0 : Math.round((4 * Math.min(100, Math.max(0, relevanceScore))) / 100);
  let valuePoints = 0;
  const { estimatedUpside, maxPrice } = economics;
  if (estimatedUpside.status === 'estimated' && estimatedUpside.typicalMarginPercent !== null) {
    valuePoints = clamp(Math.floor(estimatedUpside.typicalMarginPercent / 10), 0, 6);
  } else if (maxPrice && maxPrice.status !== 'unverified' && maxPrice.limit.amountMinor > 0) {
    // Up to 6 points; 50% or more under your max earns them all.
    valuePoints = clamp(Math.floor((12 * maxPrice.headroom.amountMinor) / maxPrice.limit.amountMinor), 0, 6);
  }
  return clamp(confidencePoints + relevancePoints + valuePoints, 0, MAX_BONUS);
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
