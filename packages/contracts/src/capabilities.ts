import { z } from 'zod';
import type { PlanEntitlements } from './plans.js';

/**
 * Platform capabilities - the ONE place that says which feature exists on which platform
 * (decision 0018: web is the complete platform; the iOS / Android apps are focused companions).
 *
 * A feature is available on a platform only when all of these hold:
 * 1. It is built (`status !== 'unbuilt'`) - unfinished work (e.g. Sell) is never shown, not even
 *    as a placeholder.
 * 2. The platform is listed for it.
 * 3. Its rollout flag (if any) is on - flags are server-driven (API env FEATURE_FLAGS).
 * 4. The user's plan entitles it (if it needs an entitlement).
 * 5. It isn't development-only, or this is a development environment.
 *
 * Clients ask the API (`GET /me/capabilities`), which evaluates this with the real flags and
 * entitlements; the same pure function runs in tests and as the clients' offline default (all
 * flags off).
 */

export const PLATFORMS = ['web', 'mobile'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Rollout flags (off unless listed in the API's FEATURE_FLAGS). */
export const FEATURE_FLAGS = ['sell.workspace', 'inventory.photos', 'inventory.bulk', 'hunts.hot'] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export type FeatureStatus = 'live' | 'flagged' | 'unbuilt';

export interface FeatureDefinition {
  label: string;
  /** Platforms the feature belongs on (product boundary, decision 0018). */
  platforms: readonly Platform[];
  status: FeatureStatus;
  /** Rollout flag for `flagged` features. */
  flag?: FeatureFlag;
  /** Plan entitlement the feature needs, if any. */
  entitled?: (e: PlanEntitlements) => boolean;
  /** Only in development environments (internal tools). */
  developmentOnly?: boolean;
  /** Why it is where it is (the matrix in docs). */
  note: string;
}

const BOTH = ['web', 'mobile'] as const;
const WEB = ['web'] as const;
const MOBILE = ['mobile'] as const;

export const FEATURES = {
  // ---- Shared core (web + mobile) ----
  'deals': { label: 'Deals feed and deal evaluation', platforms: BOTH, status: 'live', note: 'Full economics on both (price, costs, estimated upside, confidence, risks, open listing).' },
  'deals.actions': { label: 'Save, ignore, mark bought', platforms: BOTH, status: 'live', note: 'Quick decisions away from the desk.' },
  'alerts.inbox': { label: 'Alerts inbox', platforms: BOTH, status: 'live', note: 'Mobile: inside Deals.' },
  'hunts.manage': { label: 'Hunts: view, pause, resume, archive, restore', platforms: BOTH, status: 'live', note: 'Basic controls on mobile.' },
  'hunts.create': { label: 'Create / edit a Hunt (location, map, price)', platforms: BOTH, status: 'live', note: 'Mobile: inside Hunts.' },
  'hunts.activate': { label: 'Start watching within current access', platforms: BOTH, status: 'live', note: 'Mobile never sells (no plan picker).' },
  'inventory': { label: 'Inventory: bought items, mark listed / sold, sale result', platforms: BOTH, status: 'live', note: 'Source purchase tracking (not the Sell workspace).' },
  'account.access': { label: 'Current access (plan, Hunts in use)', platforms: BOTH, status: 'live', note: 'Mobile: neutral, read-only.' },
  'account.notifications': { label: 'Notification preferences', platforms: BOTH, status: 'live', note: '' },
  'account.area': { label: '"Your area" (default Hunt location)', platforms: BOTH, status: 'live', note: '' },
  'account.sellerSnapshot': { label: 'Seller Snapshot (onboarding answers)', platforms: BOTH, status: 'live', note: 'Onboarding must work wherever a new user signs in.' },
  'account.signOut': { label: 'Sign out', platforms: BOTH, status: 'live', note: '' },
  // ---- Mobile only ----
  'push': { label: 'Push notifications on this device', platforms: MOBILE, status: 'live', note: 'Web uses the inbox (and email once a provider exists).' },
  // ---- Web only (the complete platform) ----
  'home.dashboard': { label: 'Home dashboard (attention, monitoring, profit, recommendation)', platforms: WEB, status: 'live', note: 'Mobile starts on Deals instead.' },
  'analytics': { label: 'Analytics and reporting (overview, Hunt funnel, products, missed potential)', platforms: WEB, status: 'live', note: 'Complex dashboards stay on the web.' },
  'billing.checkout': { label: 'Subscription checkout and plan choice', platforms: WEB, status: 'live', note: 'Web-only billing (decision 0018).' },
  'billing.manage': { label: 'Billing management, plan changes, cancellation', platforms: WEB, status: 'live', note: 'Stripe portal, web only.' },
  'inventory.bulk': { label: 'Bulk inventory management', platforms: WEB, status: 'unbuilt', flag: 'inventory.bulk', note: 'Not built - hidden.' },
  // ---- Not built / rollout-dependent ----
  'sell.workspace': { label: 'Sell: list bought items, AI drafts, cross-listing', platforms: BOTH, status: 'live', note: 'Decision 0019: open to every account during beta (no plan gate yet). eBay publishing is a mock (TODO(sell)); Facebook is assisted.' },
  'inventory.photos': { label: 'Listing photos (camera / library / upload, plus the source listing photos)', platforms: BOTH, status: 'live', note: 'Decision 0019: with Sell. Stored on local disk in development; Azure Blob is TODO(media).' },
  'hunts.hot': { label: 'Hot Hunts (priority monitoring)', platforms: BOTH, status: 'flagged', flag: 'hunts.hot', entitled: (e) => e.hotHunts.available, note: 'Needs the flag AND a plan that includes it (backlog B-02).' },
  // ---- Internal ----
  'dev.tools': { label: 'Developer tools (API status, UI gallery)', platforms: BOTH, status: 'live', developmentOnly: true, note: 'Never in production / release builds.' },
} as const satisfies Record<string, FeatureDefinition>;

export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export const CAPABILITY_REASONS = ['not_built', 'not_on_platform', 'flag_off', 'not_entitled', 'development_only'] as const;
export type CapabilityReason = (typeof CAPABILITY_REASONS)[number];

export interface CapabilityContext {
  platform: Platform;
  /** Rollout flags that are on. */
  flags: ReadonlySet<string> | readonly string[];
  /** The user's plan entitlements; null = unknown (entitlement-gated features are off). */
  entitlements: PlanEntitlements | null;
  environment: 'development' | 'production';
}

export type Capability = { available: true; reason: null } | { available: false; reason: CapabilityReason };

/** Is `feature` available in this context, and if not, the first reason why. */
export function capability(feature: FeatureKey, ctx: CapabilityContext): Capability {
  const def: FeatureDefinition = FEATURES[feature];
  const flags = new Set(ctx.flags);
  if (def.status === 'unbuilt') return { available: false, reason: 'not_built' };
  if (!def.platforms.includes(ctx.platform)) return { available: false, reason: 'not_on_platform' };
  if (def.developmentOnly && ctx.environment !== 'development') return { available: false, reason: 'development_only' };
  if (def.flag && !flags.has(def.flag)) return { available: false, reason: 'flag_off' };
  if (def.entitled && !(ctx.entitlements && def.entitled(ctx.entitlements))) return { available: false, reason: 'not_entitled' };
  return { available: true, reason: null };
}

/** Every feature for one context. */
export function capabilitiesFor(ctx: CapabilityContext): Record<FeatureKey, Capability> {
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, capability(key, ctx)])) as Record<FeatureKey, Capability>;
}

/**
 * Mobile companion navigation (owner decisions, decision 0018), in order; a tab shows when its
 * feature is available. ction = not a destination: the central "+" opens Create Hunt on top of
 * the current tab (restored by the owner in step 83).
 */
export const MOBILE_TABS = [
  { name: 'deals', title: 'Deals', feature: 'deals', action: false },
  { name: 'hunts', title: 'Hunts', feature: 'hunts.manage', action: false },
  { name: 'create', title: 'Create', feature: 'hunts.create', action: true },
  { name: 'inventory', title: 'Inventory', feature: 'inventory', action: false },
  { name: 'account', title: 'Account', feature: 'account.access', action: false },
] as const satisfies readonly { name: string; title: string; feature: FeatureKey; action: boolean }[];

export function mobileTabs(caps: Record<FeatureKey, Capability>): (typeof MOBILE_TABS)[number][] {
  return MOBILE_TABS.filter((tab) => caps[tab.feature].available);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const platformSchema = z.enum(PLATFORMS);

/** `GET /me/capabilities?platform=web|mobile`. */
export const capabilitiesQuerySchema = z.object({ platform: platformSchema });
export type CapabilitiesQuery = z.infer<typeof capabilitiesQuerySchema>;

const capabilitySchema = z.union([
  z.object({ available: z.literal(true), reason: z.null() }),
  z.object({ available: z.literal(false), reason: z.enum(CAPABILITY_REASONS) }),
]);

export const capabilitiesResponseSchema = z.object({
  platform: platformSchema,
  /** Feature key -> availability. Unknown keys (from a newer API) are ignored by clients. */
  features: z.record(z.string(), capabilitySchema),
});
export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;

/** A response -> a complete map; features the response doesn't mention count as unavailable. */
export function capabilityMap(response: CapabilitiesResponse): Record<FeatureKey, Capability> {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, (response.features[key] as Capability | undefined) ?? { available: false, reason: 'not_on_platform' }]),
  ) as Record<FeatureKey, Capability>;
}
