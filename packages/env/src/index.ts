/**
 * Server-side environment helpers shared by apps/api and apps/worker.
 * Each app defines its own zod schema; this package holds the shared pieces
 * (NODE_ENV, DATABASE_URL, integer parsing, error formatting) so they cannot drift.
 */
import { z } from 'zod';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/**
 * Matches the defaults in docker-compose.yml. Only used when NODE_ENV is not
 * production and DATABASE_URL is unset, so a fresh checkout boots without a .env.
 */
export const LOCAL_DATABASE_URL = 'postgresql://reindrop:reindrop@localhost:5432/reindrop';

export const nodeEnvSchema = z
  .enum(NODE_ENVS, { error: `must be one of: ${NODE_ENVS.join(', ')}` })
  .default('development');

export const databaseUrlSchema = z
  .string()
  .refine(isPostgresUrl, `must be a postgresql:// connection URL, e.g. ${LOCAL_DATABASE_URL}`);

/** Integer env var with bounds and a default (env values are strings, so this coerces). */
export function intSchema(options: { min: number; max?: number; default: number }) {
  const { min, max = Number.MAX_SAFE_INTEGER } = options;
  const message =
    max === Number.MAX_SAFE_INTEGER
      ? `must be an integer >= ${min}`
      : `must be an integer between ${min} and ${max}`;
  return z.coerce
    .number({ error: message })
    .int(message)
    .min(min, message)
    .max(max, message)
    .default(options.default);
}

export function portSchema(defaultPort: number) {
  return intSchema({ min: 1, max: 65535, default: defaultPort });
}

/** Value to use for DATABASE_URL after validation (local default outside production). */
export function resolveDatabaseUrl(env: { DATABASE_URL?: string | undefined }): string {
  return env.DATABASE_URL ?? LOCAL_DATABASE_URL;
}

/** Thrown when environment variables fail validation. The message lists every problem. */
export class EnvValidationError extends Error {
  constructor(
    readonly app: string,
    readonly problems: readonly string[],
  ) {
    super(
      [
        `Invalid environment configuration for ${app}:`,
        ...problems.map((p) => `  - ${p}`),
        `Set these in apps/${app}/.env (see apps/${app}/.env.example) or the shell environment.`,
      ].join('\n'),
    );
    this.name = 'EnvValidationError';
  }
}

/** Env vars whose values must never be echoed in error messages or logs. */
const SENSITIVE_KEYS = new Set(['DATABASE_URL']);
/** Never echo a value whose name says it is a secret (API keys, tokens, signing secrets). */
const isSensitive = (key: string) => SENSITIVE_KEYS.has(key) || /SECRET|TOKEN|PASSWORD|_KEY$/.test(key);

export interface ParseEnvOptions<Key extends string> {
  /** Keys that are optional in development but must be set when NODE_ENV=production. */
  requiredInProduction?: readonly Key[];
}

/**
 * Validates the schema's keys from `env` and reports every problem at once.
 * Empty strings count as unset so that `FOO=` in a .env file falls back to the
 * default instead of failing.
 */
export function parseEnv<Shape extends z.ZodRawShape>(
  app: string,
  schema: z.ZodObject<Shape>,
  env: Record<string, string | undefined>,
  options: ParseEnvOptions<Extract<keyof Shape, string>> = {},
): z.output<z.ZodObject<Shape>> {
  const input: Record<string, string | undefined> = {};
  for (const key of Object.keys(schema.shape)) {
    const value = env[key];
    input[key] = value === undefined || value.trim() === '' ? undefined : value.trim();
  }

  const result = schema.safeParse(input);
  const problems = result.success
    ? []
    : result.error.issues.map((issue) => {
        const key = issue.path.map(String).join('.') || '(root)';
        const raw = input[key];
        const got = raw === undefined || isSensitive(key) ? '' : ` (got "${raw}")`;
        return `${key}: ${issue.message}${got}`;
      });

  // Checked outside zod so it is reported even when other fields fail to parse.
  if (input.NODE_ENV === 'production') {
    for (const key of options.requiredInProduction ?? []) {
      if (input[key] === undefined) problems.push(`${key}: is required when NODE_ENV=production`);
    }
  }

  if (problems.length > 0 || !result.success) throw new EnvValidationError(app, problems);
  return result.data;
}

/**
 * Loads `.env` from the current working directory into process.env if it exists.
 * Existing environment variables win over the file.
 */
export function loadDotEnvFile(path = '.env'): void {
  try {
    process.loadEnvFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/** Runs a config loader; on validation failure prints the problems and exits with code 1. */
export function loadConfigOrExit<T>(load: () => T): T {
  try {
    return load();
  } catch (err) {
    if (err instanceof EnvValidationError) {
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

/** `postgresql://user:secret@host/db` -> `postgresql://user:****@host/db` for safe logging. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '****';
    return parsed.toString();
  } catch {
    return '(unparseable URL)';
  }
}

function isPostgresUrl(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value);
    return (protocol === 'postgresql:' || protocol === 'postgres:') && hostname.length > 0;
  } catch {
    return false;
  }
}
