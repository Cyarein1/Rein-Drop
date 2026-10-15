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
  devTestNotificationSchema,
  type DevTestNotification,
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
  billingInfoSchema,
  billingCheckoutRequestSchema,
  billingPortalRequestSchema,
  billingRedirectSchema,
  chooseFreePlanResponseSchema,
  type BillingInfo,
  type BillingPortalRequestInput,
  entitlementEvaluationSchema,
  planListSchema,
  updateUserLocaleRequestSchema,
  userLocaleResponseSchema,
  capabilitiesResponseSchema,
  accessResponseSchema,
  subscriptionSummarySchema,
  type AccessResponse,
  capabilityMap,
  type Capability,
  type FeatureKey,
  type Platform,
  geoConfigSchema,
  geoSuggestQuerySchema,
  geoSuggestResponseSchema,
  updateUserAreaRequestSchema,
  userAreaResponseSchema,
  type GeoConfig,
  type GeoPlace,
  type UpdateUserAreaRequestInput,
  type UserArea,
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
  inventoryItemSchema,
  inventoryPageSchema,
  listInventoryQuerySchema,
  recordSaleRequestSchema,
  replacePurchaseCostsRequestSchema,
  updateInventoryItemRequestSchema,
  type InventoryItem,
  type ListInventoryQueryInput,
  type RecordSaleRequestInput,
  type ReplacePurchaseCostsRequest,
  type UpdateInventoryItemRequest,
  analyticsOverviewSchema,
  analyticsQuerySchema,
  huntAnalyticsSchema,
  marketplaceAnalyticsSchema,
  missedPotentialSchema,
  productAnalyticsSchema,
  type AnalyticsOverview,
  type AnalyticsQueryInput,
  type HuntAnalytics,
  type MarketplaceAnalytics,
  type MissedPotential,
  type ProductAnalytics,
  sourceHealthListSchema,
  type SourceHealthList,
  ingestionDiagnosticsQuerySchema,
  ingestionDiagnosticsSchema,
  type IngestionDiagnostics,
  type IngestionDiagnosticsQueryInput,
  clientProductEventRequestSchema,
  type ClientProductEventRequest,
  joinWaitlistRequestSchema,
  joinWaitlistResponseSchema,
  type JoinWaitlistRequestInput,
  type JoinWaitlistResponse,
  sellMarketplacesResponseSchema,
  sellListingSchema,
  sellListingListSchema,
  sellDraftSuggestionSchema,
  updateSellListingRequestSchema,
  sellDraftRequestSchema,
  addSourcePhotoRequestSchema,
  reorderPhotosRequestSchema,
  publishSellListingRequestSchema,
  confirmSellChannelRequestSchema,
  type SellMarketplacesResponse,
  type SellListing,
  type SellListingStatus,
  type SellDraftSuggestion,
  type SellDraftRequest,
  type UpdateSellListingRequest,
  type MarketplaceKey,
} from '@rein-drop/contracts';
import { z } from 'zod';
import { normalizeBaseUrl, pathId, send, validateInput, type HttpOptions } from './http.js';

export { ApiError } from './errors.js';
export type * from '@rein-drop/contracts';
export {
  AUTH_PROVIDER_IDS,
  DEV_AUTH_HEADER,
  DEV_AUTH_SUBJECT,
  DIAGNOSTICS_MAX_HOURS,
  billingReturnPathSchema,
  ENTRA_DEFAULT_SCOPE_NAME,
  entraApiScope,
  LISTING_CONDITIONS,
  SELL_DESCRIPTION_MAX,
  SELL_PHOTO_BYTES_MAX,
  SELL_PHOTO_TYPES,
  SELL_PHOTOS_MAX,
  SELL_TITLE_MAX,
  entraDiscoveryUrl,
  capabilitiesFor,
  capability,
  detectedLocaleRequest,
  FEATURES,
  GEO_QUERY_MIN_LENGTH,
  MOBILE_TABS,
  mobileTabs,
  kmToUnit,
  PURCHASE_COST_CATEGORIES,
  realizedResult,
  SALE_COST_CATEGORIES,
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
  /** Features available to this user on this platform (decision 0018) - complete map, missing = unavailable. */
  getCapabilities(platform: Platform): Promise<Record<FeatureKey, Capability>>;
  /** What place / map features are available (decision 0017). */
  getGeoConfig(): Promise<GeoConfig>;
  /** Places matching what's been typed (user's country first). */
  suggestPlaces(query: string, limit?: number): Promise<GeoPlace[]>;
  /** "Your area" on the profile (null until set). */
  getMyArea(): Promise<UserArea | null>;
  setMyArea(input: UpdateUserAreaRequestInput): Promise<UserArea | null>;
  clearMyArea(): Promise<void>;
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

  /** Plans for the plan gate (paid prices come from Stripe; limits are placeholders while `limitsFinal` is false). */
  listPlans(): Promise<Plan[]>;
  /** The caller's plan, entitlements, usage and remaining allowance. */
  getEntitlements(): Promise<EntitlementEvaluation>;
  /** How plans are bought here (stripe | development) and whether there is billing to manage. */
  getBillingInfo(): Promise<BillingInfo>;
  /** Re-check the subscription with the provider now (server to server) - e.g. after checkout returns. */
  syncBilling(): Promise<SubscriptionSummary | null>;
  /** Effective access per product (Source / Sell), states and usage (decision 0018). */
  getAccess(): Promise<AccessResponse>;
  /** Hosted Stripe Checkout URL for a paid plan. Nothing changes until Stripe confirms payment. */
  startCheckout(planCode: string, returnPath: string): Promise<string>;
  /** Hosted billing portal URL (payment method, invoices, change plan, cancel). */
  openBillingPortal(request: BillingPortalRequestInput): Promise<string>;
  /** Choose the Free plan - no card, no charge. */
  chooseFreePlan(): Promise<SubscriptionSummary>;
  /** DEVELOPMENT ONLY: fake billing confirmation for a plan (no payment). 404 in production. */
  confirmDevBilling(planCode: string): Promise<SubscriptionSummary>;

  /**
   * Reports a product event only the app can see (today: the plan gate was shown). Everything else
   * is recorded by the server. Callers should treat it as best effort and ignore failures.
   */
  trackEvent(event: ClientProductEventRequest): Promise<void>;

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
  /** DEVELOPMENT ONLY: send yourself a test push that opens your latest deal (404 in production). */
  sendTestNotification(): Promise<DevTestNotification>;

  /** Register (or refresh) this phone for push. Same token = same device. */
  registerPushDevice(input: RegisterPushDeviceRequest): Promise<PushDevice>;
  listPushDevices(): Promise<PushDevice[]>;
  /** Stop push to this phone. */
  unregisterPushDevice(id: string): Promise<PushDevice>;

  /** Inventory: holding (default), sold or all; newest purchase first. */
  listInventory(query?: ListInventoryQueryInput): Promise<Page<InventoryItem>>;
  getInventoryItem(id: string): Promise<InventoryItem>;
  /** Correct the purchase, or move between In stock and Listed. */
  updateInventoryItem(id: string, input: UpdateInventoryItemRequest): Promise<InventoryItem>;
  /** Replaces the purchase costs (tax, shipping to you, repair, supplies, other). */
  replacePurchaseCosts(id: string, input: ReplacePurchaseCostsRequest): Promise<InventoryItem>;
  /** Mark Sold, or correct the sale. The result is the realized P/L. */
  recordSale(id: string, input: RecordSaleRequestInput): Promise<InventoryItem>;
  /** Undo the sale: the item is held again. */
  undoSale(id: string): Promise<InventoryItem>;

  /** Sell (decision 0019): marketplaces you can list on, and whether uploads / AI drafts are available. */
  getSellMarketplaces(): Promise<SellMarketplacesResponse>;
  listSellListings(status?: SellListingStatus): Promise<SellListing[]>;
  /** "List" on an inventory item: its sell listing, created on first use. */
  startSellListing(inventoryItemId: string): Promise<SellListing>;
  getSellListing(id: string): Promise<SellListing>;
  updateSellListing(id: string, input: UpdateSellListingRequest): Promise<SellListing>;
  /** AI suggestion from the item's facts - not saved; apply it to the form, then save. */
  draftSellListing(id: string, input?: SellDraftRequest): Promise<SellDraftSuggestion>;
  /**
   * Upload one photo (multipart field "photo"). ile: a Blob / File on the web, or
   * { uri, name, type } on React Native.
   */
  uploadSellPhoto(id: string, file: Blob | { uri: string; name: string; type: string }, fileName?: string): Promise<SellListing>;
  addSourcePhoto(id: string, url: string): Promise<SellListing>;
  /** Every photo id in the new order; the first is the cover. */
  reorderSellPhotos(id: string, photoIds: string[]): Promise<SellListing>;
  removeSellPhoto(id: string, photoId: string): Promise<SellListing>;
  publishSellListing(id: string, marketplaces: MarketplaceKey[]): Promise<SellListing>;
  confirmSellChannel(id: string, marketplace: MarketplaceKey, url?: string): Promise<SellListing>;
  endSellChannel(id: string, marketplace: MarketplaceKey): Promise<SellListing>;
  /** Period analytics (default: last 30 days). Realized results only; estimates are labelled. */
  getAnalyticsOverview(query?: AnalyticsQueryInput): Promise<AnalyticsOverview>;
  getHuntAnalytics(query?: AnalyticsQueryInput): Promise<HuntAnalytics>;
  getProductAnalytics(query?: AnalyticsQueryInput): Promise<ProductAnalytics>;
  getMarketplaceAnalytics(query?: AnalyticsQueryInput): Promise<MarketplaceAnalytics>;
  /** Strong deals never bought - potential, never a loss. */
  getMissedPotential(query?: AnalyticsQueryInput): Promise<MissedPotential>;

  /** Marketplace sources' health (healthy / degraded / down / not configured / unknown). */
  getSourceHealth(): Promise<SourceHealthList>;

  /** DEVELOPMENT ONLY (404 in production): ingestion economics and freshness across every user's Hunts. */
  getIngestionDiagnostics(query?: IngestionDiagnosticsQueryInput): Promise<IngestionDiagnostics>;

  /**
   * Public early-access sign-up (no auth). Same `{ status: 'received' }` for a new or repeat address.
   * Server-side callers only (the web's /api/waitlist route), never from a browser bundle.
   */
  joinWaitlist(input: JoinWaitlistRequestInput): Promise<JoinWaitlistResponse>;
}

function analytics<T>(http: HttpOptions, view: string, query: AnalyticsQueryInput, response: z.ZodType<T>): Promise<T> {
  return send(http, { method: 'GET', path: `/analytics/${view}`, query: validateInput(analyticsQuerySchema, query, 'query'), response });
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
    getCapabilities: async (platform) =>
      capabilityMap(await send(http, { method: 'GET', path: '/me/capabilities', query: { platform }, response: capabilitiesResponseSchema })),
    getGeoConfig: () => send(http, { method: 'GET', path: '/geo/config', response: geoConfigSchema }),
    suggestPlaces: async (q, limit) =>
      (
        await send(http, {
          method: 'GET',
          path: '/geo/suggest',
          query: validateInput(geoSuggestQuerySchema, { q, ...(limit ? { limit } : {}) }, 'query'),
          response: geoSuggestResponseSchema,
        })
      ).places,
    getMyArea: async () => (await send(http, { method: 'GET', path: '/me/area', response: userAreaResponseSchema })).area,
    setMyArea: async (input) =>
      (
        await send(http, {
          method: 'PUT',
          path: '/me/area',
          body: validateInput(updateUserAreaRequestSchema, input, 'body'),
          response: userAreaResponseSchema,
        })
      ).area,
    clearMyArea: async () => {
      await send(http, { method: 'DELETE', path: '/me/area', response: userAreaResponseSchema });
    },
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
    getBillingInfo: () => send(http, { method: 'GET', path: '/billing', response: billingInfoSchema }),
    syncBilling: async () =>
      (await send(http, { method: 'POST', path: '/billing/sync', response: z.object({ subscription: subscriptionSummarySchema.nullable() }) })).subscription,
    getAccess: () => send(http, { method: 'GET', path: '/me/access', response: accessResponseSchema }),
    startCheckout: async (planCode, returnPath) =>
      (
        await send(http, {
          method: 'POST',
          path: '/billing/checkout',
          body: validateInput(billingCheckoutRequestSchema, { planCode, returnPath }, 'body'),
          response: billingRedirectSchema,
        })
      ).url,
    openBillingPortal: async (request) =>
      (await send(http, { method: 'POST', path: '/billing/portal', body: validateInput(billingPortalRequestSchema, request, 'body'), response: billingRedirectSchema })).url,
    chooseFreePlan: async () => (await send(http, { method: 'POST', path: '/billing/free', response: chooseFreePlanResponseSchema })).subscription,
    trackEvent: async (event) =>
      await send(http, { method: 'POST', path: '/telemetry/events', body: validateInput(clientProductEventRequestSchema, event, 'body'), response: z.undefined() }),
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
    sendTestNotification: () => send(http, { method: 'POST', path: '/dev/notifications/test', body: {}, response: devTestNotificationSchema }),

    registerPushDevice: async (input) =>
      send(http, {
        method: 'POST',
        path: '/me/push-devices',
        body: validateInput(registerPushDeviceRequestSchema, input, 'body'),
        response: pushDeviceSchema,
      }),
    listPushDevices: async () => (await send(http, { method: 'GET', path: '/me/push-devices', response: pushDeviceListSchema })).items,
    unregisterPushDevice: (id) => send(http, { method: 'DELETE', path: `/me/push-devices/${pathId(id)}`, response: pushDeviceSchema }),

    listInventory: async (query = {}) =>
      send(http, {
        method: 'GET',
        path: '/inventory',
        query: validateInput(listInventoryQuerySchema, query, 'query'),
        response: inventoryPageSchema,
      }),
    getInventoryItem: (id) => send(http, { method: 'GET', path: `/inventory/${pathId(id)}`, response: inventoryItemSchema }),
    updateInventoryItem: async (id, input) =>
      send(http, {
        method: 'PATCH',
        path: `/inventory/${pathId(id)}`,
        body: validateInput(updateInventoryItemRequestSchema, input, 'body'),
        response: inventoryItemSchema,
      }),
    replacePurchaseCosts: async (id, input) =>
      send(http, {
        method: 'PUT',
        path: `/inventory/${pathId(id)}/purchase-costs`,
        body: validateInput(replacePurchaseCostsRequestSchema, input, 'body'),
        response: inventoryItemSchema,
      }),
    recordSale: async (id, input) =>
      send(http, {
        method: 'PUT',
        path: `/inventory/${pathId(id)}/sale`,
        body: validateInput(recordSaleRequestSchema, input, 'body'),
        response: inventoryItemSchema,
      }),
    undoSale: (id) => send(http, { method: 'DELETE', path: `/inventory/${pathId(id)}/sale`, response: inventoryItemSchema }),

    getSellMarketplaces: () => send(http, { method: 'GET', path: '/sell/marketplaces', response: sellMarketplacesResponseSchema }),
    listSellListings: async (status) => (await send(http, { method: 'GET', path: '/sell/listings', query: { status }, response: sellListingListSchema })).items,
    startSellListing: (inventoryItemId) => send(http, { method: 'POST', path: '/sell/listings', body: { inventoryItemId }, response: sellListingSchema }),
    getSellListing: (id) => send(http, { method: 'GET', path: `/sell/listings/${pathId(id)}`, response: sellListingSchema }),
    updateSellListing: async (id, input) =>
      send(http, { method: 'PATCH', path: `/sell/listings/${pathId(id)}`, body: validateInput(updateSellListingRequestSchema, input, 'body'), response: sellListingSchema }),
    draftSellListing: async (id, input = {}) =>
      send(http, { method: 'POST', path: `/sell/listings/${pathId(id)}/draft`, body: validateInput(sellDraftRequestSchema, input, 'body'), response: sellDraftSuggestionSchema, timeoutMs: 60_000 }),
    uploadSellPhoto: (id, file, fileName = 'photo.jpg') => {
      const form = new FormData();
      // React Native's FormData takes { uri, name, type }; the web's takes a Blob and a file name.
      if (typeof Blob !== 'undefined' && file instanceof Blob) form.append('photo', file, fileName);
      else form.append('photo', file as unknown as Blob);
      return send(http, { method: 'POST', path: `/sell/listings/${pathId(id)}/photos`, formData: form, response: sellListingSchema, timeoutMs: 60_000 });
    },
    addSourcePhoto: async (id, url) =>
      send(http, { method: 'POST', path: `/sell/listings/${pathId(id)}/photos/source`, body: validateInput(addSourcePhotoRequestSchema, { url }, 'body'), response: sellListingSchema }),
    reorderSellPhotos: async (id, photoIds) =>
      send(http, { method: 'PUT', path: `/sell/listings/${pathId(id)}/photos/order`, body: validateInput(reorderPhotosRequestSchema, { photoIds }, 'body'), response: sellListingSchema }),
    removeSellPhoto: (id, photoId) => send(http, { method: 'DELETE', path: `/sell/listings/${pathId(id)}/photos/${pathId(photoId)}`, response: sellListingSchema }),
    publishSellListing: async (id, marketplaces) =>
      send(http, { method: 'POST', path: `/sell/listings/${pathId(id)}/publish`, body: validateInput(publishSellListingRequestSchema, { marketplaces }, 'body'), response: sellListingSchema }),
    confirmSellChannel: async (id, marketplace, url) =>
      send(http, { method: 'POST', path: `/sell/listings/${pathId(id)}/channels/${marketplace}/confirm`, body: validateInput(confirmSellChannelRequestSchema, url ? { url } : {}, 'body'), response: sellListingSchema }),
    endSellChannel: (id, marketplace) => send(http, { method: 'POST', path: `/sell/listings/${pathId(id)}/channels/${marketplace}/end`, body: {}, response: sellListingSchema }),
    getAnalyticsOverview: async (query = {}) => analytics(http, 'overview', query, analyticsOverviewSchema),
    getHuntAnalytics: async (query = {}) => analytics(http, 'hunts', query, huntAnalyticsSchema),
    getProductAnalytics: async (query = {}) => analytics(http, 'products', query, productAnalyticsSchema),
    getMarketplaceAnalytics: async (query = {}) => analytics(http, 'marketplaces', query, marketplaceAnalyticsSchema),
    getMissedPotential: async (query = {}) => analytics(http, 'missed', query, missedPotentialSchema),

    getSourceHealth: () => send(http, { method: 'GET', path: '/marketplaces/health', response: sourceHealthListSchema }),
    getIngestionDiagnostics: async (query = {}) =>
      send(http, {
        method: 'GET',
        path: '/dev/diagnostics/ingestion',
        query: validateInput(ingestionDiagnosticsQuerySchema, query, 'query'),
        response: ingestionDiagnosticsSchema,
      }),

    joinWaitlist: async (input) =>
      send(http, {
        method: 'POST',
        path: '/waitlist',
        body: validateInput(joinWaitlistRequestSchema, input, 'body'),
        response: joinWaitlistResponseSchema,
      }),
  };
}
