import { z } from 'zod';
import { AUTH_PROVIDER_IDS, ENTRA_DEFAULT_SCOPE_NAME, FEATURE_FLAGS, type AuthProviderId, type FeatureFlag } from '@rein-drop/contracts';
import type { EntraApiConfig } from '../auth/entra-auth.provider.js';
import { billingEnvShape, resolveBillingConfig, type BillingConfig } from '../modules/billing/billing-config.js';
// Config is wiring (like the registry provider): it may name development marketplace scenarios.
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
  portSchema,
  resolveDatabaseUrl,
  type NodeEnv,
} from '@rein-drop/env';
import type { AccessPolicy } from '@rein-drop/access';
import { geoEnvShape, resolveGeoConfig, type GeoConfig } from '@rein-drop/geo';
import { productEventsEnvShape, resolveProductEventProviderId, type ProductEventProviderId } from '@rein-drop/telemetry';

const devScenarioSchema = z
  .enum(DEV_SCENARIOS, { error: `must be one of: ${DEV_SCENARIOS.join(', ')}` })
  .optional();

const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: portSchema(4000),
  /** Requests per signed-in user (or anonymous IP) per minute, across the API. */
  RATE_LIMIT_PER_MINUTE: intSchema({ min: 10, max: 100_000, default: 600 }),
  /** Reverse proxies in front of the API (Azure front door / app gateway): 0 = trust none. */
  TRUST_PROXY_HOPS: intSchema({ min: 0, max: 5, default: 0 }),
  /** json = one JSON object per log line (default in production); text = readable (development). */
  LOG_FORMAT: z.enum(['json', 'text'], { error: 'must be one of: json, text' }).optional(),
  DATABASE_URL: databaseUrlSchema.optional(),
  AUTH_PROVIDER: z
    .enum(AUTH_PROVIDER_IDS, { error: `must be one of: ${AUTH_PROVIDER_IDS.join(', ')}` })
    .optional(),
  // Microsoft Entra External ID (AUTH_PROVIDER=entra) - decision 0013. Identifiers, not secrets.
  /** https://<tenant-subdomain>.ciamlogin.com */
  ENTRA_AUTHORITY: z.url({ protocol: /^https$/, error: 'must be an https URL' }).optional(),
  ENTRA_TENANT_ID: z.guid({ error: 'must be the directory (tenant) ID, a GUID' }).optional(),
  /** Application (client) ID of the Rein Drop API app registration (the token audience). */
  ENTRA_API_CLIENT_ID: z.guid({ error: 'must be the API application (client) ID, a GUID' }).optional(),
  /** Delegated scope name the API exposes. */
  ENTRA_REQUIRED_SCOPE: z.string().trim().regex(/^[\w.-]{1,100}$/, 'must be a scope name, e.g. access_as_user').optional(),
  EBAY_DEV_SCENARIO: devScenarioSchema,
  FACEBOOK_DEV_SCENARIO: devScenarioSchema,
  // Web billing (decision 0014): dev | stripe. Secrets come from the environment only.
  ...billingEnvShape,
  // Real eBay source (Browse API) - see resolveEbaySource. Secrets come from the environment only.
  ...ebayEnvShape,
  // Facebook data provider: dev (default) or the Apify development integration.
  ...facebookEnvShape,
  // Product events (beta telemetry): log (default) | none.
  ...productEventsEnvShape,
  // Geocoding / maps (decision 0017): mock (development) | azure | none (production default).
  ...geoEnvShape,
  /** Days of continued access after paid access ends involuntarily (decision 0018). 0 = no grace. */
  BILLING_GRACE_DAYS: intSchema({ min: 0, max: 30, default: 0 }),
  /** Rollout flags that are ON, comma-separated (decision 0018), e.g. "hunts.hot". Default: none. */
  FEATURE_FLAGS: z
    .string()
    .trim()
    .transform((s) => s.split(',').map((f) => f.trim()).filter(Boolean))
    .pipe(z.array(z.enum(FEATURE_FLAGS, { error: `must be a comma-separated list of: ${FEATURE_FLAGS.join(', ')}` })))
    .optional(),
});

/** Validated, typed API configuration. Inject with `@Inject(API_CONFIG)`. */
export interface ApiConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  /** Used by DatabaseModule (Prisma). Connection is lazy, so startup never needs the DB. */
  readonly databaseUrl: string;
  /** Which AuthProvider implementation authenticates requests. */
  readonly authProvider: AuthProviderId;
  readonly rateLimitPerMinute: number;
  readonly trustProxyHops: number;
  readonly logFormat: 'json' | 'text';
  /** Entra External ID verification settings when authProvider is "entra", else null. */
  readonly entra: EntraApiConfig | null;
  /** Web billing: Stripe settings, or the development fake. Holds secrets - never log it. */
  readonly billing: BillingConfig;
  /** Behaviour of the development marketplace sources (ignored by real adapters). */
  readonly devMarketplaceScenarios: { readonly ebay: DevScenario; readonly facebook: DevScenario };
  /** Real eBay Browse API credentials, or null for the development eBay source. Never log this. */
  readonly ebayApi: EbayCredentials | null;
  /** Apify development Facebook provider config, or null for the development provider. Never log this. */
  readonly facebookApify: ApifyMarketplaceConfig | null;
  /** Where product events go (log line by default; a vendor once D15 is decided). */
  readonly productEvents: ProductEventProviderId;
  /** Geocoder for suggestions, areas and Hunt locations (holds the Azure Maps key - never log it). */
  readonly geo: GeoConfig;
  /** Effective-access policy shared by API and worker (@rein-drop/access). */
  readonly accessPolicy: AccessPolicy;
  /** Rollout flags that are on (platform capabilities, decision 0018). */
  readonly featureFlags: readonly FeatureFlag[];
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
  const facebook = resolveFacebookSource(parsed, parsed.NODE_ENV);
  const billing = resolveBillingConfig(parsed, parsed.NODE_ENV);
  const geo = resolveGeoConfig(parsed, parsed.NODE_ENV);
  const problems: string[] = [...ebay.problems, ...facebook.problems, ...billing.problems, ...geo.problems];
  const authProvider: AuthProviderId = parsed.AUTH_PROVIDER ?? (parsed.NODE_ENV === 'production' ? 'entra' : 'dev');
  let entra: EntraApiConfig | null = null;
  if (authProvider === 'entra') {
    for (const key of ['ENTRA_AUTHORITY', 'ENTRA_TENANT_ID', 'ENTRA_API_CLIENT_ID'] as const) {
      if (!parsed[key]) problems.push(`${key}: required when AUTH_PROVIDER=entra`);
    }
    if (parsed.ENTRA_AUTHORITY && parsed.ENTRA_TENANT_ID && parsed.ENTRA_API_CLIENT_ID) {
      entra = {
        authority: parsed.ENTRA_AUTHORITY,
        tenantId: parsed.ENTRA_TENANT_ID.toLowerCase(),
        audience: parsed.ENTRA_API_CLIENT_ID.toLowerCase(),
        requiredScope: parsed.ENTRA_REQUIRED_SCOPE ?? ENTRA_DEFAULT_SCOPE_NAME,
      };
    }
  }
  if (parsed.NODE_ENV === 'production') {
    // DEVELOPMENT-ONLY auth can never be enabled in production (the provider refuses too).
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
    // Development default is "dev"; production requires an explicit value (and never "dev").
    authProvider,
    rateLimitPerMinute: parsed.RATE_LIMIT_PER_MINUTE,
    trustProxyHops: parsed.TRUST_PROXY_HOPS,
    logFormat: parsed.LOG_FORMAT ?? (parsed.NODE_ENV === 'production' ? 'json' : 'text'),
    entra: entra ? Object.freeze(entra) : null,
    billing: Object.freeze(billing.billing ?? { provider: 'dev' }),
    devMarketplaceScenarios: Object.freeze({
      ebay: parsed.EBAY_DEV_SCENARIO ?? 'normal',
      facebook: parsed.FACEBOOK_DEV_SCENARIO ?? 'normal',
    }),
    ebayApi: ebay.api ? Object.freeze(ebay.api) : null,
    facebookApify: facebook.apify ? Object.freeze(facebook.apify) : null,
    productEvents: resolveProductEventProviderId(parsed),
    geo: Object.freeze({ provider: geo.geo.provider, azure: geo.geo.azure ? Object.freeze(geo.geo.azure) : null }),
    accessPolicy: Object.freeze({ graceDays: parsed.BILLING_GRACE_DAYS }),
    featureFlags: Object.freeze([...new Set(parsed.FEATURE_FLAGS ?? [])]),
  });
}
