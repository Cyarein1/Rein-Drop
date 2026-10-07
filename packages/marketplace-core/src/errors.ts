import type { MarketplaceId } from './ids.js';

/**
 * Every adapter failure surfaces as a MarketplaceError, so callers (worker jobs, health checks)
 * can decide on retries without knowing the marketplace or its SDK.
 */
export const MARKETPLACE_ERROR_CODES = [
  /** The criteria break a hard capability rule (e.g. no location on a local marketplace). */
  'UNSUPPORTED_CRITERIA',
  /** No adapter or no credentials for this source. */
  'NOT_CONFIGURED',
  /** The source asked us to slow down. */
  'RATE_LIMITED',
  /** The source is down, timed out or returned a server error. */
  'UNAVAILABLE',
  /** The source answered with something we can't read. */
  'INVALID_RESPONSE',
  /** The caller cancelled (AbortSignal). */
  'ABORTED',
] as const;
export type MarketplaceErrorCode = (typeof MARKETPLACE_ERROR_CODES)[number];

const RETRYABLE: ReadonlySet<MarketplaceErrorCode> = new Set(['RATE_LIMITED', 'UNAVAILABLE']);

export interface MarketplaceErrorOptions {
  marketplace: MarketplaceId;
  provider: string;
  retryAfter?: Date | null;
  /** Field-level detail, e.g. criteria problems. */
  details?: string[];
  cause?: unknown;
}

export class MarketplaceError extends Error {
  readonly code: MarketplaceErrorCode;
  readonly marketplace: MarketplaceId;
  readonly provider: string;
  readonly retryable: boolean;
  readonly retryAfter: Date | null;
  readonly details: string[];

  constructor(code: MarketplaceErrorCode, message: string, options: MarketplaceErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'MarketplaceError';
    this.code = code;
    this.marketplace = options.marketplace;
    this.provider = options.provider;
    this.retryable = RETRYABLE.has(code);
    this.retryAfter = options.retryAfter ?? null;
    this.details = options.details ?? [];
  }
}

export function isMarketplaceError(value: unknown): value is MarketplaceError {
  return value instanceof MarketplaceError;
}
