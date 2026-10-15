import { z } from 'zod';
import { AI_PROVIDER_IDS, DEFAULT_AI_PROVIDER, foundryEnvShape, foundryWorstCaseMs, resolveFoundryConfig, type AIProviderId, type FoundryConfig } from '@rein-drop/ai-core';
import type { AccessPolicy } from '@rein-drop/access';
import { geoEnvShape, resolveGeoConfig, type GeoConfig } from '@rein-drop/geo';
import { productEventsEnvShape, resolveProductEventProviderId, type ProductEventProviderId } from '@rein-drop/telemetry';
// Config is wiring (like the registry): it may name development marketplace scenarios.
import {
  DEV_SCENARIOS,
  ebayEnvShape,
  facebookEnvShape,
  resolveEbaySource,
  resolveFacebookSource,
  type ApifyMarketplaceConfig,
  type DevScenario,
  type EbayCredentials,
} from '@rein-drop/marketplace-core/adapters';
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
  // Source health and per-source backoff (decision 0009).
  WORKER_SEARCH_TIMEOUT_MS: intSchema({ min: 1_000, max: 300_000, default: 30_000 }),
  WORKER_SOURCE_SLOW_MS: intSchema({ min: 100, max: 120_000, default: 5_000 }),
  WORKER_SOURCE_DOWN_AFTER: intSchema({ min: 1, max: 20, default: 3 }),
  WORKER_SOURCE_BACKOFF_BASE_MS: intSchema({ min: 1_000, max: 600_000, default: 30_000 }),
  WORKER_SOURCE_BACKOFF_MAX_MS: intSchema({ min: 1_000, max: 86_400_000, default: 900_000 }),
  WORKER_HEALTH_PROBE_MS: intSchema({ min: 5_000, default: 60_000 }),
  EBAY_DEV_SCENARIO: devScenarioSchema,
  FACEBOOK_DEV_SCENARIO: devScenarioSchema,
  EBAY_DEV_LATENCY_MS: intSchema({ min: 0, max: 120_000, default: 0 }),
  // Real eBay source (Browse API) - see resolveEbaySource. Secrets come from the environment only.
  ...ebayEnvShape,
  // Facebook data provider: dev (default) or the Apify development integration.
  ...facebookEnvShape,
  FACEBOOK_DEV_LATENCY_MS: intSchema({ min: 0, max: 120_000, default: 0 }),
  /** Which AIProvider analyses matched listings. `mock` is deterministic and local-only. */
  /**
   * How push / email deliveries go out. simulator = logged + marked SIMULATED (local only);
   * disabled = not sent (SKIPPED, not_configured). TODO(notifications): Expo push (Build Prompt 25), email provider TBD.
   */
  /**
   * Push sender: expo = Expo Push Service for Expo tokens; simulator = log only; none = no push
   * (deliveries SKIPPED). Development-simulated device tokens are always simulated, never in production.
   */
  PUSH_PROVIDER: z.enum(['expo', 'simulator', 'none'], { error: 'must be one of: expo, simulator, none' }).optional(),
  /** Only needed if 'enhanced push security' is on for the Expo project. Secret. */
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
  /** Devices that haven't refreshed their registration for this many days stop receiving pushes. */
  PUSH_DEVICE_STALE_DAYS: intSchema({ min: 7, max: 365, default: 90 }),
  NOTIFICATION_DELIVERY: z.enum(['simulator', 'disabled'], { error: 'must be one of: simulator, disabled' }).optional(),
  /** json = one JSON object per log line (default in production); text = readable. */
  LOG_FORMAT: z.enum(['json', 'text'], { error: 'must be one of: json, text' }).optional(),
  AI_PROVIDER: z.enum(AI_PROVIDER_IDS, { error: `must be one of: ${AI_PROVIDER_IDS.join(', ')}` }).optional(),
  // Microsoft Foundry (AI_PROVIDER=foundry) - see resolveFoundryConfig. Secrets come from the environment only.
  ...foundryEnvShape,
  // Product events (beta telemetry): log (default) | none.
  ...productEventsEnvShape,
  // Geocoding for distance checks (decision 0017): mock (development) | azure | none (production default).
  ...geoEnvShape,
  /** Days of continued access after paid access ends involuntarily (decision 0018). 0 = no grace. */
  BILLING_GRACE_DAYS: intSchema({ min: 0, max: 30, default: 0 }),
});

/** Validated, typed worker configuration. Inject with `@Inject(WORKER_CONFIG)`. */
export interface WorkerConfig {
  readonly nodeEnv: NodeEnv;
  readonly databaseUrl: string;
  readonly heartbeatMs: number;
  readonly logFormat: 'json' | 'text';
  readonly pipeline: {
    readonly pollIntervalMs: number;
    readonly schedulerIntervalMs: number;
    readonly runnerIntervalMs: number;
    readonly jobsPerTick: number;
    readonly leaseMs: number;
    readonly maxAttempts: number;
    readonly searchMaxPages: number;
    readonly searchTimeoutMs: number;
  };
  /** Marketplace source health + per-source backoff. */
  readonly sourceHealth: {
    readonly slowMs: number;
    readonly downAfterFailures: number;
    readonly backoffBaseMs: number;
    readonly backoffMaxMs: number;
    readonly probeIntervalMs: number;
  };
  /** Push / email delivery mode for the notification outbox. */
  readonly notifications: {
    /** Email (push has its own provider). */
    readonly delivery: 'simulator' | 'disabled';
    readonly push: { readonly provider: 'expo' | 'simulator' | 'none'; readonly expoAccessToken: string | null; readonly staleDeviceDays: number };
  };
  /** AIProvider for deal analysis (@rein-drop/ai-core); `foundry` holds its config (secret - never log it). */
  readonly ai: { readonly provider: AIProviderId; readonly foundry: FoundryConfig | null };
  /** Behaviour of the development marketplace sources (ignored by real adapters). */
  readonly devMarketplaceScenarios: { readonly ebay: DevScenario; readonly facebook: DevScenario };
  /** Simulated latency of the development sources, ms. */
  readonly devMarketplaceLatencyMs: { readonly ebay: number; readonly facebook: number };
  /** Real eBay Browse API credentials, or null for the development eBay source. Never log this. */
  readonly ebayApi: EbayCredentials | null;
  /** Apify development Facebook provider config, or null for the development provider. Never log this. */
  readonly facebookApify: ApifyMarketplaceConfig | null;
  /** Where product events go (log line by default; a vendor once D15 is decided). */
  readonly productEvents: ProductEventProviderId;
  /** Geocoder for listing places in distance checks (holds the Azure Maps key - never log it). */
  readonly geo: GeoConfig;
  /** Effective-access policy shared by API and worker (@rein-drop/access). */
  readonly accessPolicy: AccessPolicy;
}

export const WORKER_CONFIG = Symbol('WORKER_CONFIG');

/** Throws EnvValidationError listing every invalid variable. */
export function loadWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): WorkerConfig {
  const parsed = parseEnv('worker', workerEnvSchema, env, {
    requiredInProduction: ['DATABASE_URL', 'HUNT_POLL_INTERVAL_MINUTES', 'AI_PROVIDER', 'NOTIFICATION_DELIVERY', 'PUSH_PROVIDER'],
  });
  const ebay = resolveEbaySource(parsed, parsed.NODE_ENV);
  const facebook = resolveFacebookSource(parsed, parsed.NODE_ENV);
  const aiProvider = parsed.AI_PROVIDER ?? DEFAULT_AI_PROVIDER;
  const ai = resolveFoundryConfig(aiProvider, parsed);
  const geo = resolveGeoConfig(parsed, parsed.NODE_ENV);
  const problems = [...ebay.problems, ...facebook.problems, ...ai.problems, ...geo.problems];
  // A job must finish within its lease, or a second worker could pick it up while it still runs.
  if (ai.foundry && foundryWorstCaseMs(ai.foundry) > parsed.WORKER_JOB_LEASE_MS) {
    problems.push(
      `WORKER_JOB_LEASE_MS: ${parsed.WORKER_JOB_LEASE_MS} ms is shorter than one Foundry analysis can take (${foundryWorstCaseMs(ai.foundry)} ms with these timeouts / retries) - raise it, or lower FOUNDRY_TIMEOUT_MS / FOUNDRY_MAX_RETRIES`,
    );
  }
  if (parsed.NODE_ENV === 'production') {
    // The latency settings have defaults, so check whether they were set at all.
    for (const key of ['EBAY_DEV_SCENARIO', 'FACEBOOK_DEV_SCENARIO', 'EBAY_DEV_LATENCY_MS', 'FACEBOOK_DEV_LATENCY_MS']) {
      if (env[key] !== undefined && env[key] !== '') problems.push(`${key}: development-only, not allowed when NODE_ENV=production`);
    }
    // The mock produces believable but meaningless analyses: never in front of real users.
    if (parsed.PUSH_PROVIDER === 'simulator') problems.push('PUSH_PROVIDER: simulator is development-only, not allowed when NODE_ENV=production');
    if (parsed.NOTIFICATION_DELIVERY === 'simulator') problems.push('NOTIFICATION_DELIVERY: simulator is development-only, not allowed when NODE_ENV=production');
    if (parsed.AI_PROVIDER === 'mock') problems.push('AI_PROVIDER: mock is development-only, not allowed when NODE_ENV=production');
  }
  if (problems.length > 0) throw new EnvValidationError('worker', problems);
  return Object.freeze({
    nodeEnv: parsed.NODE_ENV,
    databaseUrl: resolveDatabaseUrl(parsed),
    heartbeatMs: parsed.WORKER_HEARTBEAT_MS,
    logFormat: parsed.LOG_FORMAT ?? (parsed.NODE_ENV === 'production' ? 'json' : 'text'),
    pipeline: Object.freeze({
      pollIntervalMs: parsed.HUNT_POLL_INTERVAL_MINUTES * 60_000,
      schedulerIntervalMs: parsed.WORKER_SCHEDULER_INTERVAL_MS,
      runnerIntervalMs: parsed.WORKER_RUNNER_INTERVAL_MS,
      jobsPerTick: parsed.WORKER_JOBS_PER_TICK,
      leaseMs: parsed.WORKER_JOB_LEASE_MS,
      maxAttempts: parsed.WORKER_JOB_MAX_ATTEMPTS,
      searchMaxPages: parsed.WORKER_SEARCH_MAX_PAGES,
      searchTimeoutMs: parsed.WORKER_SEARCH_TIMEOUT_MS,
    }),
    sourceHealth: Object.freeze({
      slowMs: parsed.WORKER_SOURCE_SLOW_MS,
      downAfterFailures: parsed.WORKER_SOURCE_DOWN_AFTER,
      backoffBaseMs: parsed.WORKER_SOURCE_BACKOFF_BASE_MS,
      backoffMaxMs: Math.max(parsed.WORKER_SOURCE_BACKOFF_MAX_MS, parsed.WORKER_SOURCE_BACKOFF_BASE_MS),
      probeIntervalMs: parsed.WORKER_HEALTH_PROBE_MS,
    }),
    notifications: Object.freeze({
      delivery: parsed.NOTIFICATION_DELIVERY ?? 'simulator',
      push: Object.freeze({ provider: parsed.PUSH_PROVIDER ?? 'simulator', expoAccessToken: parsed.EXPO_ACCESS_TOKEN ?? null, staleDeviceDays: parsed.PUSH_DEVICE_STALE_DAYS }),
    }),
    ai: Object.freeze({ provider: aiProvider, foundry: ai.foundry ? Object.freeze(ai.foundry) : null }),
    devMarketplaceScenarios: Object.freeze({
      ebay: parsed.EBAY_DEV_SCENARIO ?? 'normal',
      facebook: parsed.FACEBOOK_DEV_SCENARIO ?? 'normal',
    }),
    devMarketplaceLatencyMs: Object.freeze({ ebay: parsed.EBAY_DEV_LATENCY_MS, facebook: parsed.FACEBOOK_DEV_LATENCY_MS }),
    ebayApi: ebay.api ? Object.freeze(ebay.api) : null,
    facebookApify: facebook.apify ? Object.freeze(facebook.apify) : null,
    productEvents: resolveProductEventProviderId(parsed),
    geo: Object.freeze({ provider: geo.geo.provider, azure: geo.geo.azure ? Object.freeze(geo.geo.azure) : null }),
    accessPolicy: Object.freeze({ graceDays: parsed.BILLING_GRACE_DAYS }),
  });
}
