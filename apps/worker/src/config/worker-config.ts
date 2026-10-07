import { z } from 'zod';
import {
  databaseUrlSchema,
  intSchema,
  nodeEnvSchema,
  parseEnv,
  resolveDatabaseUrl,
  type NodeEnv,
} from '@rein-drop/env';

const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  DATABASE_URL: databaseUrlSchema.optional(),
  WORKER_HEARTBEAT_MS: intSchema({ min: 1000, default: 60_000 }),
});

/** Validated, typed worker configuration. Inject with `@Inject(WORKER_CONFIG)`. */
export interface WorkerConfig {
  readonly nodeEnv: NodeEnv;
  /** Not connected yet - the database layer is added in a later step. */
  readonly databaseUrl: string;
  readonly heartbeatMs: number;
}

export const WORKER_CONFIG = Symbol('WORKER_CONFIG');

/** Throws EnvValidationError listing every invalid variable. */
export function loadWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): WorkerConfig {
  const parsed = parseEnv('worker', workerEnvSchema, env, {
    requiredInProduction: ['DATABASE_URL'],
  });
  return Object.freeze({
    nodeEnv: parsed.NODE_ENV,
    databaseUrl: resolveDatabaseUrl(parsed),
    heartbeatMs: parsed.WORKER_HEARTBEAT_MS,
  });
}
