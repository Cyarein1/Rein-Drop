/**
 * Deal scoring: deterministic economics, strength / confidence classification combining them with
 * the AIProvider's qualitative analysis, and alert eligibility. Pure functions - no database, no
 * network, no AI calls - so the worker and the API apply exactly the same rules.
 *
 * Estimated upside is always labelled as an estimate; realized profit only ever comes from recorded
 * purchases and sales (Outcomes), never from here.
 */
export {
  CONFIDENCE_LEVELS,
  DEAL_STRENGTHS,
  DEFAULT_SCORING_POLICY,
  SCORING_VERSION,
  atLeastConfidence,
  atLeastStrength,
  type ConfidenceLevel,
  type DealStrength,
  type ScoringPolicy,
} from './policy.js';
export {
  COSTS_NOT_INCLUDED,
  ECONOMICS_VERSION,
  computeEconomics,
  type Amount,
  type ComparableSales,
  type CostNotIncluded,
  type DealEconomics,
  type EconomicsInput,
  type EstimatedUpside,
  type KnownCost,
  type MaxPriceCheck,
  type ResaleEstimate,
  type TargetCheck,
} from './economics.js';
export { FEED_RANKING, feedRank } from './feed.js';
export { scoreCandidate, type DealAssessment, type ScoreInput, type ScoreReason } from './classify.js';
export {
  ALERT_RULES,
  evaluateAlertEligibility,
  type AlertEligibility,
  type AlertEligibilityInput,
  type AlertKind,
  type AlertRule,
  type AlertRuleOutcome,
} from './alerts.js';
