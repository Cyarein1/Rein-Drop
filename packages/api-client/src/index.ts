/**
 * Typed client for the Rein Drop API, shared by web and mobile.
 * All request/response types come from @rein-drop/contracts - apps should
 * import them from here (or from contracts), never redeclare them.
 */
import {
  accountIdentitySchema,
  createHuntRequestSchema,
  dealDetailSchema,
  dealPageSchema,
  healthResponseSchema,
  huntPageSchema,
  huntSchema,
  listDealsQuerySchema,
  listHuntsQuerySchema,
  readinessResponseSchema,
  sellerSnapshotSchema,
  updateHuntRequestSchema,
  type AccountIdentity,
  type CreateHuntRequest,
  type DealDetail,
  type DealSummary,
  type HealthResponse,
  type Hunt,
  type ListDealsQueryInput,
  type ListHuntsQueryInput,
  type Page,
  type ReadinessResponse,
  type SellerSnapshot,
  type UpdateHuntRequest,
} from '@rein-drop/contracts';
import { normalizeBaseUrl, pathId, send, validateInput, type HttpOptions } from './http.js';

export { ApiError } from './errors.js';
export type * from '@rein-drop/contracts';

export interface ApiClientOptions {
  /** e.g. http://localhost:4000 - no trailing path. */
  baseUrl: string;
  /** Per-request timeout. Defaults to 10s. */
  timeoutMs?: number;
  /** Override for tests or non-standard runtimes. */
  fetch?: typeof fetch;
  /**
   * Extra headers for every request.
   * TODO(auth): the auth provider is TBD; credentials will be supplied through this hook.
   */
  getHeaders?: HttpOptions['getHeaders'];
}

export interface ApiClient {
  /** Liveness. */
  getHealth(): Promise<HealthResponse>;
  /** Readiness. Resolves for both ready (200) and not ready (503). */
  getReadiness(): Promise<ReadinessResponse>;

  /** Current account (placeholder until auth is chosen). */
  getMe(): Promise<AccountIdentity>;
  getSellerSnapshot(): Promise<SellerSnapshot>;

  listHunts(query?: ListHuntsQueryInput): Promise<Page<Hunt>>;
  getHunt(id: string): Promise<Hunt>;
  createHunt(input: CreateHuntRequest): Promise<Hunt>;
  updateHunt(id: string, input: UpdateHuntRequest): Promise<Hunt>;

  listDeals(query?: ListDealsQueryInput): Promise<Page<DealSummary>>;
  getDeal(id: string): Promise<DealDetail>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Throws ApiError for configuration problems immediately, and from each method
 * for client-side validation, network, timeout, error and contract-mismatch failures.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const http: HttpOptions = {
    baseUrl: normalizeBaseUrl(options.baseUrl),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetch: options.fetch ?? ((...args) => globalThis.fetch(...args)),
    getHeaders: options.getHeaders,
  };

  return {
    getHealth: () => send(http, { method: 'GET', path: '/health', response: healthResponseSchema }),
    getReadiness: () =>
      send(http, {
        method: 'GET',
        path: '/ready',
        response: readinessResponseSchema,
        acceptStatuses: [503],
      }),

    getMe: () => send(http, { method: 'GET', path: '/me', response: accountIdentitySchema }),
    getSellerSnapshot: () =>
      send(http, { method: 'GET', path: '/me/snapshot', response: sellerSnapshotSchema }),

    listHunts: async (query = {}) =>
      send(http, {
        method: 'GET',
        path: '/hunts',
        query: validateInput(listHuntsQuerySchema, query, 'query'),
        response: huntPageSchema,
      }),
    getHunt: (id) => send(http, { method: 'GET', path: `/hunts/${pathId(id)}`, response: huntSchema }),
    createHunt: async (input) =>
      send(http, {
        method: 'POST',
        path: '/hunts',
        body: validateInput(createHuntRequestSchema, input, 'body'),
        response: huntSchema,
      }),
    updateHunt: async (id, input) =>
      send(http, {
        method: 'PATCH',
        path: `/hunts/${pathId(id)}`,
        body: validateInput(updateHuntRequestSchema, input, 'body'),
        response: huntSchema,
      }),

    listDeals: async (query = {}) =>
      send(http, {
        method: 'GET',
        path: '/deals',
        query: validateInput(listDealsQuerySchema, query, 'query'),
        response: dealPageSchema,
      }),
    getDeal: (id) => send(http, { method: 'GET', path: `/deals/${pathId(id)}`, response: dealDetailSchema }),
  };
}
