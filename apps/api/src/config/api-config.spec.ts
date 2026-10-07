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

describe('loadApiConfig', () => {
  it('uses local defaults when nothing is set (dev auth outside production)', () => {
    expect(loadApiConfig({})).toEqual({
      nodeEnv: 'development',
      port: 4000,
      databaseUrl: LOCAL_DATABASE_URL,
      authProvider: 'dev',
    });
  });

  it('refuses dev auth in production', () => {
    expect(
      problemsFor({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app', AUTH_PROVIDER: 'dev' }),
    ).toEqual([
      'AUTH_PROVIDER: "dev" is a development-only provider and is not allowed when NODE_ENV=production',
    ]);
  });

  it('requires an explicit auth provider in production (no default)', () => {
    expect(problemsFor({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/app' })).toEqual([
      'AUTH_PROVIDER: is required when NODE_ENV=production',
    ]);
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
    });
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
});
