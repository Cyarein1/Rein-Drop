import { EnvValidationError, LOCAL_DATABASE_URL } from '@rein-drop/env';
import { loadApiConfig } from './api-config.js';

function problemsFor(env: Record<string, string | undefined>): string[] {
  try {
    loadApiConfig(env);
  } catch (err) {
    if (err instanceof EnvValidationError) return [...err.problems];
    throw err;
  }
  throw new Error('expected EnvValidationError');
}

// Production needs a real eBay source and Stripe billing; these tests are about other variables.
const EBAY = {
  EBAY_CLIENT_ID: 'test-id',
  EBAY_CLIENT_SECRET: 'test-secret',
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
  STRIPE_PRICE_IDS: 'pro=price_123',
  WEB_APP_URL: 'https://app.example.com',
};

describe('loadApiConfig', () => {
  it('uses local defaults when nothing is set (dev auth outside production)', () => {
    expect(loadApiConfig({})).toEqual({
      nodeEnv: 'development',
      port: 4000,
      databaseUrl: LOCAL_DATABASE_URL,
      authProvider: 'dev',
      rateLimitPerMinute: 600,
      trustProxyHops: 0,
      logFormat: 'text',
      entra: null,
      billing: { provider: 'dev' },
      devMarketplaceScenarios: { ebay: 'normal', facebook: 'normal' },
      ebayApi: null,
      facebookApify: null,
      productEvents: 'log',
      geo: { provider: 'mock', azure: null },
      accessPolicy: { graceDays: 0 },
      featureFlags: [],
      ai: { provider: 'mock', foundry: null },
      media: { storage: 'local', dir: '.data/media', signingSecret: expect.any(String) },
    });
  });

  it('refuses dev auth in production', () => {
    expect(
      problemsFor({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app', AUTH_PROVIDER: 'dev', ...EBAY }),
    ).toEqual([
      'AUTH_PROVIDER: "dev" is a development-only provider and is not allowed when NODE_ENV=production',
    ]);
  });

  it('requires an explicit auth provider in production (no default)', () => {
    expect(problemsFor({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app' })).toEqual([
      'AUTH_PROVIDER: is required when NODE_ENV=production',
    ]);
  });

  const ENTRA = {
    AUTH_PROVIDER: 'entra',
    ENTRA_AUTHORITY: 'https://reindrop.ciamlogin.com',
    ENTRA_TENANT_ID: '11111111-2222-3333-4444-555555555555',
    ENTRA_API_CLIENT_ID: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
  };

  it('configures Microsoft Entra External ID (identifiers only, no secrets)', () => {
    expect(loadApiConfig(ENTRA)).toMatchObject({
      authProvider: 'entra',
      entra: {
        authority: 'https://reindrop.ciamlogin.com',
        tenantId: '11111111-2222-3333-4444-555555555555',
        audience: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        requiredScope: 'access_as_user',
      },
    });
    expect(loadApiConfig({ ...ENTRA, ENTRA_REQUIRED_SCOPE: 'deals.read' }).entra?.requiredScope).toBe('deals.read');
    // Production with Entra starts.
    expect(loadApiConfig({ ...ENTRA, NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app', ...EBAY }).authProvider).toBe('entra');
  });

  it('lists every missing or malformed Entra setting', () => {
    expect(problemsFor({ AUTH_PROVIDER: 'entra' })).toEqual([
      'ENTRA_AUTHORITY: required when AUTH_PROVIDER=entra',
      'ENTRA_TENANT_ID: required when AUTH_PROVIDER=entra',
      'ENTRA_API_CLIENT_ID: required when AUTH_PROVIDER=entra',
    ]);
    expect(problemsFor({ ...ENTRA, ENTRA_AUTHORITY: 'http://reindrop.ciamlogin.com', ENTRA_TENANT_ID: 'reindrop' })).toEqual([
      'ENTRA_AUTHORITY: must be an https URL (got "http://reindrop.ciamlogin.com")',
      'ENTRA_TENANT_ID: must be the directory (tenant) ID, a GUID (got "reindrop")',
    ]);
  });

  it('never echoes a malformed secret back (Stripe keys)', () => {
    const problems = problemsFor({ BILLING_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'pk_live_oops-public-key', STRIPE_WEBHOOK_SECRET: 'secret-value-123' }).join(' ');
    expect(problems).toContain('STRIPE_SECRET_KEY: must be a Stripe secret');
    expect(problems).not.toContain('pk_live_oops-public-key');
    expect(problems).not.toContain('secret-value-123');
  });

  it('geocoding: mock in development, none (free text) by default in production, mock refused there', () => {
    expect(loadApiConfig({ ...ENTRA, NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app', ...EBAY }).geo).toEqual({ provider: 'none', azure: null });
    expect(problemsFor({ ...ENTRA, NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app', ...EBAY, GEOCODING_PROVIDER: 'mock' })).toEqual([
      'GEOCODING_PROVIDER: "mock" is development-only (made-up place list), not allowed when NODE_ENV=production',
    ]);
    expect(problemsFor({ GEOCODING_PROVIDER: 'azure' })).toEqual(['AZURE_MAPS_KEY: required when GEOCODING_PROVIDER=azure']);
    expect(loadApiConfig({ GEOCODING_PROVIDER: 'azure', AZURE_MAPS_KEY: 'k' }).geo.provider).toBe('azure');
  });

  it('feature flags: none by default, a comma list of known flags, typos refused', () => {
    expect(loadApiConfig({ FEATURE_FLAGS: ' hunts.hot , sell.workspace,hunts.hot' }).featureFlags).toEqual(['hunts.hot', 'sell.workspace']);
    expect(problemsFor({ FEATURE_FLAGS: 'hunts.hott' })[0]).toMatch(/^FEATURE_FLAGS(\.\d+)?: must be a comma-separated list of: sell.workspace/);
  });

  it('rejects unknown auth providers', () => {
    expect(problemsFor({ AUTH_PROVIDER: 'magic' })[0]).toMatch(/^AUTH_PROVIDER: must be one of: dev/);
  });

  it('treats empty strings as unset', () => {
    expect(loadApiConfig({ PORT: '', DATABASE_URL: ' ' }).port).toBe(4000);
  });

  it('parses provided values', () => {
    const config = loadApiConfig({
      NODE_ENV: 'test',
      PORT: '8080',
      DATABASE_URL: 'postgresql://u:p@db.example:5432/app',
      AUTH_PROVIDER: 'dev',
    });
    expect(config).toEqual({
      nodeEnv: 'test',
      port: 8080,
      databaseUrl: 'postgresql://u:p@db.example:5432/app',
      authProvider: 'dev',
      rateLimitPerMinute: 600,
      trustProxyHops: 0,
      logFormat: 'text',
      entra: null,
      billing: { provider: 'dev' },
      devMarketplaceScenarios: { ebay: 'normal', facebook: 'normal' },
      ebayApi: null,
      facebookApify: null,
      productEvents: 'log',
      geo: { provider: 'mock', azure: null },
      accessPolicy: { graceDays: 0 },
      featureFlags: [],
      ai: { provider: 'mock', foundry: null },
      media: { storage: 'local', dir: '.data/media', signingSecret: expect.any(String) },
    });
  });

  it('Sell AI drafts and listing photos (decision 0019): development defaults; production refuses mocks and local disk', () => {
    const prod = { ...ENTRA, NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app', ...EBAY };
    expect(loadApiConfig(prod)).toMatchObject({ ai: null, media: { storage: 'none' } });
    expect(problemsFor({ ...prod, AI_PROVIDER: 'mock' })).toContain('AI_PROVIDER: mock is development-only, not allowed when NODE_ENV=production');
    expect(problemsFor({ ...prod, MEDIA_STORAGE: 'local' })).toEqual(
      expect.arrayContaining(['MEDIA_STORAGE: local is development-only (container disks are not durable)', 'MEDIA_SIGNING_SECRET: required when photos are stored in production']),
    );
    expect(problemsFor({ MEDIA_STORAGE: 'azure' })).toContain('MEDIA_STORAGE: azure is not built yet (TODO(media)) - use none in production for now');
    expect(problemsFor({ AI_PROVIDER: 'foundry' }).join(' ')).toMatch(/FOUNDRY_ENDPOINT: required/);
  });

  it('selects development marketplace scenarios', () => {
    expect(loadApiConfig({ EBAY_DEV_SCENARIO: 'rate_limited', FACEBOOK_DEV_SCENARIO: 'degraded' }).devMarketplaceScenarios).toEqual({
      ebay: 'rate_limited',
      facebook: 'degraded',
    });
    expect(problemsFor({ EBAY_DEV_SCENARIO: 'chaos' })[0]).toMatch(/^EBAY_DEV_SCENARIO: must be one of: normal, empty/);
  });

  it('refuses development marketplace scenarios in production', () => {
    expect(
      problemsFor({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@db/app',
        AUTH_PROVIDER: 'dev',
        FACEBOOK_DEV_SCENARIO: 'normal',
        ...EBAY,
      }),
    ).toEqual([
      'AUTH_PROVIDER: "dev" is a development-only provider and is not allowed when NODE_ENV=production',
      'FACEBOOK_DEV_SCENARIO: development-only, not allowed when NODE_ENV=production',
    ]);
  });

  it('rejects an invalid PORT with the received value', () => {
    expect(problemsFor({ PORT: 'abc' })).toEqual([
      'PORT: must be an integer between 1 and 65535 (got "abc")',
    ]);
    expect(problemsFor({ PORT: '70000' })[0]).toMatch(/^PORT: must be an integer/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(problemsFor({ NODE_ENV: 'staging' })[0]).toMatch(/^NODE_ENV: must be one of/);
  });

  it('rejects a non-postgres DATABASE_URL without echoing it', () => {
    const [problem] = problemsFor({ DATABASE_URL: 'mysql://u:secret@host/db' });
    expect(problem).toMatch(/^DATABASE_URL: must be a postgresql:\/\//);
    expect(problem).not.toContain('secret');
  });

  it('requires DATABASE_URL in production', () => {
    expect(problemsFor({ NODE_ENV: 'production' })).toContain(
      'DATABASE_URL: is required when NODE_ENV=production',
    );
  });

  it('reports every problem at once', () => {
    expect(problemsFor({ NODE_ENV: 'nope', PORT: '-1' })).toHaveLength(2);
    // A field that fails to parse must not hide the production requirement.
    expect(problemsFor({ NODE_ENV: 'production', PORT: 'abc' })).toEqual([
      'PORT: must be an integer between 1 and 65535 (got "abc")',
      'DATABASE_URL: is required when NODE_ENV=production',
      'AUTH_PROVIDER: is required when NODE_ENV=production',
    ]);
  });

  it('eBay: development source by default; the real Browse API with credentials (never in errors)', () => {
    expect(loadApiConfig({}).ebayApi).toBeNull();
    expect(loadApiConfig({ EBAY_SOURCE: 'api', ...EBAY, EBAY_ENVIRONMENT: 'sandbox' }).ebayApi).toEqual({
      clientId: 'test-id',
      clientSecret: 'test-secret',
      environment: 'sandbox',
      marketplaceId: 'EBAY_US',
    });
    expect(problemsFor({ EBAY_SOURCE: 'api', EBAY_CLIENT_ID: 'test-id' })).toEqual(['EBAY_CLIENT_SECRET: required when EBAY_SOURCE=api']);
    expect(problemsFor({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app', AUTH_PROVIDER: 'dev', EBAY_SOURCE: 'dev', EBAY_CLIENT_SECRET: 'shh' }).join(' ')).not.toContain('shh');
  });
});
