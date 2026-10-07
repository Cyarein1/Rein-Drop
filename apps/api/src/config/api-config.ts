import { z } from 'zod';
import { AUTH_PROVIDER_IDS, type AuthProviderId } from '@rein-drop/contracts';
import {
  databaseUrlSchema,
  EnvValidationError,
  nodeEnvSchema,
  parseEnv,
  portSchema,
  resolveDatabaseUrl,
  type NodeEnv,
} from '@rein-drop/env';

const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: portSchema(4000),
  DATABASE_URL: databaseUrlSchema.optional(),
  AUTH_PROVIDER: z
    .enum(AUTH_PROVIDER_IDS, { error: `must be one of: ${AUTH_PROVIDER_IDS.join(', ')}` })
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
}

export const API_CONFIG = Symbol('API_CONFIG');

/** Throws EnvValidationError listing every invalid variable. */
export function loadApiConfig(
  env: Record<string, string | undefined> = process.env,
): ApiConfig {
  const parsed = parseEnv('api', apiEnvSchema, env, {
    requiredInProduction: ['DATABASE_URL', 'AUTH_PROVIDER'],
  });

  // DEVELOPMENT-ONLY auth must never run in production. No managed provider exists
  // yet (TBD), so production cannot start until one is added - by design.
  if (parsed.NODE_ENV === 'production' && parsed.AUTH_PROVIDER === 'dev') {
    throw new EnvValidationError('api', [
      'AUTH_PROVIDER: "dev" is a development-only provider and is not allowed when NODE_ENV=production',
    ]);
  }

  return Object.freeze({
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: resolveDatabaseUrl(parsed),
    // Safe default outside production only (production requires an explicit value above).
    authProvider: parsed.AUTH_PROVIDER ?? 'dev',
  });
}
