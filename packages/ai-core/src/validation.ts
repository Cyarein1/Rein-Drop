import type { z } from 'zod';
import { tokenize } from '@rein-drop/matching';
import { isGrounded } from './facts.js';
import {
  AIProviderError,
  type AIProvider,
  type AIResult,
  type ConditionRiskInput,
  type DealExplanationInput,
  type ProductExtractionInput,
} from './provider.js';
import {
  aiResultMetaSchema,
  conditionRiskSchema,
  dealExplanationSchema,
  productExtractionSchema,
  type ConditionRiskAssessment,
  type DealExplanation,
  type Evidence,
  type ProductExtraction,
} from './schemas.js';

/**
 * Wraps any provider so domain code only ever receives outputs that (1) match the task schema and
 * (2) are grounded in the input: quotes appear in the listing, fact values are the listing's real
 * values, and explanations only cite checks / risks / product fields that were provided. Seller
 * and comparable facts can't appear at all (the schemas only allow "not available").
 */
export function withValidation(provider: AIProvider): AIProvider {
  return {
    id: provider.id,
    extractProduct: (input) => run(provider.id, 'extractProduct', () => provider.extractProduct(input), (o) => checkProductExtraction(input, o)),
    assessConditionRisk: (input) =>
      run(provider.id, 'assessConditionRisk', () => provider.assessConditionRisk(input), (o) => checkConditionRisk(input, o)),
    explainDeal: (input) => run(provider.id, 'explainDeal', () => provider.explainDeal(input), (o) => checkDealExplanation(input, o)),
  };
}

async function run<T>(
  providerId: string,
  task: string,
  call: () => Promise<AIResult<unknown>>,
  check: (output: unknown) => T,
): Promise<AIResult<T>> {
  let result: AIResult<unknown>;
  try {
    result = await call();
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    throw new AIProviderError('UNAVAILABLE', `${providerId} ${task} failed`, [], { cause: err });
  }
  const meta = aiResultMetaSchema.safeParse(result.meta);
  if (!meta.success) throw new AIProviderError('INVALID_OUTPUT', `${task}: invalid result metadata`, issues(meta.error));
  return { output: check(result.output), meta: meta.data };
}

function parse<T>(schema: z.ZodType<T>, value: unknown, task: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AIProviderError('INVALID_OUTPUT', `${task}: output does not match the schema`, issues(parsed.error));
  return parsed.data;
}

function issues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

function ungrounded(task: string, problems: string[]): void {
  if (problems.length > 0) throw new AIProviderError('UNGROUNDED_OUTPUT', `${task}: output is not supported by the input`, problems);
}

const describe = (e: Evidence) => (e.source === 'text' ? `"${e.quote}" is not in ${e.field}` : `${e.field} is not "${e.value}"`);

export function checkProductExtraction(input: ProductExtractionInput, value: unknown): ProductExtraction {
  const output = parse(productExtractionSchema, value, 'extractProduct');
  const problems: string[] = [];
  const grounded = [
    ...(output.brand ? [['brand', output.brand] as const] : []),
    ...(output.model ? [['model', output.model] as const] : []),
    ...output.attributes.map((a) => [`attribute ${a.name}`, a] as const),
  ];
  for (const [name, fact] of grounded) {
    if (!isGrounded(input.listing, fact.evidence)) problems.push(`${name}: ${describe(fact.evidence)}`);
  }
  if (output.normalizedName) {
    const allowed = new Set(grounded.flatMap(([, fact]) => tokenize(fact.value)));
    const extra = tokenize(output.normalizedName).filter((t) => !allowed.has(t));
    if (extra.length > 0) problems.push(`normalizedName adds words not extracted from the listing: ${extra.join(', ')}`);
  }
  ungrounded('extractProduct', problems);
  return output;
}

export function checkConditionRisk(input: ConditionRiskInput, value: unknown): ConditionRiskAssessment {
  const output = parse(conditionRiskSchema, value, 'assessConditionRisk');
  const problems: string[] = [];
  if (output.conditionCategory !== 'unknown' && !output.conditionEvidence) problems.push('conditionCategory needs evidence');
  if (output.conditionEvidence && !isGrounded(input.listing, output.conditionEvidence)) {
    problems.push(`conditionEvidence: ${describe(output.conditionEvidence)}`);
  }
  for (const factor of output.riskFactors) {
    if (!isGrounded(input.listing, factor.evidence)) problems.push(`risk ${factor.code}: ${describe(factor.evidence)}`);
  }
  ungrounded('assessConditionRisk', problems);
  return output;
}

export function checkDealExplanation(input: DealExplanationInput, value: unknown): DealExplanation {
  const output = parse(dealExplanationSchema, value, 'explainDeal');
  const problems: string[] = [];
  const checks = new Map(input.matchChecks.map((c) => [c.check, c.outcome]));
  const risks = new Set(input.risk.riskFactors.map((r) => r.code));
  const verify = (list: 'positives' | 'concerns') =>
    output[list].forEach((point, i) => {
      const where = `${list}.${i}`;
      const { basis } = point;
      if (basis.kind === 'match_check') {
        const outcome = checks.get(basis.check);
        if (!outcome) problems.push(`${where}: no match check "${basis.check}" was provided`);
        else if (list === 'positives' && outcome !== 'pass') problems.push(`${where}: check "${basis.check}" did not pass`);
        else if (list === 'concerns' && outcome === 'pass') problems.push(`${where}: check "${basis.check}" passed`);
      } else if (basis.kind === 'risk_factor') {
        if (!risks.has(basis.code)) problems.push(`${where}: risk "${basis.code}" was not assessed`);
        if (list === 'positives') problems.push(`${where}: a risk can't be a positive`);
      } else if (basis.kind === 'product' && basis.field !== 'queryFit' && input.product[basis.field] === null) {
        problems.push(`${where}: no ${basis.field} was extracted`);
      }
    });
  verify('positives');
  verify('concerns');
  ungrounded('explainDeal', problems);
  return output;
}
