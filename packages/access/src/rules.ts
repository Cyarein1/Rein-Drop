import type { SubscriptionStatus } from '@rein-drop/db';

/**
 * Effective access of ONE subscription at a moment - the pure rules (decision 0018,
 * docs/strategy/ACCESS_RULES.md). No I/O, so every state is unit-tested.
 */

export type AccessState = 'free' | 'active' | 'trialing' | 'past_due' | 'grace_period' | 'canceled' | 'expired' | 'suspended' | 'none';

export interface AccessPolicy {
  /**
   * Days of continued access after paid access ends for a reason other than the user's own
   * cancellation (payment retries exhausted, period over without renewal, ended at the provider).
   * 0 = no grace (default until the owner sets a billing policy).
   */
  graceDays: number;
}

export const DEFAULT_ACCESS_POLICY: AccessPolicy = { graceDays: 0 };

export interface SubscriptionFacts {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  /** Last change of the row - when a status like UNPAID was recorded. */
  updatedAt: Date;
}

export interface SubscriptionAccess {
  /** The plan's entitlements apply right now. */
  entitled: boolean;
  state: AccessState;
  graceEndsAt: Date | null;
}

const DAY = 24 * 60 * 60_000;

export function evaluateSubscription(sub: SubscriptionFacts, now: Date, policy: AccessPolicy = DEFAULT_ACCESS_POLICY): SubscriptionAccess {
  const periodOver = sub.currentPeriodEnd !== null && sub.currentPeriodEnd.getTime() <= now.getTime();

  switch (sub.status) {
    case 'INCOMPLETE':
      // Checkout never completed: never had access.
      return { entitled: false, state: 'none', graceEndsAt: null };
    case 'CANCELED':
      // Ended by cancellation (Stripe "canceled"). A *scheduled* cancellation is still ACTIVE with
      // cancelAtPeriodEnd until the period ends - see below.
      return { entitled: false, state: 'canceled', graceEndsAt: null };
    case 'PAUSED':
      return { entitled: false, state: 'expired', graceEndsAt: null };
    case 'ACTIVE':
    case 'TRIALING':
    case 'PAST_DUE':
      if (!periodOver) {
        return { entitled: true, state: sub.status === 'ACTIVE' ? 'active' : sub.status === 'TRIALING' ? 'trialing' : 'past_due', graceEndsAt: null };
      }
      // The period ended without the provider renewing it.
      return afterPaidAccess(sub, sub.currentPeriodEnd!, now, policy);
    case 'UNPAID':
      // Retries exhausted: paid access stops (decision 0018) - from when that was recorded.
      return afterPaidAccess(sub, sub.updatedAt, now, policy);
    case 'EXPIRED':
      return afterPaidAccess(sub, sub.currentPeriodEnd && periodOver ? sub.currentPeriodEnd : (sub.canceledAt ?? sub.updatedAt), now, policy);
  }
}

/** Paid access ended at `endedAt`: a scheduled cancellation ends cleanly; otherwise grace may apply. */
function afterPaidAccess(sub: SubscriptionFacts, endedAt: Date, now: Date, policy: AccessPolicy): SubscriptionAccess {
  if (sub.cancelAtPeriodEnd) return { entitled: false, state: 'canceled', graceEndsAt: null };
  if (policy.graceDays > 0) {
    const graceEndsAt = new Date(endedAt.getTime() + policy.graceDays * DAY);
    if (now.getTime() < graceEndsAt.getTime()) return { entitled: true, state: 'grace_period', graceEndsAt };
  }
  return { entitled: false, state: 'expired', graceEndsAt: null };
}
