import { createMarketplaceRegistry } from './marketplace-registry.provider.js';

const normal = { ebay: 'normal', facebook: 'normal' } as const;

describe('createMarketplaceRegistry', () => {
  it('uses the development sources for both launch marketplaces outside production', async () => {
    const registry = createMarketplaceRegistry({ nodeEnv: 'development', devMarketplaceScenarios: normal });
    expect(registry.get('ebay').provider).toBe('dev');
    expect(registry.get('facebook').provider).toBe('dev');
    expect((await registry.health()).map((h) => h.status)).toEqual(['healthy', 'healthy']);
  });

  it('applies the configured development scenarios', async () => {
    const registry = createMarketplaceRegistry({
      nodeEnv: 'development',
      devMarketplaceScenarios: { ebay: 'rate_limited', facebook: 'unavailable' },
    });
    expect((await registry.health()).map((h) => h.status)).toEqual(['degraded', 'down']);
  });

  it('registers no development sources in production', async () => {
    const registry = createMarketplaceRegistry({ nodeEnv: 'production', devMarketplaceScenarios: normal });
    expect(registry.list()).toEqual([]);
    expect((await registry.health()).map((h) => h.status)).toEqual(['not_configured', 'not_configured']);
  });
});
