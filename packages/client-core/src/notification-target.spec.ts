import { describe, expect, it } from 'vitest';
import { createTapDeduper, notificationTarget, takePendingTap } from './notification-target.js';

const DEAL = '01990000-0000-7000-8000-0000000000aa';
const ALERT = '01990000-0000-7000-8000-0000000000bb';

describe('notification tap target', () => {
  it('opens the deal (and marks the alert read) when the payload names one', () => {
    expect(notificationTarget({ dealId: DEAL, alertId: ALERT })).toEqual({ kind: 'deal', dealId: DEAL, alertId: ALERT });
    expect(notificationTarget({ dealId: DEAL.toUpperCase() })).toEqual({ kind: 'deal', dealId: DEAL, alertId: null });
  });

  it('anything malformed or missing opens the inbox - untrusted input never reaches navigation', () => {
    for (const data of [undefined, null, 'x', 42, {}, { dealId: '../settings' }, { dealId: 'abc' }, { dealId: { id: DEAL } }]) {
      expect(notificationTarget(data)).toEqual({ kind: 'inbox', alertId: null });
    }
    expect(notificationTarget({ alertId: ALERT, dealId: 'nope' })).toEqual({ kind: 'inbox', alertId: ALERT });
  });

  it('a tap is handled once (cold-start response + listener, relaunch replay)', () => {
    const first = createTapDeduper(2);
    expect(first('n1')).toBe(true);
    expect(first('n1')).toBe(false);
    expect(first('n2')).toBe(true);
    expect(first('n3')).toBe(true);
    // Oldest forgotten beyond the limit.
    expect(first('n1')).toBe(true);
  });
});

describe('taps that arrive before sign-in', () => {
  const target = notificationTarget({ dealId: DEAL });

  it('waits while signed out, then opens after sign-in', () => {
    const pending = { target, forUserId: null };
    expect(takePendingTap(pending, null)).toEqual({ open: null, keep: pending });
    expect(takePendingTap(pending, 'u1')).toEqual({ open: target, keep: null });
  });

  it("is dropped if a different account signs in (never opens someone else's deal)", () => {
    expect(takePendingTap({ target, forUserId: 'u1' }, 'u2')).toEqual({ open: null, keep: null });
    expect(takePendingTap({ target, forUserId: 'u1' }, 'u1')).toEqual({ open: target, keep: null });
  });

  it('nothing pending, nothing to do', () => {
    expect(takePendingTap(null, 'u1')).toEqual({ open: null, keep: null });
  });
});
