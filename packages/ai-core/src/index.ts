/**
 * AI boundary. All AI calls go through an AIProvider implementation so the
 * app can run locally with a deterministic mock and later use Microsoft
 * Foundry without changing domain code.
 *
 * TODO(ai): define the AIProvider interface once the first AI task is
 * specified, then add the deterministic MockAIProvider.
 * TODO(ai): Foundry models per task are TBD.
 */

/** `mock` = local deterministic provider (default). `foundry` = future Microsoft Foundry provider. */
export const AI_PROVIDER_IDS = ['mock', 'foundry'] as const;

export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];

export const DEFAULT_AI_PROVIDER: AIProviderId = 'mock';
