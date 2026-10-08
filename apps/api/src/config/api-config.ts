import { z } from 'zod';
import { AUTH_PROVIDER_IDS, type AuthProviderId } from '@rein-drop/contracts';
// Config is wiring (like the registry provider): it may name development marketplace scenarios.
import { DEV_SCENARIOS, ebayEnvShape, resolveEbaySource, type DevScenario, type EbayCredentials } from '@rein-drop/marketplace-core/adapters';
import {
  databaseUrlSchema,
  EnvValidationError,
  nodeEnvSchema,
  parseEnv,
  portSchema,
  resolveDatabaseUrl,
  type NodeEnv,
} from '@rein-drop/env';

const devScenarioSchema = z
  .enum(DEV_SCENARIOS, { error: `must be one of: ${DEV_SCENARIOS.join(', ')}` })
  .optional();

const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: portSchema(4000),
  DATABASE_URL: databaseUrlSchema.optional(),
  AUTH_PROVIDER: z
    .enum(AUTH_PROVIDER_IDS, { error: `must be one of: ${AUTH_PROVIDER_IDS.join(', ')}` })
    .optional(),
  EBAY_DEV_SCENARIO: devScenarioSchema,
  FACEBOOK_DEV_SCENARIO: devScenarioSchema,
  // Real eBay source (Browse API) - see resolveEbaySource. Secrets come from the environment only.
  ...ebayEnvShape,
});

/** Validated, typed API configuration. Inject with `@Inject(API_CONFIG)`. */
export interface ApiConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  /** Used by DatabaseModule (Prisma). Connection is lazy, so startup never needs the DB. */
  readonly databaseUrl: string;
  /** Which AuthProvider implementation authenticates requests. */
  readonly authProvider: AuthProviderId;
  /** Behaviour of the development marketplace sources (ignored by real adapters). */
  readonly devMarketplaceScenarios: { readonly ebay: DevScenario; readonly facebook: DevScenario };
  /** Real eBay Browse API credentials, or null for the development eBay source. Never log this. */
  readonly ebayApi: EbayCredentials | null;
}

export const API_CONFIG = Symbol('API_CONFIG');

/** Throws EnvValidationError listing every invalid variable. */
export function loadApiConfig(
  env: Record<string, string | undefined> = process.env,
): ApiConfig {
  const parsed = parseEnv('api', apiEnvSchema, env, {
    requiredInProduction: ['DATABASE_URL', 'AUTH_PROVIDER'],
  });

  const ebay = resolveEbaySource(parsed, parsed.NODE_ENV);
  const problems: string[] = [...ebay.problems];
  if (parsed.NODE_ENV === 'production') {
    // DEVELOPMENT-ONLY auth must never run in production. No managed provider exists
    // yet (TBD), so production cannot start until one is added - by design.
    if (parsed.AUTH_PROVIDER === 'dev') {
      problems.push('AUTH_PROVIDER: "dev" is a development-only provider and is not allowed when NODE_ENV=production');
    }
    // Development marketplace scenarios are meaningless in production: refuse rather than ignore.
    for (const key of ['EBAY_DEV_SCENARIO', 'FACEBOOK_DEV_SCENARIO'] as const) {
      if (parsed[key] !== undefined) problems.push(`${key}: development-only, not allowed when NODE_ENV=production`);
    }
  }
  if (problems.length > 0) throw new EnvValidationError('api', problems);

  return Object.freeze({
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: resolveDatabaseUrl(parsed),
    // Safe default outside production only (production requires an explicit value above).
    authProvider: parsed.AUTH_PROVIDER ?? 'dev',
    devMarketplaceScenarios: Object.freeze({
      ebay: parsed.EBAY_DEV_SCENARIO ?? 'normal',
      facebook: parsed.FACEBOOK_DEV_SCENARIO ?? 'normal',
    }),
    ebayApi: ebay.api ? Object.freeze(ebay.api) : null,
  });
}
