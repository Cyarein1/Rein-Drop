import {
  AIProviderError,
  NO_EXTERNAL_EVIDENCE,
  type AIProvider,
  type HuntContext,
  type ListingFacts,
  type MatchCheckFact,
  type Money,
} from './provider.js';
import {
  AI_SCHEMA_VERSION,
  type AIResultMeta,
  type ConditionRiskAssessment,
  type DealExplanation,
  type ProductExtraction,
} from './schemas.js';

export interface CandidateAnalysisInput {
  listing: ListingFacts;
  hunt: HuntContext;
  matchChecks: MatchCheckFact[];
  economics: { acquisition: Money | null; target: HuntContext['target'] };
  /** "Now" for time-based reasoning (ISO). Part of the input so results are reproducible. */
  asOf: string;
}

/** What gets stored in DealAnalysis.result. */
export interface CandidateAnalysisResult {
  schemaVersion: number;
  product: ProductExtraction;
  risk: ConditionRiskAssessment;
  explanation: DealExplanation;
}

/** Maps 1:1 onto the DealAnalysis columns. */
export type CandidateAnalysisRecord = {
  provider: string;
  model: string | null;
  modelVersion: string | null;
  /** Task prompt versions, e.g. "product-extraction@1,condition-risk@1,deal-explanation@1". */
  promptVersion: string | null;
  schemaVersion: number;
  /** Per-task metadata (latency, usage, request ids). */
  providerMetadata: { tasks: Record<string, AIResultMeta> };
  durationMs: number;
} & (
  | { status: 'COMPLETED'; result: CandidateAnalysisResult; errorMessage: null }
  | { status: 'FAILED'; result: null; errorCode: AIProviderError['code']; errorMessage: string; retryable: boolean }
);

const unique = (values: string[]) => (values.length > 0 ? [...new Set(values)].join(',') : null);

/**
 * Runs the three analysis tasks for one candidate (a matched listing) and returns a record ready to
 * persist. Never throws for provider failures: they become a FAILED record (with `retryable`).
 */
export async function analyzeCandidate(
  provider: AIProvider,
  input: CandidateAnalysisInput,
  clock: () => number = () => Date.now(),
): Promise<CandidateAnalysisRecord> {
  const started = clock();
  const tasks: Record<string, AIResultMeta> = {};
  const base = () => {
    const metas = Object.values(tasks);
    return {
      provider: provider.id,
      model: unique(metas.map((m) => m.model)),
      modelVersion: unique(metas.map((m) => m.modelVersion)),
      promptVersion: unique(metas.map((m) => m.promptVersion)),
      schemaVersion: AI_SCHEMA_VERSION,
      providerMetadata: { tasks },
      durationMs: Math.max(0, Math.round(clock() - started)),
    };
  };

  try {
    const [product, risk] = await Promise.all([
      provider.extractProduct({ listing: input.listing, hunt: { query: input.hunt.query } }),
      provider.assessConditionRisk({ listing: input.listing, asOf: input.asOf, evidence: NO_EXTERNAL_EVIDENCE }),
    ]);
    tasks.extractProduct = product.meta;
    tasks.assessConditionRisk = risk.meta;
    const explanation = await provider.explainDeal({
      listing: input.listing,
      hunt: input.hunt,
      matchChecks: input.matchChecks,
      product: product.output,
      risk: risk.output,
      economics: input.economics,
      evidence: NO_EXTERNAL_EVIDENCE,
    });
    tasks.explainDeal = explanation.meta;
    return {
      ...base(),
      status: 'COMPLETED',
      result: { schemaVersion: AI_SCHEMA_VERSION, product: product.output, risk: risk.output, explanation: explanation.output },
      errorMessage: null,
    };
  } catch (err) {
    const error =
      err instanceof AIProviderError ? err : new AIProviderError('UNAVAILABLE', err instanceof Error ? err.message : String(err), [], { cause: err });
    return {
      ...base(),
      status: 'FAILED',
      result: null,
      errorCode: error.code,
      errorMessage: [error.message, ...error.details].join(' | ').slice(0, 2000),
      retryable: error.retryable,
    };
  }
}

/**
 * Stable text of everything that determines an analysis (input + versions). Hash it (e.g. SHA-256
 * in the worker) for DealAnalysis.inputHash, to skip re-analysing unchanged candidates.
 */
export function analysisInputKey(input: CandidateAnalysisInput, versions: { provider: string; promptVersion: string | null }): string {
  return stableStringify({ input, versions, schemaVersion: AI_SCHEMA_VERSION });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
