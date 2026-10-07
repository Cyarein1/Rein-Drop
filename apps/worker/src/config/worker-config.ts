import { z } from 'zod';
import { AI_PROVIDER_IDS, DEFAULT_AI_PROVIDER, type AIProviderId } from '@rein-drop/ai-core';
// Config is wiring (like the registry): it may name development marketplace scenarios.
import { DEV_SCENARIOS, type DevScenario } from '@rein-drop/marketplace-core/adapters';
import {
  databaseUrlSchema,
  EnvValidationError,
  intSchema,
  nodeEnvSchema,
  parseEnv,
  resolveDatabaseUrl,
  type NodeEnv,
} from '@rein-drop/env';

const devScenarioSchema = z
  .enum(DEV_SCENARIOS, { error: `must be one of: ${DEV_SCENARIOS.join(', ')}` })
  .optional();

const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  DATABASE_URL: databaseUrlSchema.optional(),
  WORKER_HEARTBEAT_MS: intSchema({ min: 1000, default: 60_000 }),
  /**
   * How often each LIVE hunt is searched per marketplace (NORMAL priority).
   * TODO(product): the real interval depends on the cost model / plan tiers - the default is a
   * development value only, so production must set it explicitly.
   */
  HUNT_POLL_INTERVAL_MINUTES: intSchema({ min: 1, max: 1440, default: 15 }),
  WORKER_SCHEDULER_INTERVAL_MS: intSchema({ min: 1000, default: 30_000 }),
  WORKER_RUNNER_INTERVAL_MS: intSchema({ min: 100, default: 2_000 }),
  WORKER_JOBS_PER_TICK: intSchema({ min: 1, max: 50, default: 5 }),
  WORKER_JOB_LEASE_MS: intSchema({ min: 5_000, default: 120_000 }),
  WORKER_JOB_MAX_ATTEMPTS: intSchema({ min: 1, max: 20, default: 5 }),
  WORKER_SEARCH_MAX_PAGES: intSchema({ min: 1, max: 10, default: 1 }),
  EBAY_DEV_SCENARIO: devScenarioSchema,
  FACEBOOK_DEV_SCENARIO: devScenarioSchema,
  /** Which AIProvider analyses matched listings. `mock` is deterministic and local-only. */
  AI_PROVIDER: z.enum(AI_PROVIDER_IDS, { error: `must be one of: ${AI_PROVIDER_IDS.join(', ')}` }).optional(),
});

/** Validated, typed worker configuration. Inject with `@Inject(WORKER_CONFIG)`. */
export interface WorkerConfig {
  readonly nodeEnv: NodeEnv;
  readonly databaseUrl: string;
  readonly heartbeatMs: number;
  readonly pipeline: {
    readonly pollIntervalMs: number;
    readonly schedulerIntervalMs: number;
    readonly runnerIntervalMs: number;
    readonly jobsPerTick: number;
    readonly leaseMs: number;
    readonly maxAttempts: number;
    readonly searchMaxPages: number;
  };
  /** AIProvider for deal analysis (@rein-drop/ai-core). */
  readonly ai: { readonly provider: AIProviderId };
  /** Behaviour of the development marketplace sources (ignored by real adapters). */
  readonly devMarketplaceScenarios: { readonly ebay: DevScenario; readonly facebook: DevScenario };
}

export const WORKER_CONFIG = Symbol('WORKER_CONFIG');

/** Throws EnvValidationError listing every invalid variable. */
export function loadWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): WorkerConfig {
  const parsed = parseEnv('worker', workerEnvSchema, env, {
    requiredInProduction: ['DATABASE_URL', 'HUNT_POLL_INTERVAL_MINUTES', 'AI_PROVIDER'],
  });
  if (parsed.NODE_ENV === 'production') {
    const problems = (['EBAY_DEV_SCENARIO', 'FACEBOOK_DEV_SCENARIO'] as const)
      .filter((key) => parsed[key] !== undefined)
      .map((key) => `${key}: development-only, not allowed when NODE_ENV=production`);
    // The mock produces believable but meaningless analyses: never in front of real users.
    if (parsed.AI_PROVIDER === 'mock') problems.push('AI_PROVIDER: mock is development-only, not allowed when NODE_ENV=production');
    if (problems.length > 0) throw new EnvValidationError('worker', problems);
  }
  return Object.freeze({
    nodeEnv: parsed.NODE_ENV,
    databaseUrl: resolveDatabaseUrl(parsed),
    heartbeatMs: parsed.WORKER_HEARTBEAT_MS,
    pipeline: Object.freeze({
      pollIntervalMs: parsed.HUNT_POLL_INTERVAL_MINUTES * 60_000,
      schedulerIntervalMs: parsed.WORKER_SCHEDULER_INTERVAL_MS,
      runnerIntervalMs: parsed.WORKER_RUNNER_INTERVAL_MS,
      jobsPerTick: parsed.WORKER_JOBS_PER_TICK,
      leaseMs: parsed.WORKER_JOB_LEASE_MS,
      maxAttempts: parsed.WORKER_JOB_MAX_ATTEMPTS,
      searchMaxPages: parsed.WORKER_SEARCH_MAX_PAGES,
    }),
    ai: Object.freeze({ provider: parsed.AI_PROVIDER ?? DEFAULT_AI_PROVIDER }),
    devMarketplaceScenarios: Object.freeze({
      ebay: parsed.EBAY_DEV_SCENARIO ?? 'normal',
      facebook: parsed.FACEBOOK_DEV_SCENARIO ?? 'normal',
    }),
  });
}
