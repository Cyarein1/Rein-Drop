/**
 * AI boundary. All AI goes through an AIProvider so the app runs locally on a deterministic mock and
 * use Microsoft Foundry (AI_PROVIDER=foundry) without changing domain code. Every output is
 * structured, schema-validated and grounded in the input (see validation.ts).
 */
export {
  AI_ERROR_CODES,
  AI_PROVIDER_IDS,
  AIProviderError,
  DEFAULT_AI_PROVIDER,
  NO_EXTERNAL_EVIDENCE,
  type AIErrorCode,
  type AIProvider,
  type AIProviderId,
  type AIResult,
  type ConditionRiskInput,
  type DealExplanationInput,
  type EvidenceAvailability,
  type HuntContext,
  type HuntTarget,
  type ListingFacts,
  type MatchCheckFact,
  type Money,
  type ProductExtractionInput,
} from './provider.js';
export {
  AI_SCHEMA_VERSION,
  FACT_FIELDS,
  PRODUCT_ATTRIBUTES,
  PRODUCT_CATEGORIES,
  QUESTION_TOPICS,
  RISK_CODES,
  TEXT_FIELDS,
  aiResultMetaSchema,
  conditionRiskSchema,
  dealExplanationSchema,
  evidenceSchema,
  productExtractionSchema,
  type AIResultMeta,
  type ConditionRiskAssessment,
  type DealExplanation,
  type Evidence,
  type ExplanationPoint,
  type ProductExtraction,
  type RiskCode,
} from './schemas.js';
export { factValue, isGrounded } from './facts.js';
export { checkConditionRisk, checkDealExplanation, checkProductExtraction, withValidation } from './validation.js';
export { MOCK_MODEL, MockAIProvider } from './mock/mock-ai-provider.js';
export {
  analysisInputKey,
  analyzeCandidate,
  type CandidateAnalysisInput,
  type CandidateAnalysisRecord,
  type CandidateAnalysisResult,
} from './analysis.js';
export { createAIProvider, createMockAIProvider } from './factory.js';
export {
  FOUNDRY_DEFAULTS,
  FoundryAIProvider,
  chatCompletionsUrl,
  foundryWorstCaseMs,
  type FoundryAuth,
  type FoundryConfig,
  type FoundryFetch,
  type FoundryHttpResponse,
  type FoundryOptions,
} from './foundry/foundry-ai-provider.js';
export { foundryEnvShape, resolveFoundryConfig, type FoundryEnv } from './foundry/foundry-config.js';
export { FOUNDRY_PROMPT_VERSIONS, type FoundryTask } from './foundry/prompts.js';
export { toStrictJsonSchema } from './foundry/strict-json-schema.js';
