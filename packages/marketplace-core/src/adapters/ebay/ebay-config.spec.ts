import { describe, expect, it } from 'vitest';
import { resolveEbaySource } from './ebay-config.js';

describe('eBay source from the environment', () => {
  it('development source by default outside production (mock mode preserved)', () => {
    expect(resolveEbaySource({}, 'development')).toEqual({ api: null, problems: [] });
    expect(resolveEbaySource({ EBAY_CLIENT_ID: 'x', EBAY_CLIENT_SECRET: 'y' }, 'test')).toEqual({ api: null, problems: [] }); // opt-in only
  });

  it('api needs both credentials; defaults to production + EBAY_US', () => {
    expect(resolveEbaySource({ EBAY_SOURCE: 'api' }, 'development').problems).toEqual([
      'EBAY_CLIENT_ID: required when EBAY_SOURCE=api',
      'EBAY_CLIENT_SECRET: required when EBAY_SOURCE=api',
    ]);
    expect(resolveEbaySource({ EBAY_SOURCE: 'api', EBAY_CLIENT_ID: 'id', EBAY_CLIENT_SECRET: 'secret' }, 'development')).toEqual({
      api: { clientId: 'id', clientSecret: 'secret', environment: 'production', marketplaceId: 'EBAY_US' },
      problems: [],
    });
    expect(
      resolveEbaySource({ EBAY_SOURCE: 'api', EBAY_CLIENT_ID: 'id', EBAY_CLIENT_SECRET: 's', EBAY_ENVIRONMENT: 'sandbox', EBAY_MARKETPLACE_ID: 'EBAY_GB' }, 'test').api,
    ).toMatchObject({ environment: 'sandbox', marketplaceId: 'EBAY_GB' });
  });

  it('production uses the real API and refuses the development source', () => {
    expect(resolveEbaySource({}, 'production').problems).toHaveLength(2); // credentials required
    expect(resolveEbaySource({ EBAY_SOURCE: 'dev' }, 'production').problems).toEqual(['EBAY_SOURCE: "dev" is development-only, not allowed when NODE_ENV=production']);
  });
});
