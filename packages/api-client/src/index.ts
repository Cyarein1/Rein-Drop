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
  homeSummarySchema,
  huntEventListSchema,
  activationCheckSchema,
  entitlementEvaluationSchema,
  planListSchema,
  updateUserLocaleRequestSchema,
  userLocaleResponseSchema,
  huntPageSchema,
  huntSchema,
  listDealsQuerySchema,
  listHuntsQuerySchema,
  readinessResponseSchema,
  sellerSnapshotSchema,
  updateHuntRequestSchema,
  updateSellerSnapshotRequestSchema,
  saveSellerSnapshotRequestSchema,
  type AccountIdentity,
  type SaveSellerSnapshotRequestInput,
  type CreateHuntRequestInput,
  type DealDetail,
  type DealSummary,
  type HealthResponse,
  type HomeSummary,
  type Hunt,
  type HuntAction,
  type HuntEvent,
  type ListDealsQueryInput,
  type ListHuntsQueryInput,
  type Page,
  type ReadinessResponse,
  type SellerSnapshot,
  type UpdateHuntRequest,
  type UpdateSellerSnapshotRequest,
  type UpdateUserLocaleRequestInput,
  type UserLocale,
  type ActivationCheck,
  type EntitlementEvaluation,
  type Plan,
} from '@rein-drop/contracts';
import { normalizeBaseUrl, pathId, send, validateInput, type HttpOptions } from './http.js';

export { ApiError } from './errors.js';
export type * from '@rein-drop/contracts';
export {
  AUTH_PROVIDER_IDS,
  DEV_AUTH_HEADER,
  DEV_AUTH_SUBJECT,
  detectedLocaleRequest,
  kmToUnit,
  uiLanguage,
  unitToKm,
} from '@rein-drop/contracts';

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

  /** Current account (placeholder until auth is chosen), including locale preferences. */
  getMe(): Promise<AccountIdentity>;
  getLocale(): Promise<UserLocale | null>;
  /** Set the locale, or report a detected one (`source: 'detected'` never overwrites). */
  updateLocale(input: UpdateUserLocaleRequestInput): Promise<UserLocale | null>;
  /** The five onboarding answers (unanswered = null/empty). */
  getSellerSnapshot(): Promise<SellerSnapshot>;
  /** Save one or more onboarding answers; returns the updated snapshot. */
  updateSellerSnapshot(input: UpdateSellerSnapshotRequest): Promise<SellerSnapshot>;
  /** Save all five onboarding answers at once (every question required). */
  saveSellerSnapshot(input: SaveSellerSnapshotRequestInput): Promise<SellerSnapshot>;
  /** Counts for the returning-user home. */
  getHomeSummary(): Promise<HomeSummary>;

  /** Newest first; archived hunts only when `status: 'ARCHIVED'` is requested. */
  listHunts(query?: ListHuntsQueryInput): Promise<Page<Hunt>>;
  getHunt(id: string): Promise<Hunt>;
  /** Creates a DRAFT hunt. */
  createHunt(input: CreateHuntRequestInput): Promise<Hunt>;
  /** Edits criteria (same id; recorded in the hunt's history). */
  updateHunt(id: string, input: UpdateHuntRequest): Promise<Hunt>;
  /** Lifecycle: activate (DRAFT->LIVE), pause, resume (PAUSED->LIVE), archive. */
  transitionHunt(id: string, action: HuntAction): Promise<Hunt>;
  /** The hunt's history, oldest first. */
  listHuntEvents(id: string): Promise<HuntEvent[]>;
  /** Could this hunt go live now (plan limits + readiness)? */
  checkHuntActivation(id: string): Promise<ActivationCheck>;

  /** Plans for the plan gate (prices TBD; limits are placeholders while `limitsFinal` is false). */
  listPlans(): Promise<Plan[]>;
  /** The caller's plan, entitlements, usage and remaining allowance. */
  getEntitlements(): Promise<EntitlementEvaluation>;

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
    getLocale: async () =>
      (await send(http, { method: 'GET', path: '/me/locale', response: userLocaleResponseSchema })).locale,
    updateLocale: async (input) =>
      (
        await send(http, {
          method: 'PUT',
          path: '/me/locale',
          body: validateInput(updateUserLocaleRequestSchema, input, 'body'),
          response: userLocaleResponseSchema,
        })
      ).locale,
    getSellerSnapshot: () =>
      send(http, { method: 'GET', path: '/me/seller-snapshot', response: sellerSnapshotSchema }),
    updateSellerSnapshot: async (input) =>
      send(http, {
        method: 'PATCH',
        path: '/me/seller-snapshot',
        body: validateInput(updateSellerSnapshotRequestSchema, input, 'body'),
        response: sellerSnapshotSchema,
      }),
    saveSellerSnapshot: async (input) =>
      send(http, {
        method: 'PUT',
        path: '/me/seller-snapshot',
        body: validateInput(saveSellerSnapshotRequestSchema, input, 'body'),
        response: sellerSnapshotSchema,
      }),
    getHomeSummary: () =>
      send(http, { method: 'GET', path: '/me/home-summary', response: homeSummarySchema }),

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
    transitionHunt: (id, action) =>
      send(http, { method: 'POST', path: `/hunts/${pathId(id)}/${action}`, response: huntSchema }),
    listHuntEvents: async (id) =>
      (await send(http, { method: 'GET', path: `/hunts/${pathId(id)}/events`, response: huntEventListSchema })).items,
    checkHuntActivation: (id) =>
      send(http, { method: 'GET', path: `/hunts/${pathId(id)}/activation-check`, response: activationCheckSchema }),
    listPlans: async () => (await send(http, { method: 'GET', path: '/plans', response: planListSchema })).items,
    getEntitlements: () =>
      send(http, { method: 'GET', path: '/me/entitlements', response: entitlementEvaluationSchema }),

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
