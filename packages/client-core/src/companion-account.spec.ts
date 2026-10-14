import { describe, expect, it } from 'vitest';
import type { AccessResponse } from '@rein-drop/contracts';
import { accessLoadFor, accessLoadReducer, companionAccessView, companionUsageLines, NO_PAID_ACCESS_LINE, type AccessLoad } from './companion-account.js';
import { SELLING_WORDS } from './companion-access.js';

type Source = AccessResponse['products']['source'];
const LIMITS: Source['limits'] = {
  activeHunts: { limit: 1, used: 1, remaining: 0 },
  savedHunts: { limit: null, used: 3, remaining: null },
  marketplaces: ['ebay'],
  monitoringPriority: 'NORMAL',
  hotHunts: { available: false, limit: 0 },
  analyticsHistoryDays: 30,
  seats: 1,
};
const FREE = { code: 'free', name: 'Free', family: 'SOURCE' as const };
const PRO = { code: 'pro', name: 'Pro', family: 'SOURCE' as const };
const access = (source: Partial<Source>, suspended = false): AccessResponse => ({
  suspended,
  products: {
    source: { state: 'free', hasAccess: true, paid: false, plan: FREE, periodEndsAt: null, cancelsAtPeriodEnd: false, graceEndsAt: null, limits: LIMITS, ...source },
    sell: { state: 'none', hasAccess: false, paid: false, plan: null, periodEndsAt: null, cancelsAtPeriodEnd: false, graceEndsAt: null, limits: null },
  },
});
const END = '2026-11-14T10:00:00Z';
const view = (a: AccessResponse) => companionAccessView(a, 'en-US');

/** Every access state the server can report, with the companion's answer. */
const STATES: Array<[string, AccessResponse, ReturnType<typeof view>['kind'], boolean]> = [
  ['no subscription (Free)', access({}), 'no_paid_access', false],
  ['active', access({ state: 'active', paid: true, plan: PRO, periodEndsAt: END }), 'active', true],
  ['active, cancellation scheduled', access({ state: 'active', paid: true, plan: PRO, periodEndsAt: END, cancelsAtPeriodEnd: true }), 'ending', true],
  ['trial', access({ state: 'trialing', paid: true, plan: PRO, periodEndsAt: END }), 'trial', true],
  ['payment retrying (past due)', access({ state: 'past_due', paid: true, plan: PRO }), 'needs_attention', true],
  ['grace period', access({ state: 'grace_period', paid: true, plan: PRO, graceEndsAt: '2026-10-17T10:00:00Z' }), 'grace', true],
  ['expired', access({ state: 'expired' }), 'ended', false],
  ['canceled', access({ state: 'canceled' }), 'ended', false],
  ['suspended', access({ state: 'suspended', hasAccess: false, plan: null }, true), 'suspended', false],
];

describe('companion account access (decision 0018)', () => {
  it.each(STATES)('%s', (_name, a, kind, paid) => {
    const v = view(a);
    expect(v.kind).toBe(kind);
    expect(v.paidFeatures).toBe(paid);
    expect(v.canUseHunts).toBe(kind !== 'suspended');
  });

  it('accounts without paid access get the neutral message; data is never said to be deleted', () => {
    for (const [, a, kind] of STATES.filter(([, , k]) => k === 'no_paid_access' || k === 'ended')) {
      expect(view(a).lines[0]).toBe(NO_PAID_ACCESS_LINE);
      if (kind === 'ended') expect(view(a).lines.join(' ')).toMatch(/kept.*paused, not deleted/);
    }
    expect(view(STATES.at(-1)![1]).lines.join(' ')).toMatch(/Hunts, inventory and saved deals are kept/);
  });

  it('dates: trial / scheduled end / grace say until when', () => {
    expect(view(STATES[2]![1]).lines[0]).toBe('Your current access continues until Nov 14, 2026.');
    expect(view(STATES[3]![1]).lines[0]).toBe('Your trial access continues until Nov 14, 2026.');
    expect(view(STATES[5]![1]).lines[0]).toBe('Your current access continues until Oct 17, 2026.');
  });

  it('a subscription lifecycle moves through the states without ever selling', () => {
    const journey = ['trialing', 'active', 'past_due', 'grace_period', 'expired'] as const;
    const kinds = journey.map((state) => view(access({ state, paid: state !== 'expired', plan: state === 'expired' ? FREE : PRO, periodEndsAt: END })).kind);
    expect(kinds).toEqual(['trial', 'active', 'needs_attention', 'grace', 'ended']);
  });

  it('no companion access wording contains selling words (prices, upgrade, subscribe, pay on the web)', () => {
    const text = STATES.flatMap(([, a]) => [view(a).label, ...view(a).lines, ...companionUsageLines(a)]);
    expect(text.filter((t) => SELLING_WORDS.test(t) || /on the web|website|\.com/i.test(t))).toEqual([]);
  });

  it('usage lines', () => {
    expect(companionUsageLines(access({}))).toEqual(['Live Hunts: 1 of 1', 'Saved Hunts: 3 (no limit)']);
  });
});

describe('access loading across sign-in, sign-out and account switching', () => {
  const A = access({ state: 'active', paid: true, plan: PRO });
  const B = access({});
  const run = (events: Parameters<typeof accessLoadReducer>[1][], from: AccessLoad = { status: 'signed_out' }) => events.reduce(accessLoadReducer, from);

  it('signed in -> loading -> ready', () => {
    expect(run([{ type: 'signed_in', userId: 'a' }, { type: 'loaded', userId: 'a', access: A }])).toEqual({ status: 'ready', userId: 'a', access: A });
  });

  it("a late answer for the previous account is ignored after switching accounts", () => {
    const s = run([{ type: 'signed_in', userId: 'a' }, { type: 'signed_out' }, { type: 'signed_in', userId: 'b' }, { type: 'loaded', userId: 'a', access: A }]);
    expect(s).toEqual({ status: 'loading', userId: 'b' });
    expect(accessLoadReducer(s, { type: 'loaded', userId: 'b', access: B })).toMatchObject({ status: 'ready', userId: 'b', access: B });
  });

  it('switching accounts drops the previous account data immediately', () => {
    expect(run([{ type: 'signed_in', userId: 'a' }, { type: 'loaded', userId: 'a', access: A }, { type: 'signed_in', userId: 'b' }])).toEqual({ status: 'loading', userId: 'b' });
  });

  it('sign-out clears everything; nothing loads into a signed-out state', () => {
    expect(run([{ type: 'signed_in', userId: 'a' }, { type: 'loaded', userId: 'a', access: A }, { type: 'signed_out' }, { type: 'loaded', userId: 'a', access: A }])).toEqual({ status: 'signed_out' });
  });

  it('offline keeps the last good answer as stale; recovery replaces it', () => {
    const offline = run([{ type: 'signed_in', userId: 'a' }, { type: 'loaded', userId: 'a', access: A }, { type: 'failed', userId: 'a', reason: 'offline' }]);
    expect(offline).toEqual({ status: 'error', userId: 'a', reason: 'offline', stale: A });
    expect(accessLoadReducer(offline, { type: 'loaded', userId: 'a', access: B })).toMatchObject({ status: 'ready', access: B });
    expect(run([{ type: 'signed_in', userId: 'a' }, { type: 'failed', userId: 'a', reason: 'failed' }])).toMatchObject({ stale: null });
  });

  it('accessLoadFor: what the current account sees', () => {
    const readyA = run([{ type: 'signed_in', userId: 'a' }, { type: 'loaded', userId: 'a', access: A }]);
    expect(accessLoadFor(readyA, 'a')).toBe(readyA);
    expect(accessLoadFor(readyA, 'b')).toEqual({ status: 'loading', userId: 'b' });
    expect(accessLoadFor(readyA, null)).toEqual({ status: 'signed_out' });
  });

  it('refreshing the same account keeps showing its access', () => {
    const ready = run([{ type: 'signed_in', userId: 'a' }, { type: 'loaded', userId: 'a', access: A }]);
    expect(accessLoadReducer(ready, { type: 'signed_in', userId: 'a' })).toBe(ready);
  });
});
