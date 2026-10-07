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
      },
      notifications: { delivery: 'simulator', push: { provider: 'simulator', expoAccessToken: null } },
      ai: { provider: 'mock' },
      devMarketplaceScenarios: { ebay: 'normal', facebook: 'normal' },
    });
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
    expect(loadWorkerConfig({ AI_PROVIDER: 'foundry' }).ai).toEqual({ provider: 'foundry' });
    expect(() => loadWorkerConfig({ AI_PROVIDER: 'openai' })).toThrow(/AI_PROVIDER: must be one of: mock, foundry/);
    expect(() =>
      loadWorkerConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app', HUNT_POLL_INTERVAL_MINUTES: '15', AI_PROVIDER: 'mock', NOTIFICATION_DELIVERY: 'disabled', PUSH_PROVIDER: 'expo' }),
    ).toThrow('AI_PROVIDER: mock is development-only, not allowed when NODE_ENV=production');
  });
});
