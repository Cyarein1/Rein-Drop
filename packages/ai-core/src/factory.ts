import { MockAIProvider } from './mock/mock-ai-provider.js';
import { AIProviderError, type AIProvider, type AIProviderId } from './provider.js';
import { withValidation } from './validation.js';

/** The deterministic mock, with the shared output validation applied. */
export function createMockAIProvider(): AIProvider {
  return withValidation(new MockAIProvider());
}

/** Providers are always returned validated. */
export function createAIProvider(id: AIProviderId): AIProvider {
  switch (id) {
    case 'mock':
      return createMockAIProvider();
    case 'foundry':
      // TODO(ai): Microsoft Foundry provider - models per task and credentials are TBD.
      throw new AIProviderError('NOT_CONFIGURED', 'The Foundry AI provider is not available yet');
  }
}
