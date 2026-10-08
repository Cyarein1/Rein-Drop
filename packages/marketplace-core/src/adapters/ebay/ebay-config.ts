import { z } from 'zod';
import type { EbayCredentials } from './ebay-client.js';

/**
 * eBay source selection from environment variables, shared by the API and worker configs.
 *
 *   EBAY_SOURCE          dev | api. Default: dev outside production, api in production.
 *   EBAY_CLIENT_ID       required for api (eBay developer keyset "App ID / Client ID").
 *   EBAY_CLIENT_SECRET   required for api (keyset "Cert ID / Client Secret"). Never commit it.
 *   EBAY_ENVIRONMENT     production | sandbox (default production) - must match the keyset.
 *   EBAY_MARKETPLACE_ID  eBay site, e.g. EBAY_US (default), EBAY_GB, EBAY_AU.
 */
export const ebayEnvShape = {
  EBAY_SOURCE: z.enum(['dev', 'api'], { error: 'must be one of: dev, api' }).optional(),
  EBAY_CLIENT_ID: z.string().trim().min(1).optional(),
  EBAY_CLIENT_SECRET: z.string().trim().min(1).optional(),
  EBAY_ENVIRONMENT: z.enum(['production', 'sandbox'], { error: 'must be one of: production, sandbox' }).optional(),
  EBAY_MARKETPLACE_ID: z
    .string()
    .regex(/^EBAY_[A-Z]{2,}$/, 'must be an eBay marketplace id like EBAY_US')
    .optional(),
};

export type EbayEnv = { [K in keyof typeof ebayEnvShape]?: z.infer<(typeof ebayEnvShape)[K]> };

/**
 * Which eBay source to use: credentials for the real API, or null for the development source.
 * Problems are returned (not thrown) so the caller can report every invalid variable at once.
 */
export function resolveEbaySource(env: EbayEnv, nodeEnv: 'development' | 'test' | 'production'): { api: EbayCredentials | null; problems: string[] } {
  const source = env.EBAY_SOURCE ?? (nodeEnv === 'production' ? 'api' : 'dev');
  const problems: string[] = [];
  if (source === 'dev') {
    if (nodeEnv === 'production') problems.push('EBAY_SOURCE: "dev" is development-only, not allowed when NODE_ENV=production');
    return { api: null, problems };
  }
  if (!env.EBAY_CLIENT_ID) problems.push('EBAY_CLIENT_ID: required when EBAY_SOURCE=api');
  if (!env.EBAY_CLIENT_SECRET) problems.push('EBAY_CLIENT_SECRET: required when EBAY_SOURCE=api');
  if (problems.length > 0) return { api: null, problems };
  return {
    api: {
      clientId: env.EBAY_CLIENT_ID!,
      clientSecret: env.EBAY_CLIENT_SECRET!,
      environment: env.EBAY_ENVIRONMENT ?? 'production',
      marketplaceId: env.EBAY_MARKETPLACE_ID ?? 'EBAY_US',
    },
    problems,
  };
}
