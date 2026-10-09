import { z } from 'zod';
import { LogProductEventProvider, NoopProductEventProvider, type ProductEventProvider } from './provider.js';

export const PRODUCT_EVENT_PROVIDER_IDS = ['log', 'none'] as const;
export type ProductEventProviderId = (typeof PRODUCT_EVENT_PROVIDER_IDS)[number];

/**
 * Environment for product events, spread into an app's env schema.
 * PRODUCT_EVENTS_PROVIDER: log (default - one structured log line per event) | none.
 * TODO(telemetry): a vendor provider (PostHog candidate) once D15 is decided - its key comes from
 * the environment / Key Vault only.
 */
export const productEventsEnvShape = {
  PRODUCT_EVENTS_PROVIDER: z
    .enum(PRODUCT_EVENT_PROVIDER_IDS, { error: `must be one of: ${PRODUCT_EVENT_PROVIDER_IDS.join(', ')}` })
    .optional(),
};

export function resolveProductEventProviderId(env: { PRODUCT_EVENTS_PROVIDER?: ProductEventProviderId }): ProductEventProviderId {
  return env.PRODUCT_EVENTS_PROVIDER ?? 'log';
}

export function createProductEventProvider(
  id: ProductEventProviderId,
  log: (entry: object | string) => void,
  format: 'json' | 'text',
): ProductEventProvider {
  return id === 'none' ? new NoopProductEventProvider() : new LogProductEventProvider(log, format);
}
