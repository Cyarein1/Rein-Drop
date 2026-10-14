import { describe, expect, it } from 'vitest';
import { evaluateSubscription, type SubscriptionFacts } from './rules.js';

const NOW = new Date('2036-10-14T10:00:00Z');
const DAY = 24 * 60 * 60_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);
const sub = (over: Partial<SubscriptionFacts>): SubscriptionFacts => ({ status: 'ACTIVE', currentPeriodEnd: at(10), cancelAtPeriodEnd: false, canceledAt: null, updatedAt: at(-1), ...over });
const NO_GRACE = { graceDays: 0 };
const GRACE_3 = { graceDays: 3 };

describe('effective access of a subscription (decision 0018, ACCESS_RULES.md)', () => {
  it.each([
    ['active, period running', sub({}), true, 'active'],
    ['trialing', sub({ status: 'TRIALING' }), true, 'trialing'],
    ['past due while the provider retries (D36)', sub({ status: 'PAST_DUE' }), true, 'past_due'],
    ['active with no period end (Free / development)', sub({ currentPeriodEnd: null }), true, 'active'],
    ['scheduled cancellation, period still running - access kept until the end', sub({ cancelAtPeriodEnd: true }), true, 'active'],
    ['scheduled cancellation, period over - canceled, no grace even if configured', sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(-1) }), false, 'canceled'],
    ['canceled at the provider', sub({ status: 'CANCELED' }), false, 'canceled'],
    ['checkout never completed', sub({ status: 'INCOMPLETE' }), false, 'none'],
    ['paused at the provider', sub({ status: 'PAUSED' }), false, 'expired'],
    ['unpaid (retries exhausted), no grace', sub({ status: 'UNPAID' }), false, 'expired'],
    ['expired', sub({ status: 'EXPIRED', currentPeriodEnd: at(-2) }), false, 'expired'],
    ['active but the period ran out without renewal', sub({ currentPeriodEnd: at(-1) }), false, 'expired'],
  ] as const)('%s', (_name, facts, entitled, state) => {
    const result = evaluateSubscription(facts, NOW, NO_GRACE);
    expect(result).toMatchObject({ entitled, state });
  });

  it('grace period (when configured): continues access after an involuntary end, then expires', () => {
    // Unpaid recorded yesterday, 3 days of grace -> 2 days left.
    expect(evaluateSubscription(sub({ status: 'UNPAID', updatedAt: at(-1) }), NOW, GRACE_3)).toEqual({ entitled: true, state: 'grace_period', graceEndsAt: at(2) });
    expect(evaluateSubscription(sub({ status: 'UNPAID', updatedAt: at(-4) }), NOW, GRACE_3)).toMatchObject({ entitled: false, state: 'expired' });
    // Period ran out 2 days ago without renewal.
    expect(evaluateSubscription(sub({ currentPeriodEnd: at(-2) }), NOW, GRACE_3)).toMatchObject({ entitled: true, state: 'grace_period' });
    // Ended at the provider (deleted) without a scheduled cancellation.
    expect(evaluateSubscription(sub({ status: 'EXPIRED', currentPeriodEnd: at(-1) }), NOW, GRACE_3)).toMatchObject({ entitled: true, state: 'grace_period' });
  });

  it('no grace for the user’s own cancellation or for a canceled subscription', () => {
    expect(evaluateSubscription(sub({ status: 'EXPIRED', cancelAtPeriodEnd: true, currentPeriodEnd: at(-1) }), NOW, GRACE_3)).toMatchObject({ entitled: false, state: 'canceled' });
    expect(evaluateSubscription(sub({ status: 'CANCELED' }), NOW, GRACE_3)).toMatchObject({ entitled: false, state: 'canceled' });
  });

  it('the period boundary itself: access ends exactly at currentPeriodEnd', () => {
    expect(evaluateSubscription(sub({ currentPeriodEnd: NOW }), NOW, NO_GRACE).entitled).toBe(false);
    expect(evaluateSubscription(sub({ currentPeriodEnd: new Date(NOW.getTime() + 1) }), NOW, NO_GRACE).entitled).toBe(true);
  });
});
