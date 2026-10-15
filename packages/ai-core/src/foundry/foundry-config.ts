import { z } from 'zod';
import type { AIProviderId } from '../provider.js';
import type { FoundryConfig } from './foundry-ai-provider.js';

/**
 * Foundry AIProvider configuration from environment variables (worker config). Deployment names
 * and prices come only from here - never from source code. See docs/decisions/0012-foundry-ai-provider.md.
 */
export const foundryEnvShape = {
  /** https://<resource>.openai.azure.com or https://<resource>.services.ai.azure.com (optionally ending in /openai/v1). */
  FOUNDRY_ENDPOINT: z.url({ protocol: /^https$/, error: 'must be an https URL' }).optional(),
  /** Resource key. Secret: never logged. */
  FOUNDRY_API_KEY: z.string().trim().min(1).optional(),
  /** Deployment used for every task unless a task has its own. */
  FOUNDRY_DEPLOYMENT: z.string().trim().min(1).optional(),
  FOUNDRY_DEPLOYMENT_PRODUCT_EXTRACTION: z.string().trim().min(1).optional(),
  FOUNDRY_DEPLOYMENT_CONDITION_RISK: z.string().trim().min(1).optional(),
  FOUNDRY_DEPLOYMENT_DEAL_EXPLANATION: z.string().trim().min(1).optional(),
  FOUNDRY_DEPLOYMENT_LISTING_DRAFT: z.string().trim().min(1).optional(),
  FOUNDRY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).optional(),
  FOUNDRY_MAX_RETRIES: z.coerce.number().int().min(0).max(5).optional(),
  FOUNDRY_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(16_000).optional(),
  /** USD per 1M input / output tokens from your Azure price sheet. Both or neither; without them cost is unknown. */
  FOUNDRY_PRICE_INPUT_PER_1M_USD: z.coerce.number().min(0).max(1_000).optional(),
  FOUNDRY_PRICE_OUTPUT_PER_1M_USD: z.coerce.number().min(0).max(1_000).optional(),
};
export type FoundryEnv = { [K in keyof typeof foundryEnvShape]?: z.infer<(typeof foundryEnvShape)[K]> };

/** The Foundry config when AI_PROVIDER=foundry (null otherwise), and every missing / inconsistent variable. */
export function resolveFoundryConfig(provider: AIProviderId, env: FoundryEnv): { foundry: FoundryConfig | null; problems: string[] } {
  if (provider !== 'foundry') return { foundry: null, problems: [] };
  const problems: string[] = [];
  if (!env.FOUNDRY_ENDPOINT) problems.push('FOUNDRY_ENDPOINT: required when AI_PROVIDER=foundry');
  if (!env.FOUNDRY_API_KEY) problems.push('FOUNDRY_API_KEY: required when AI_PROVIDER=foundry');
  const deployments = {
    extractProduct: env.FOUNDRY_DEPLOYMENT_PRODUCT_EXTRACTION ?? env.FOUNDRY_DEPLOYMENT,
    assessConditionRisk: env.FOUNDRY_DEPLOYMENT_CONDITION_RISK ?? env.FOUNDRY_DEPLOYMENT,
    explainDeal: env.FOUNDRY_DEPLOYMENT_DEAL_EXPLANATION ?? env.FOUNDRY_DEPLOYMENT,
    draftListing: env.FOUNDRY_DEPLOYMENT_LISTING_DRAFT ?? env.FOUNDRY_DEPLOYMENT,
  };
  if (Object.values(deployments).some((d) => !d)) {
    problems.push('FOUNDRY_DEPLOYMENT: required when AI_PROVIDER=foundry (or set every FOUNDRY_DEPLOYMENT_<TASK>)');
  }
  const hasIn = env.FOUNDRY_PRICE_INPUT_PER_1M_USD !== undefined;
  const hasOut = env.FOUNDRY_PRICE_OUTPUT_PER_1M_USD !== undefined;
  if (hasIn !== hasOut) problems.push('FOUNDRY_PRICE_INPUT_PER_1M_USD / FOUNDRY_PRICE_OUTPUT_PER_1M_USD: set both or neither');
  if (problems.length > 0) return { foundry: null, problems };
  return {
    foundry: {
      endpoint: env.FOUNDRY_ENDPOINT!,
      auth: { kind: 'api-key', key: env.FOUNDRY_API_KEY! },
      deployments: deployments as FoundryConfig['deployments'],
      timeoutMs: env.FOUNDRY_TIMEOUT_MS,
      maxRetries: env.FOUNDRY_MAX_RETRIES,
      maxOutputTokens: env.FOUNDRY_MAX_OUTPUT_TOKENS,
      pricing: hasIn ? { inputPer1M: env.FOUNDRY_PRICE_INPUT_PER_1M_USD!, outputPer1M: env.FOUNDRY_PRICE_OUTPUT_PER_1M_USD! } : null,
    },
    problems,
  };
}
