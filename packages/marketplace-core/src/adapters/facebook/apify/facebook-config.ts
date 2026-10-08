import { z } from 'zod';
import type { ApifyMarketplaceConfig } from './apify-marketplace-provider.js';

/**
 * Facebook data provider selection from environment variables (API + worker configs).
 * See docs/providers/facebook-apify.md for every variable.
 */
export const facebookEnvShape = {
  FACEBOOK_SOURCE: z.enum(['dev', 'apify'], { error: 'must be one of: dev, apify' }).optional(),
  APIFY_TOKEN: z.string().trim().min(1).optional(),
  FACEBOOK_APIFY_CURRENCY: z.string().regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO-4217 code').optional(),
  FACEBOOK_APIFY_ACTOR: z
    .string()
    .regex(/^[\w.-]+~[\w.-]+$|^[A-Za-z0-9]{17}$/, 'must be an actor id or username~actor-name')
    .optional(),
  FACEBOOK_APIFY_RESULTS_LIMIT: z.coerce.number().int().min(1).max(100).optional(),
  FACEBOOK_APIFY_PRICE_PER_1000_USD: z.coerce.number().min(0).max(1000).optional(),
  FACEBOOK_APIFY_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(290).optional(),
};
export type FacebookEnv = { [K in keyof typeof facebookEnvShape]?: z.infer<(typeof facebookEnvShape)[K]> };

/**
 * The Apify provider config, or null for the development provider. The Apify integration is
 * development-only until its terms are decided (D12), so production refuses it.
 */
export function resolveFacebookSource(env: FacebookEnv, nodeEnv: 'development' | 'test' | 'production'): { apify: ApifyMarketplaceConfig | null; problems: string[] } {
  const source = env.FACEBOOK_SOURCE ?? 'dev';
  if (source === 'dev') {
    return { apify: null, problems: nodeEnv === 'production' && env.FACEBOOK_SOURCE === 'dev' ? ['FACEBOOK_SOURCE: "dev" is development-only, not allowed when NODE_ENV=production'] : [] };
  }
  const problems: string[] = [];
  if (nodeEnv === 'production') problems.push('FACEBOOK_SOURCE: "apify" is a development integration (terms not approved - D12), not allowed when NODE_ENV=production');
  if (!env.APIFY_TOKEN) problems.push('APIFY_TOKEN: required when FACEBOOK_SOURCE=apify');
  if (!env.FACEBOOK_APIFY_CURRENCY) problems.push('FACEBOOK_APIFY_CURRENCY: required when FACEBOOK_SOURCE=apify (the searched region\'s currency, e.g. ZAR)');
  if (problems.length > 0) return { apify: null, problems };
  return {
    apify: {
      token: env.APIFY_TOKEN!,
      currency: env.FACEBOOK_APIFY_CURRENCY!,
      actor: env.FACEBOOK_APIFY_ACTOR,
      resultsLimit: env.FACEBOOK_APIFY_RESULTS_LIMIT,
      pricePer1000Usd: env.FACEBOOK_APIFY_PRICE_PER_1000_USD,
      timeoutSeconds: env.FACEBOOK_APIFY_TIMEOUT_SECONDS,
    },
    problems,
  };
}
