import { MarketplaceError } from '../../errors.js';
import type { CancellationSignal } from '../../search.js';
import { EBAY_HOSTS, EBAY_PUBLIC_SCOPE, ebayErrorSchema, ebayTokenSchema, type EbayEnvironment } from './ebay-browse-schema.js';

/**
 * Minimal HTTP for the eBay REST APIs: an application access token (OAuth client credentials
 * grant), cached until shortly before it expires and refreshed once on a 401, plus mapping of
 * HTTP failures to MarketplaceError codes. Credentials only ever come from the caller's config
 * (environment) - never from code, logs or errors.
 */

import type { FetchLike, HttpResponse } from '../http.js';
export type { FetchLike, HttpResponse } from '../http.js';

export interface EbayCredentials {
  clientId: string;
  clientSecret: string;
  environment: EbayEnvironment;
  /** eBay site, e.g. EBAY_US (header X-EBAY-C-MARKETPLACE-ID). */
  marketplaceId: string;
}

export interface EbayClientOptions extends EbayCredentials {
  provider: string;
  fetch?: FetchLike;
  now?: () => Date;
}

/** Refresh this long before the token's stated expiry. */
const TOKEN_EARLY_MS = 5 * 60_000;
/** Used when a 429 carries no Retry-After. */
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;

type Runtime = { fetch?: FetchLike; btoa?: (s: string) => string };
const runtime = globalThis as unknown as Runtime;

export class EbayClient {
  private token: { value: string; expiresAt: number } | null = null;
  private pendingToken: Promise<string> | null = null;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  readonly host: string;

  constructor(private readonly options: EbayClientOptions) {
    const f = options.fetch ?? runtime.fetch;
    if (!f) throw new Error('No fetch implementation available');
    this.fetchImpl = f;
    this.now = options.now ?? (() => new Date());
    this.host = EBAY_HOSTS[options.environment];
  }

  private get source() {
    return { marketplace: 'ebay' as const, provider: this.options.provider };
  }

  /** GET a Browse API path; returns the parsed JSON body, or null for 404. */
  async getJson(path: string, signal?: CancellationSignal): Promise<unknown | null> {
    for (let attempt = 1; ; attempt++) {
      const token = await this.accessToken(signal);
      const res = await this.request(`${this.host}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': this.options.marketplaceId,
          Accept: 'application/json',
        },
        signal,
      });
      if (res.status === 401 && attempt === 1) {
        // Token revoked / expired early: get a new one once.
        this.token = null;
        continue;
      }
      if (res.status === 404) return null;
      if (res.status >= 200 && res.status < 300) return this.parse(await res.text());
      throw await this.failure(res, 'Browse API');
    }
  }

  /** Cached application token; concurrent callers share one refresh. */
  async accessToken(signal?: CancellationSignal): Promise<string> {
    if (this.token && this.token.expiresAt > this.now().getTime()) return this.token.value;
    this.pendingToken ??= this.fetchToken(signal).finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  private async fetchToken(signal?: CancellationSignal): Promise<string> {
    const btoa = runtime.btoa;
    if (!btoa) throw new MarketplaceError('NOT_CONFIGURED', 'No base64 encoder available for eBay credentials', this.source);
    const res = await this.request(`${this.host}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${this.options.clientId}:${this.options.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_PUBLIC_SCOPE)}`,
      signal,
    });
    if (res.status === 400 || res.status === 401) {
      // invalid_client / unauthorized: the configured credentials are wrong - retrying won't help.
      throw new MarketplaceError('NOT_CONFIGURED', 'eBay rejected the configured credentials (check EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_ENVIRONMENT)', this.source);
    }
    if (res.status < 200 || res.status >= 300) throw await this.failure(res, 'OAuth token');
    const parsed = ebayTokenSchema.safeParse(this.parse(await res.text()));
    if (!parsed.success) throw new MarketplaceError('INVALID_RESPONSE', 'eBay returned an unreadable access token response', this.source);
    const lifetime = parsed.data.expires_in * 1000;
    this.token = { value: parsed.data.access_token, expiresAt: this.now().getTime() + Math.max(lifetime - TOKEN_EARLY_MS, lifetime / 2) };
    return this.token.value;
  }

  private async request(url: string, init: Parameters<FetchLike>[1] & { signal?: CancellationSignal }): Promise<HttpResponse> {
    if (init.signal?.aborted) throw new MarketplaceError('ABORTED', 'Search was cancelled', this.source);
    try {
      return await this.fetchImpl(url, init);
    } catch (err) {
      if (init.signal?.aborted) throw new MarketplaceError('ABORTED', 'Search was cancelled', { ...this.source, cause: err });
      throw new MarketplaceError('UNAVAILABLE', 'Could not reach eBay', { ...this.source, cause: err });
    }
  }

  private parse(text: string): unknown {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new MarketplaceError('INVALID_RESPONSE', 'eBay returned a response that is not JSON', this.source);
    }
  }

  /** HTTP failure -> MarketplaceError (messages carry eBay's error text, never credentials). */
  private async failure(res: HttpResponse, what: string): Promise<MarketplaceError> {
    let details: string[] = [];
    try {
      const body = ebayErrorSchema.safeParse(JSON.parse(await res.text()));
      if (body.success) details = (body.data.errors ?? []).map((e) => `${e.errorId ?? ''} ${e.longMessage ?? e.message ?? ''}`.trim()).filter(Boolean);
    } catch {
      // not JSON - keep the status only
    }
    const summary = `${what} returned HTTP ${res.status}${details[0] ? `: ${details[0]}` : ''}`;
    if (res.status === 429) {
      return new MarketplaceError('RATE_LIMITED', summary, { ...this.source, details, retryAfter: retryAfterOf(res, this.now()) });
    }
    if (res.status >= 500) return new MarketplaceError('UNAVAILABLE', summary, { ...this.source, details });
    if (res.status === 401 || res.status === 403) return new MarketplaceError('NOT_CONFIGURED', `${summary} (this application may not have access to the Browse API)`, { ...this.source, details });
    // 400 and other 4xx: eBay refused the request itself (e.g. an invalid filter) - not retryable.
    return new MarketplaceError('UNSUPPORTED_CRITERIA', summary, { ...this.source, details });
  }
}

/** Retry-After as seconds or an HTTP date; a default wait when absent or unreadable. */
export function retryAfterOf(res: Pick<HttpResponse, 'headers'>, now: Date): Date {
  const header = res.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return new Date(now.getTime() + seconds * 1000);
    const at = Date.parse(header);
    if (!Number.isNaN(at)) return new Date(Math.max(at, now.getTime()));
  }
  return new Date(now.getTime() + DEFAULT_RATE_LIMIT_WAIT_MS);
}
