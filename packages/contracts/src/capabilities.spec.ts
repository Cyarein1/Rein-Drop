import { describe, expect, it } from 'vitest';
import {
  capabilitiesFor,
  capability,
  capabilityMap,
  FEATURE_KEYS,
  FEATURES,
  MOBILE_TABS,
  mobileTabs,
  type CapabilityContext,
  type FeatureKey,
} from './capabilities.js';
import type { PlanEntitlements } from './plans.js';

const ENT = (hot: boolean): PlanEntitlements =>
  ({ activeHunts: { limit: 1 }, marketplaces: ['ebay', 'facebook'], hotHunts: { available: hot, limit: hot ? 1 : 0 }, monitoringPriority: 'NORMAL', analyticsHistoryDays: 30, seats: 1 }) as PlanEntitlements;
const ctx = (platform: 'web' | 'mobile', over: Partial<CapabilityContext> = {}): CapabilityContext => ({ platform, flags: [], entitlements: ENT(false), environment: 'production', ...over });
const available = (c: CapabilityContext) => FEATURE_KEYS.filter((k) => capability(k, c).available).sort();

describe('platform capabilities (decision 0018)', () => {
  it('web is the complete platform: every built web feature is available, including analytics and billing', () => {
    expect(available(ctx('web'))).toEqual(
      ['account.access', 'account.area', 'account.notifications', 'account.sellerSnapshot', 'account.signOut', 'alerts.inbox', 'analytics', 'billing.checkout', 'billing.manage', 'deals', 'deals.actions', 'home.dashboard', 'hunts.activate', 'hunts.create', 'hunts.manage', 'inventory', 'inventory.photos', 'sell.workspace'].sort(),
    );
  });

  it('mobile is the focused companion: deals, Hunts, inventory, account and push - no analytics, dashboard or billing', () => {
    expect(available(ctx('mobile'))).toEqual(
      ['account.access', 'account.area', 'account.notifications', 'account.sellerSnapshot', 'account.signOut', 'alerts.inbox', 'deals', 'deals.actions', 'hunts.activate', 'hunts.create', 'hunts.manage', 'inventory', 'inventory.photos', 'push', 'sell.workspace'].sort(),
    );
    for (const webOnly of ['analytics', 'home.dashboard', 'billing.checkout', 'billing.manage'] as const) {
      expect(capability(webOnly, ctx('mobile'))).toEqual({ available: false, reason: 'not_on_platform' });
    }
  });

  it('Sell (listing, AI drafts, cross-listing, photos) is open to every account on web and mobile during beta - decision 0019', () => {
    for (const platform of ['web', 'mobile'] as const) {
      expect(capability('sell.workspace', ctx(platform, { entitlements: null }))).toEqual({ available: true, reason: null });
      expect(capability('inventory.photos', ctx(platform))).toEqual({ available: true, reason: null });
    }
  });

  it('unfinished features are never available - not even with their flag on, on any platform, in development', () => {
    const everything = { flags: ['sell.workspace', 'inventory.photos', 'inventory.bulk', 'hunts.hot'], environment: 'development' as const, entitlements: ENT(true) };
    for (const feature of ['inventory.bulk'] as const) {
      for (const platform of ['web', 'mobile'] as const) expect(capability(feature, ctx(platform, everything))).toEqual({ available: false, reason: 'not_built' });
    }
  });

  it('flagged features need the flag AND the entitlement', () => {
    expect(capability('hunts.hot', ctx('web'))).toEqual({ available: false, reason: 'flag_off' });
    expect(capability('hunts.hot', ctx('web', { flags: ['hunts.hot'] }))).toEqual({ available: false, reason: 'not_entitled' });
    expect(capability('hunts.hot', ctx('web', { flags: ['hunts.hot'], entitlements: null }))).toEqual({ available: false, reason: 'not_entitled' });
    expect(capability('hunts.hot', ctx('mobile', { flags: new Set(['hunts.hot']), entitlements: ENT(true) }))).toEqual({ available: true, reason: null });
  });

  it('developer tools only in development', () => {
    expect(capability('dev.tools', ctx('mobile'))).toEqual({ available: false, reason: 'development_only' });
    expect(capability('dev.tools', ctx('mobile', { environment: 'development' })).available).toBe(true);
    expect(capability('dev.tools', ctx('web', { environment: 'development' })).available).toBe(true);
  });

  it('mobile tabs: Deals, Hunts, central Create, Inventory, Account - in that order', () => {
    expect(mobileTabs(capabilitiesFor(ctx('mobile'))).map((t) => t.title)).toEqual(['Deals', 'Hunts', 'Create', 'Inventory', 'Account']);
    expect(MOBILE_TABS.filter((t) => t.action).map((t) => t.name)).toEqual(['create']);
    expect(MOBILE_TABS.every((t) => (FEATURES[t.feature].platforms as readonly string[]).includes('mobile'))).toBe(true);
  });

  it('a response missing a feature (older API) treats it as unavailable; extra keys are ignored', () => {
    const map = capabilityMap({ platform: 'mobile', features: { deals: { available: true, reason: null }, 'future.thing': { available: true, reason: null } } });
    expect(map.deals.available).toBe(true);
    expect(map.inventory).toEqual({ available: false, reason: 'not_on_platform' });
    expect(Object.keys(map)).toHaveLength(FEATURE_KEYS.length);
  });

  it('every feature is described (the documented matrix stays complete)', () => {
    for (const key of FEATURE_KEYS) {
      const def = FEATURES[key as FeatureKey];
      expect(def.label.length).toBeGreaterThan(3);
      expect(def.platforms.length).toBeGreaterThan(0);
      if (def.status !== 'live') expect('flag' in def).toBe(true);
    }
  });
});
