import { FoundryAIProvider, type FoundryConfig, type FoundryOptions } from './foundry/foundry-ai-provider.js';
import { MockAIProvider } from './mock/mock-ai-provider.js';
import { AIProviderError, type AIProvider, type AIProviderId } from './provider.js';
import { withValidation } from './validation.js';

/** The deterministic mock, with the shared output validation applied. */
export function createMockAIProvider(): AIProvider {
  return withValidation(new MockAIProvider());
}

/** Providers are always returned validated. `foundry` needs its config (see resolveFoundryConfig). */
export function createAIProvider(id: AIProviderId, foundry: FoundryConfig | null = null, options?: FoundryOptions): AIProvider {
  switch (id) {
    case 'mock':
      return createMockAIProvider();
    case 'foundry':
      if (!foundry) throw new AIProviderError('NOT_CONFIGURED', 'AI_PROVIDER=foundry needs FOUNDRY_ENDPOINT, FOUNDRY_API_KEY and FOUNDRY_DEPLOYMENT');
      return withValidation(new FoundryAIProvider(foundry, options));
  }
}
