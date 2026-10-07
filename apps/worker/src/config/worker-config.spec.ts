import { EnvValidationError, LOCAL_DATABASE_URL } from '@rein-drop/env';
import { loadWorkerConfig } from './worker-config.js';

describe('loadWorkerConfig', () => {
  it('uses local defaults when nothing is set', () => {
    expect(loadWorkerConfig({})).toEqual({
      nodeEnv: 'development',
      databaseUrl: LOCAL_DATABASE_URL,
      heartbeatMs: 60_000,
    });
  });

  it('rejects a heartbeat below 1000ms', () => {
    expect(() => loadWorkerConfig({ WORKER_HEARTBEAT_MS: '10' })).toThrow(
      'WORKER_HEARTBEAT_MS: must be an integer >= 1000 (got "10")',
    );
  });

  it('requires DATABASE_URL in production', () => {
    expect(() => loadWorkerConfig({ NODE_ENV: 'production' })).toThrow(EnvValidationError);
  });
});
