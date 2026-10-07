import type { DealAssessment } from './classify.js';
import { DEFAULT_SCORING_POLICY, atLeastConfidence, atLeastStrength, type ScoringPolicy } from './policy.js';

/**
 * Alert eligibility: "Rein Drop should not notify merely because a listing matches keywords; it
 * should notify because it appears worth attention" (App Flow Blueprint). A match is eligible only
 * when every rule passes; every rule's outcome is returned so a missing alert can be explained.
 *
 * This decides eligibility only. Creating alerts - at most once per match, channels, preferences,
 * quiet hours, per-hunt caps - is the Alerts stage (Build Prompt 24).
 */

export const ALERT_RULES = [
  'analysis_completed',
  'hunt_live',
  'match_new',
  'listing_active',
  'not_duplicate',
  'strength',
  'confidence',
  'fresh_listing',
] as const;
export type AlertRule = (typeof ALERT_RULES)[number];

/** `exceptional` = the rare, stronger treatment (Blueprint section 17). */
export type AlertKind = 'deal' | 'exceptional';

export interface AlertEligibilityInput {
  /** Null when the AI analysis failed: an unanalysed match never alerts. */
  assessment: DealAssessment | null;
  huntStatus: string;
  /** HuntMatch status: only NEW (not yet seen, dismissed or expired) can alert. */
  matchStatus: string;
  listingStatus: string;
  isDuplicate: boolean;
  /** When the seller posted it (ISO), null when the source doesn't say. */
  listedAt: string | null;
  /** Now (ISO). */
  asOf: string;
}

export interface AlertRuleOutcome {
  rule: AlertRule;
  passed: boolean;
  detail: string;
}

export interface AlertEligibility {
  eligible: boolean;
  kind: AlertKind | null;
  rules: AlertRuleOutcome[];
  /** Rules that failed, in ALERT_RULES order. */
  blockedBy: AlertRule[];
}

const HOUR_MS = 3_600_000;

export function evaluateAlertEligibility(input: AlertEligibilityInput, policy: ScoringPolicy = DEFAULT_SCORING_POLICY): AlertEligibility {
  const { assessment } = input;
  const ageHours = input.listedAt ? (Date.parse(input.asOf) - Date.parse(input.listedAt)) / HOUR_MS : null;
  const rules: AlertRuleOutcome[] = [
    assessment
      ? { rule: 'analysis_completed', passed: true, detail: 'Analysed' }
      : { rule: 'analysis_completed', passed: false, detail: 'The analysis did not complete' },
    { rule: 'hunt_live', passed: input.huntStatus === 'LIVE', detail: `Hunt is ${input.huntStatus.toLowerCase()}` },
    { rule: 'match_new', passed: input.matchStatus === 'NEW', detail: `Match is ${input.matchStatus.toLowerCase()}` },
    { rule: 'listing_active', passed: input.listingStatus === 'ACTIVE', detail: `Listing is ${input.listingStatus.toLowerCase()}` },
    { rule: 'not_duplicate', passed: !input.isDuplicate, detail: input.isDuplicate ? 'Duplicate of another listing' : 'Not a duplicate' },
    assessment
      ? {
          rule: 'strength',
          passed: atLeastStrength(assessment.strength, policy.minAlertStrength),
          detail: `Strength ${assessment.strength} (alerts need ${policy.minAlertStrength} or better)`,
        }
      : { rule: 'strength', passed: false, detail: 'Not scored' },
    assessment
      ? {
          rule: 'confidence',
          passed: atLeastConfidence(assessment.confidence, policy.minAlertConfidence),
          detail: `Confidence ${assessment.confidence} (alerts need ${policy.minAlertConfidence} or better)`,
        }
      : { rule: 'confidence', passed: false, detail: 'Not scored' },
    ageHours === null
      ? { rule: 'fresh_listing', passed: true, detail: "Posting date unknown - can't be ruled stale" }
      : {
          rule: 'fresh_listing',
          passed: ageHours <= policy.maxAlertListingAgeHours,
          detail: `Posted ${Math.max(0, Math.floor(ageHours))}h ago (alerts need ${policy.maxAlertListingAgeHours}h or less)`,
        },
  ];
  const blockedBy = rules.filter((r) => !r.passed).map((r) => r.rule);
  const eligible = blockedBy.length === 0;
  return {
    eligible,
    kind: eligible ? (assessment!.strength === 'exceptional' ? 'exceptional' : 'deal') : null,
    rules,
    blockedBy,
  };
}
