import { describe, expect, it } from 'vitest';
import type { Plan, PlanEntitlements } from '@rein-drop/contracts';
import { describeEntitlements, planGateOptions } from './index.js';

const ent = (overrides: Partial<PlanEntitlements> = {}): PlanEntitlements => ({
  activeHunts: { limit: 1 },
  marketplaces: ['ebay', 'facebook'],
  hotHunts: { available: false, limit: 0 },
  monitoringPriority: 'NORMAL',
  analyticsHistoryDays: 30,
  seats: 1,
  ...overrides,
});
const plan = (code: string, entitlements: PlanEntitlements, free = false): Plan => ({
  code,
  name: code,
  pricing: free ? { status: 'free' } : { status: 'tbd' },
  limitsFinal: false,
  entitlements,
});

const PLANS = [
  plan('free', ent(), true),
  plan('pro', ent({ activeHunts: { limit: 10 }, analyticsHistoryDays: null })),
  plan('ultimate', ent({ activeHunts: { limit: null }, seats: 3 })),
];
const hunt = { marketplaces: ['ebay' as const], location: null, priority: 'NORMAL' as const };

describe('describeEntitlements', () => {
  it('describes limits in plain words from server data', () => {
    expect(describeEntitlements(ent())).toEqual([
      '1 live Hunt',
      'eBay and Facebook Marketplace',
      'Hot Hunts: coming later',
      'Normal monitoring priority',
      '30 days of analytics history',
      '1 seat',
    ]);
    expect(describeEntitlements(ent({ activeHunts: { limit: null }, analyticsHistoryDays: null, seats: 3 }))).toContain(
      'Unlimited live Hunts',
    );
  });
});

describe('planGateOptions', () => {
  it('never shows a made-up price', () => {
    expect(planGateOptions(PLANS, hunt, 0, null).map((o) => o.priceLabel)).toEqual(['Free', 'Price TBD', 'Price TBD']);
  });

  it('recommends the first plan that can run the hunt', () => {
    expect(planGateOptions(PLANS, hunt, 0, null).find((o) => o.recommended)?.plan.code).toBe('free');
    const full = planGateOptions(PLANS, hunt, 1, 'free');
    expect(full.find((o) => o.recommended)?.plan.code).toBe('pro');
    expect(full[0]).toMatchObject({ canRunHunt: false, isCurrent: true });
    expect(full[0]!.reasons[0]!.code).toBe('ACTIVE_HUNT_LIMIT_REACHED');
  });

  it('recommends nothing when no plan can run the hunt', () => {
    const notReady = planGateOptions(PLANS, { ...hunt, marketplaces: ['facebook'] }, 0, null);
    expect(notReady.some((o) => o.recommended)).toBe(false);
    expect(notReady.every((o) => o.reasons.some((r) => r.code === 'NOT_READY'))).toBe(true);
  });
});
