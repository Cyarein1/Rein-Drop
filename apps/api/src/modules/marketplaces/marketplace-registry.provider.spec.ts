import { createMarketplaceRegistry } from './marketplace-registry.provider.js';

describe('createMarketplaceRegistry', () => {
  it('uses mock sources for both launch marketplaces outside production', async () => {
    const registry = createMarketplaceRegistry({ nodeEnv: 'development' });
    expect(registry.get('ebay').provider).toBe('mock');
    expect(registry.get('facebook').provider).toBe('mock');
    expect((await registry.health()).map((h) => h.status)).toEqual(['healthy', 'healthy']);
  });

  it('registers no mock sources in production', async () => {
    const registry = createMarketplaceRegistry({ nodeEnv: 'production' });
    expect(registry.list()).toEqual([]);
    expect((await registry.health()).map((h) => h.status)).toEqual(['not_configured', 'not_configured']);
  });
});
