/**
 * Deterministic hunt matching and listing deduplication. Pure functions - no database, no network,
 * no AI - so the worker and the API apply exactly the same rules.
 */
export {
  CHECK_NAMES,
  MATCHER_VERSION,
  distanceBetweenKm,
  evaluateMatch,
  type CheckName,
  type CheckOutcome,
  type EconomicsInputs,
  type HuntTarget,
  type MatchCheck,
  type MatchContext,
  type MatchEvaluation,
  type MatchHunt,
  type MatchListing,
  type MatchPoint,
} from './match.js';
export { classifyCondition, type ConditionCategory } from './condition.js';
export { MIN_DEDUPE_TITLE_WORDS, canonicalOf, dedupeKeyFor, type DedupeCandidate, type DedupeInput } from './dedupe.js';
export { containsPhrase, normalizeText, significantTokens, tokenize } from './text.js';
