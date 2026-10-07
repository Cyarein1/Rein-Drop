import type { MarketplaceId } from './ids.js';

/**
 * Source health, as last observed by an adapter.
 * - `healthy`: searches work.
 * - `degraded`: searches work but are slow, partial or rate-limited (`retryAfter` may be set).
 * - `down`: searches fail.
 * - `not_configured`: no adapter, or missing credentials - expected in some environments.
 */
export const SOURCE_HEALTH_STATUSES = ['healthy', 'degraded', 'down', 'not_configured'] as const;
export type SourceHealthStatus = (typeof SOURCE_HEALTH_STATUSES)[number];

export interface SourceHealth {
  marketplace: MarketplaceId;
  /** Which implementation answered, e.g. `mock`. */
  provider: string;
  status: SourceHealthStatus;
  checkedAt: Date;
  /** Plain-language detail for logs / status screens. Never secrets. */
  message: string | null;
  /** When it is worth trying again, if the source said. */
  retryAfter: Date | null;
}
