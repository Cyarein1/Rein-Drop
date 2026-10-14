import { describe, expect, it } from 'vitest';
import { currentSubscriptionWhere, ENTITLED_STATUSES } from './index.js';

// Behaviour against a real database (every subscription state, the sweep, the scheduler) is in
// apps/worker/test/access.int-spec.ts; these pin the pure rules.
describe('access rules (decision 0018)', () => {
  it('only active, trialing and past-due (while the provider retries) grant a plan', () => {
    expect(ENTITLED_STATUSES).toEqual(['ACTIVE', 'TRIALING', 'PAST_DUE']);
    for (const status of ['UNPAID', 'CANCELED', 'EXPIRED', 'INCOMPLETE', 'PAUSED']) expect(ENTITLED_STATUSES).not.toContain(status);
  });

  it('a current subscription has an entitled status, a period not yet over and an active plan', () => {
    const now = new Date('2036-10-14T10:00:00Z');
    expect(currentSubscriptionWhere('u1', now)).toEqual({
      userId: 'u1',
      status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
      plan: { isActive: true },
    });
  });
});
