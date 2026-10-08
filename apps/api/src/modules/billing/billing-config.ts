import { z } from 'zod';

/**
 * Web billing configuration (decision 0014). Prices are never in code: each paid plan code maps
 * to a Stripe price id here, and amounts are read from Stripe. Secrets come from the environment.
 */
export type BillingConfig =
  /** DEVELOPMENT-ONLY fake confirmation (no card, no charge). Refused in production. */
  | { provider: 'dev' }
  | {
      provider: 'stripe';
      /** Secret / restricted key. Never log it. */
      secretKey: string;
      /** Signing secret of the webhook endpoint (whsec_...). Never log it. */
      webhookSecret: string;
      /** Plan code -> Stripe price id. A plan without one shows "TBD" and can't be bought. */
      priceIds: Readonly<Record<string, string>>;
      /** Public origin of the web app: checkout / portal return URLs are built from it. */
      webAppUrl: string;
    };

export const billingEnvShape = {
  BILLING_PROVIDER: z.enum(['dev', 'stripe'], { error: 'must be one of: dev, stripe' }).optional(),
  STRIPE_SECRET_KEY: z
    .string()
    .trim()
    .regex(/^(sk|rk)_(test|live)_\w+$/, 'must be a Stripe secret (sk_...) or restricted (rk_...) key')
    .optional(),
  STRIPE_WEBHOOK_SECRET: z.string().trim().regex(/^whsec_\w+$/, 'must be a webhook signing secret (whsec_...)').optional(),
  /** "pro=price_123,ultimate=price_456" */
  STRIPE_PRICE_IDS: z.string().trim().min(1).optional(),
  WEB_APP_URL: z.url({ protocol: /^https?$/, error: 'must be the web app origin, e.g. https://app.example.com' }).optional(),
};
export type BillingEnv = { [K in keyof typeof billingEnvShape]?: z.infer<(typeof billingEnvShape)[K]> };

/** "pro=price_123, ultimate=price_456" -> { pro: "price_123", ultimate: "price_456" }, or the problem. */
export function parsePriceIds(raw: string): { priceIds: Record<string, string> } | { problem: string } {
  const priceIds: Record<string, string> = {};
  const seen = new Set<string>();
  for (const part of raw.split(',').map((p) => p.trim()).filter(Boolean)) {
    const match = /^([a-z0-9][a-z0-9_-]{0,49})=(price_\w+)$/.exec(part);
    if (!match) return { problem: `STRIPE_PRICE_IDS: "${part}" must look like plan=price_...` };
    const [, plan, price] = match as unknown as [string, string, string];
    if (priceIds[plan]) return { problem: `STRIPE_PRICE_IDS: plan "${plan}" is listed twice` };
    if (seen.has(price)) return { problem: `STRIPE_PRICE_IDS: ${price} is used by two plans` };
    priceIds[plan] = price;
    seen.add(price);
  }
  if (Object.keys(priceIds).length === 0) return { problem: 'STRIPE_PRICE_IDS: no plan=price pairs' };
  return { priceIds };
}

export function resolveBillingConfig(env: BillingEnv, nodeEnv: 'development' | 'test' | 'production'): { billing: BillingConfig | null; problems: string[] } {
  const provider = env.BILLING_PROVIDER ?? (nodeEnv === 'production' ? 'stripe' : 'dev');
  if (provider === 'dev') {
    return nodeEnv === 'production'
      ? { billing: null, problems: ['BILLING_PROVIDER: "dev" is a development-only fake checkout, not allowed when NODE_ENV=production'] }
      : { billing: { provider: 'dev' }, problems: [] };
  }
  const problems: string[] = [];
  for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_IDS', 'WEB_APP_URL'] as const) {
    if (!env[key]) problems.push(`${key}: required when BILLING_PROVIDER=stripe`);
  }
  const prices = env.STRIPE_PRICE_IDS ? parsePriceIds(env.STRIPE_PRICE_IDS) : null;
  if (prices && 'problem' in prices) problems.push(prices.problem);
  if (problems.length > 0 || !prices || 'problem' in prices) return { billing: null, problems };
  return {
    billing: {
      provider: 'stripe',
      secretKey: env.STRIPE_SECRET_KEY!,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET!,
      priceIds: Object.freeze(prices.priceIds),
      webAppUrl: env.WEB_APP_URL!.replace(/\/+$/, ''),
    },
    problems: [],
  };
}
