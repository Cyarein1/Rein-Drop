/**
 * Typed client for the Rein Drop API, shared by web and mobile.
 * All request/response types come from @rein-drop/contracts - apps should
 * import them from here (or from contracts), never redeclare them.
 */
import {
  accountIdentitySchema,
  alertPageSchema,
  alertSchema,
  listAlertsQuerySchema,
  markAllAlertsReadResponseSchema,
  notificationLogSchema,
  notificationPreferencesSchema,
  pushDeviceListSchema,
  pushDeviceSchema,
  registerPushDeviceRequestSchema,
  updateNotificationPreferencesRequestSchema,
  createHuntRequestSchema,
  dealDetailSchema,
  dealPageSchema,
  healthResponseSchema,
  homeSchema,
  huntActivityListSchema,
  huntActivitySchema,
  huntEventListSchema,
  activationCheckSchema,
  devBillingConfirmRequestSchema,
  devBillingConfirmResponseSchema,
  entitlementEvaluationSchema,
  planListSchema,
  updateUserLocaleRequestSchema,
  userLocaleResponseSchema,
  huntPageSchema,
  huntSchema,
  ignoreDealRequestSchema,
  listDealsQuerySchema,
  listHuntsQuerySchema,
  markDealBoughtRequestSchema,
  readinessResponseSchema,
  sellerSnapshotSchema,
  updateHuntRequestSchema,
  updateSellerSnapshotRequestSchema,
  saveSellerSnapshotRequestSchema,
  type AccountIdentity,
  type Alert,
  type AlertPage,
  type ListAlertsQueryInput,
  type NotificationLog,
  type NotificationPreferences,
  type PushDevice,
  type RegisterPushDeviceRequest,
  type UpdateNotificationPreferencesRequest,
  type SaveSellerSnapshotRequestInput,
  type CreateHuntRequestInput,
  type DealDetail,
  type DealSummary,
  type HealthResponse,
  type Home,
  type Hunt,
  type HuntAction,
  type HuntActivity,
  type HuntEvent,
  type IgnoreDealRequest,
  type ListDealsQueryInput,
  type MarkDealBoughtRequest,
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
  type SubscriptionSummary,
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
  /** Home: attention, active Hunts, realized profit, recent activity, one recommendation. */
  getHome(): Promise<Home>;

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
  /** Last checked per marketplace, first-scan state and simple performance counts. */
  getHuntActivity(id: string): Promise<HuntActivity>;
  /** The same for all of your hunts (one call for the list). */
  listHuntActivity(): Promise<HuntActivity[]>;

  /** Plans for the plan gate (prices TBD; limits are placeholders while `limitsFinal` is false). */
  listPlans(): Promise<Plan[]>;
  /** The caller's plan, entitlements, usage and remaining allowance. */
  getEntitlements(): Promise<EntitlementEvaluation>;
  /**
   * DEVELOPMENT ONLY: fake billing confirmation for a plan (no payment). The API answers
   * 404 in production. TODO(billing): real checkout is not integrated.
   */
  confirmDevBilling(planCode: string): Promise<SubscriptionSummary>;

  /** Ranked feed (strength, then freshness). Default status filter: `open`. */
  listDeals(query?: ListDealsQueryInput): Promise<Page<DealSummary>>;
  getDeal(id: string): Promise<DealDetail>;
  /** The user opened the deal (NEW -> SEEN). */
  markDealSeen(id: string): Promise<DealDetail>;
  saveDeal(id: string): Promise<DealDetail>;
  unsaveDeal(id: string): Promise<DealDetail>;
  /** "Not for me", with an optional reason. */
  ignoreDeal(id: string, input?: IgnoreDealRequest): Promise<DealDetail>;
  unignoreDeal(id: string): Promise<DealDetail>;
  /** Records the purchase (price defaults to the asking price). Idempotent. */
  markDealBought(id: string, input?: MarkDealBoughtRequest): Promise<DealDetail>;

  /** Per-category, per-channel notification choices (marketing separate, opt-in). */
  getNotificationPreferences(): Promise<NotificationPreferences>;
  updateNotificationPreferences(input: UpdateNotificationPreferencesRequest): Promise<NotificationPreferences>;
  /** In-app inbox, newest first, with the unread count. */
  listAlerts(query?: ListAlertsQueryInput): Promise<AlertPage>;
  markAlertRead(id: string): Promise<Alert>;
  markAllAlertsRead(): Promise<{ updated: number }>;
  /** DEVELOPMENT ONLY: the notification simulator log (404 in production). */
  getNotificationLog(): Promise<NotificationLog>;

  /** Register (or refresh) this phone for push. Same token = same device. */
  registerPushDevice(input: RegisterPushDeviceRequest): Promise<PushDevice>;
  listPushDevices(): Promise<PushDevice[]>;
  /** Stop push to this phone. */
  unregisterPushDevice(id: string): Promise<PushDevice>;
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
    getHome: () => send(http, { method: 'GET', path: '/me/home', response: homeSchema }),

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
    getHuntActivity: (id) => send(http, { method: 'GET', path: `/hunts/${pathId(id)}/activity`, response: huntActivitySchema }),
    listHuntActivity: async () => (await send(http, { method: 'GET', path: '/hunts/activity', response: huntActivityListSchema })).items,
    listPlans: async () => (await send(http, { method: 'GET', path: '/plans', response: planListSchema })).items,
    getEntitlements: () =>
      send(http, { method: 'GET', path: '/me/entitlements', response: entitlementEvaluationSchema }),
    confirmDevBilling: async (planCode) =>
      (
        await send(http, {
          method: 'POST',
          path: '/billing/dev/confirm',
          body: validateInput(devBillingConfirmRequestSchema, { planCode }, 'body'),
          response: devBillingConfirmResponseSchema,
        })
      ).subscription,

    listDeals: async (query = {}) =>
      send(http, {
        method: 'GET',
        path: '/deals',
        query: validateInput(listDealsQuerySchema, query, 'query'),
        response: dealPageSchema,
      }),
    getDeal: (id) => send(http, { method: 'GET', path: `/deals/${pathId(id)}`, response: dealDetailSchema }),
    markDealSeen: (id) => send(http, { method: 'POST', path: `/deals/${pathId(id)}/seen`, response: dealDetailSchema }),
    saveDeal: (id) => send(http, { method: 'POST', path: `/deals/${pathId(id)}/save`, response: dealDetailSchema }),
    unsaveDeal: (id) => send(http, { method: 'DELETE', path: `/deals/${pathId(id)}/save`, response: dealDetailSchema }),
    ignoreDeal: async (id, input = {}) =>
      send(http, {
        method: 'POST',
        path: `/deals/${pathId(id)}/ignore`,
        body: validateInput(ignoreDealRequestSchema, input, 'body'),
        response: dealDetailSchema,
      }),
    unignoreDeal: (id) => send(http, { method: 'DELETE', path: `/deals/${pathId(id)}/ignore`, response: dealDetailSchema }),
    markDealBought: async (id, input = {}) =>
      send(http, {
        method: 'POST',
        path: `/deals/${pathId(id)}/bought`,
        body: validateInput(markDealBoughtRequestSchema, input, 'body'),
        response: dealDetailSchema,
      }),

    getNotificationPreferences: () =>
      send(http, { method: 'GET', path: '/me/notification-preferences', response: notificationPreferencesSchema }),
    updateNotificationPreferences: async (input) =>
      send(http, {
        method: 'PATCH',
        path: '/me/notification-preferences',
        body: validateInput(updateNotificationPreferencesRequestSchema, input, 'body'),
        response: notificationPreferencesSchema,
      }),
    listAlerts: async (query = {}) =>
      send(http, { method: 'GET', path: '/alerts', query: validateInput(listAlertsQuerySchema, query, 'query'), response: alertPageSchema }),
    markAlertRead: (id) => send(http, { method: 'POST', path: `/alerts/${pathId(id)}/read`, response: alertSchema }),
    markAllAlertsRead: () => send(http, { method: 'POST', path: '/alerts/read-all', response: markAllAlertsReadResponseSchema }),
    getNotificationLog: () => send(http, { method: 'GET', path: '/dev/notifications', response: notificationLogSchema }),

    registerPushDevice: async (input) =>
      send(http, {
        method: 'POST',
        path: '/me/push-devices',
        body: validateInput(registerPushDeviceRequestSchema, input, 'body'),
        response: pushDeviceSchema,
      }),
    listPushDevices: async () => (await send(http, { method: 'GET', path: '/me/push-devices', response: pushDeviceListSchema })).items,
    unregisterPushDevice: (id) => send(http, { method: 'DELETE', path: `/me/push-devices/${pathId(id)}`, response: pushDeviceSchema }),
  };
}
