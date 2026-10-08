import { EnvValidationError, LOCAL_DATABASE_URL } from '@rein-drop/env';
import { loadWorkerConfig } from './worker-config.js';

describe('loadWorkerConfig', () => {
  it('uses local defaults when nothing is set', () => {
    expect(loadWorkerConfig({})).toEqual({
      nodeEnv: 'development',
      databaseUrl: LOCAL_DATABASE_URL,
      heartbeatMs: 60_000,
      pipeline: {
        pollIntervalMs: 15 * 60_000,
        schedulerIntervalMs: 30_000,
        runnerIntervalMs: 2_000,
        jobsPerTick: 5,
        leaseMs: 120_000,
        maxAttempts: 5,
        searchMaxPages: 1,
        searchTimeoutMs: 30_000,
      },
      sourceHealth: { slowMs: 5_000, downAfterFailures: 3, backoffBaseMs: 30_000, backoffMaxMs: 900_000, probeIntervalMs: 60_000 },
      notifications: { delivery: 'simulator', push: { provider: 'simulator', expoAccessToken: null } },
      ai: { provider: 'mock', foundry: null },
      devMarketplaceScenarios: { ebay: 'normal', facebook: 'normal' },
      devMarketplaceLatencyMs: { ebay: 0, facebook: 0 },
      ebayApi: null,
      facebookApify: null,
    });
  });

  it('development source latency is development-only', () => {
    expect(loadWorkerConfig({ EBAY_DEV_LATENCY_MS: '3000', FACEBOOK_DEV_SCENARIO: 'slow' })).toMatchObject({
      devMarketplaceLatencyMs: { ebay: 3000, facebook: 0 },
      devMarketplaceScenarios: { facebook: 'slow' },
    });
    expect(() =>
      loadWorkerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://x@y/z',
        HUNT_POLL_INTERVAL_MINUTES: '15',
        AI_PROVIDER: 'foundry',
        NOTIFICATION_DELIVERY: 'disabled',
        PUSH_PROVIDER: 'none',
        EBAY_CLIENT_ID: 'id',
        EBAY_CLIENT_SECRET: 'secret',
        EBAY_DEV_LATENCY_MS: '3000',
      }),
    ).toThrow('EBAY_DEV_LATENCY_MS: development-only');
  });

  it('rejects a heartbeat below 1000ms', () => {
    expect(() => loadWorkerConfig({ WORKER_HEARTBEAT_MS: '10' })).toThrow(
      'WORKER_HEARTBEAT_MS: must be an integer >= 1000 (got "10")',
    );
  });

  it('requires DATABASE_URL and an explicit poll interval in production', () => {
    try {
      loadWorkerConfig({ NODE_ENV: 'production' });
      throw new Error('expected EnvValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).problems).toEqual([
        'DATABASE_URL: is required when NODE_ENV=production',
        'HUNT_POLL_INTERVAL_MINUTES: is required when NODE_ENV=production',
        'AI_PROVIDER: is required when NODE_ENV=production',
        'NOTIFICATION_DELIVERY: is required when NODE_ENV=production',
        'PUSH_PROVIDER: is required when NODE_ENV=production',
      ]);
    }
  });

  it('parses pipeline settings and dev scenarios', () => {
    const config = loadWorkerConfig({
      HUNT_POLL_INTERVAL_MINUTES: '2',
      WORKER_SEARCH_MAX_PAGES: '3',
      EBAY_DEV_SCENARIO: 'rate_limited',
    });
    expect(config.pipeline.pollIntervalMs).toBe(120_000);
    expect(config.pipeline.searchMaxPages).toBe(3);
    expect(config.devMarketplaceScenarios).toEqual({ ebay: 'rate_limited', facebook: 'normal' });
    expect(() => loadWorkerConfig({ WORKER_SEARCH_MAX_PAGES: '50' })).toThrow(/WORKER_SEARCH_MAX_PAGES/);
  });

  it('refuses development marketplace scenarios in production', () => {
    expect(() =>
      loadWorkerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@db/app',
        HUNT_POLL_INTERVAL_MINUTES: '15',
        AI_PROVIDER: 'foundry',
        NOTIFICATION_DELIVERY: 'disabled',
        PUSH_PROVIDER: 'expo',
        FACEBOOK_DEV_SCENARIO: 'empty',
      }),
    ).toThrow('FACEBOOK_DEV_SCENARIO: development-only, not allowed when NODE_ENV=production');
  });

  it('simulates notifications locally and refuses the simulator in production', () => {
    expect(loadWorkerConfig({ NOTIFICATION_DELIVERY: 'disabled', PUSH_PROVIDER: 'expo', EXPO_ACCESS_TOKEN: 'secret' }).notifications).toEqual({
      delivery: 'disabled',
      push: { provider: 'expo', expoAccessToken: 'secret' },
    });
    expect(() =>
      loadWorkerConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app', HUNT_POLL_INTERVAL_MINUTES: '15', AI_PROVIDER: 'foundry', NOTIFICATION_DELIVERY: 'disabled', PUSH_PROVIDER: 'simulator' }),
    ).toThrow('PUSH_PROVIDER: simulator is development-only, not allowed when NODE_ENV=production');
    expect(() =>
      loadWorkerConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app', HUNT_POLL_INTERVAL_MINUTES: '15', AI_PROVIDER: 'foundry', NOTIFICATION_DELIVERY: 'simulator', PUSH_PROVIDER: 'expo' }),
    ).toThrow('NOTIFICATION_DELIVERY: simulator is development-only, not allowed when NODE_ENV=production');
  });

  it('uses the mock AI provider locally and refuses it in production', () => {
    expect(loadWorkerConfig({}).ai).toEqual({ provider: 'mock', foundry: null });
    expect(() => loadWorkerConfig({ AI_PROVIDER: 'openai' })).toThrow(/AI_PROVIDER: must be one of: mock, foundry/);
    expect(() =>
      loadWorkerConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app', HUNT_POLL_INTERVAL_MINUTES: '15', AI_PROVIDER: 'mock', NOTIFICATION_DELIVERY: 'disabled', PUSH_PROVIDER: 'expo' }),
    ).toThrow('AI_PROVIDER: mock is development-only, not allowed when NODE_ENV=production');
  });

  const FOUNDRY = { AI_PROVIDER: 'foundry', FOUNDRY_ENDPOINT: 'https://rein.openai.azure.com', FOUNDRY_API_KEY: 'k3y-secret', FOUNDRY_DEPLOYMENT: 'gpt-4o-mini-prod' };

  it('configures Foundry from the environment: endpoint, key, deployments, limits, pricing', () => {
    expect(loadWorkerConfig({ ...FOUNDRY, FOUNDRY_DEPLOYMENT_DEAL_EXPLANATION: 'gpt-4o-prod', FOUNDRY_MAX_RETRIES: '0', FOUNDRY_PRICE_INPUT_PER_1M_USD: '0.15', FOUNDRY_PRICE_OUTPUT_PER_1M_USD: '0.6' }).ai).toEqual({
      provider: 'foundry',
      foundry: {
        endpoint: 'https://rein.openai.azure.com',
        auth: { kind: 'api-key', key: 'k3y-secret' },
        deployments: { extractProduct: 'gpt-4o-mini-prod', assessConditionRisk: 'gpt-4o-mini-prod', explainDeal: 'gpt-4o-prod' },
        timeoutMs: undefined,
        maxRetries: 0,
        maxOutputTokens: undefined,
        pricing: { inputPer1M: 0.15, outputPer1M: 0.6 },
      },
    });
  });

  it('refuses Foundry without endpoint / key / deployment, over http, or with a lease shorter than its retries', () => {
    expect(() => loadWorkerConfig({ AI_PROVIDER: 'foundry' })).toThrow(/FOUNDRY_ENDPOINT: required[\s\S]*FOUNDRY_API_KEY: required[\s\S]*FOUNDRY_DEPLOYMENT: required/);
    expect(() => loadWorkerConfig({ ...FOUNDRY, FOUNDRY_ENDPOINT: 'http://rein.openai.azure.com' })).toThrow(/FOUNDRY_ENDPOINT: must be an https URL/);
    expect(() => loadWorkerConfig({ ...FOUNDRY, FOUNDRY_TIMEOUT_MS: '60000' })).toThrow(/WORKER_JOB_LEASE_MS: 120000 ms is shorter than one Foundry analysis can take \(250000 ms/);
    expect(loadWorkerConfig({ ...FOUNDRY, FOUNDRY_TIMEOUT_MS: '60000', WORKER_JOB_LEASE_MS: '300000' }).ai.foundry?.timeoutMs).toBe(60_000);
  });

  it('never puts the Foundry key in an error message', () => {
    let message = '';
    try {
      loadWorkerConfig({ ...FOUNDRY, FOUNDRY_ENDPOINT: 'nope' });
    } catch (err) {
      message = String(err);
    }
    expect(message).toMatch(/FOUNDRY_ENDPOINT/);
    expect(message).not.toContain('k3y-secret');
  });
});
