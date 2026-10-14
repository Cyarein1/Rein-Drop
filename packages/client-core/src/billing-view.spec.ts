import { describe, expect, it } from 'vitest';
import type { AccessResponse, Plan } from '@rein-drop/contracts';
import { billingStatusView, checkoutReturnView, planCards } from './billing-view.js';

type Source = AccessResponse['products']['source'];
const limits = { activeHunts: { limit: 1, used: 0, remaining: 1 }, savedHunts: { limit: 10, used: 0, remaining: 10 }, marketplaces: ['ebay'], monitoringPriority: 'NORMAL', hotHunts: { available: false, limit: 0 }, analyticsHistoryDays: 30, seats: 1 } as Source['limits'];
const src = (over: Partial<Source>): Source => ({ state: 'free', hasAccess: true, paid: false, plan: { code: 'free', name: 'Free', family: 'SOURCE' }, periodEndsAt: null, cancelsAtPeriodEnd: false, graceEndsAt: null, limits, ...over });
const ent = { activeHunts: { limit: 1 }, savedHunts: { limit: 10 }, marketplaces: ['ebay' as const], hotHunts: { available: false, limit: 0 }, monitoringPriority: 'NORMAL' as const, analyticsHistoryDays: 30, seats: 1 };
const plan = (code: string, pricing: Plan['pricing']): Plan => ({ code, name: code[0]!.toUpperCase() + code.slice(1), family: 'SOURCE', pricing, limitsFinal: false, entitlements: ent });
const PRICED = { status: 'priced', amount: { amountMinor: 19900, currency: 'ZAR' }, interval: 'month', intervalCount: 1 } as const;
const PLANS = [plan('free', { status: 'free' }), plan('pro', PRICED), plan('ultimate', { status: 'tbd' })];
const STRIPE = { mode: 'stripe' as const, canManage: true };
const PRO = { code: 'pro', name: 'Pro', family: 'SOURCE' as const };

describe('web billing view (decision 0018 - web only)', () => {
  it('status: renewal, scheduled cancellation, failed payment, grace, ended, suspended', () => {
    expect(billingStatusView(src({ state: 'active', paid: true, plan: PRO, periodEndsAt: '2026-11-14T10:00:00Z' }), 'en-US')).toMatchObject({ label: 'Active', lines: ['Renews on Nov 14, 2026.'] });
    expect(billingStatusView(src({ state: 'active', paid: true, plan: PRO, periodEndsAt: '2026-11-14T10:00:00Z', cancelsAtPeriodEnd: true }), 'en-US').lines[0]).toBe('Your Pro plan stays active until Nov 14, 2026, then you move to Free. Nothing is deleted.');
    expect(billingStatusView(src({ state: 'past_due', paid: true, plan: PRO }), 'en-US')).toMatchObject({ label: 'Payment retrying', paymentAttention: true });
    expect(billingStatusView(src({ state: 'grace_period', paid: true, plan: PRO, graceEndsAt: '2026-10-17T10:00:00Z' }), 'en-US').lines[0]).toMatch(/until Oct 17, 2026/);
    expect(billingStatusView(src({ state: 'expired' }), 'en-US').lines[0]).toMatch(/Hunts and data are kept/);
    expect(billingStatusView(src({ state: 'suspended', hasAccess: false }), 'en-US')).toMatchObject({ label: 'Suspended', tone: 'loss' });
  });

  it('plan actions on Free: subscribe to a priced plan; TBD plans unavailable', () => {
    expect(planCards(PLANS, src({}), STRIPE, 'en-ZA').map((c) => [c.plan.code, c.action.kind])).toEqual([
      ['free', 'current'],
      ['pro', 'subscribe'],
      ['ultimate', 'unavailable'],
    ]);
    expect(planCards(PLANS, src({}), STRIPE, 'en-ZA')[1]!.price).toMatch(/199,00 \/ month$/);
  });

  it('plan actions on a paid plan: change to another paid plan, cancel to reach Free', () => {
    const paid = src({ state: 'active', paid: true, plan: PRO });
    const withUltimate = [PLANS[0]!, PLANS[1]!, plan('ultimate', PRICED)];
    expect(planCards(withUltimate, paid, STRIPE, 'en').map((c) => c.action.kind)).toEqual(['downgrade_to_free', 'current', 'change']);
  });

  it('development billing and suspended accounts offer nothing to buy', () => {
    expect(planCards(PLANS, src({}), { mode: 'development', canManage: false }, 'en')[1]!.action).toMatchObject({ kind: 'unavailable' });
    expect(planCards(PLANS, src({ state: 'suspended', hasAccess: false, plan: null }), STRIPE, 'en').every((c) => c.action.kind === 'unavailable')).toBe(true);
  });

  it('checkout return: success only when the server confirms payment', () => {
    expect(checkoutReturnView('success', src({}))).toMatchObject({ tone: 'info', title: 'Confirming your payment' });
    expect(checkoutReturnView('success', src({ state: 'active', paid: true, plan: PRO }))).toMatchObject({ tone: 'success', title: 'You’re on Pro' });
    expect(checkoutReturnView('cancelled', src({}))).toMatchObject({ title: 'Checkout cancelled' });
    expect(checkoutReturnView(undefined, src({}))).toBeNull();
  });
});
