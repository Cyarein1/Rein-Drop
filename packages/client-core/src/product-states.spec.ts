import { describe, expect, it } from 'vitest';
import type { HuntActivity, SourceStatus } from '@rein-drop/contracts';
import { cancellationState, dealsWaitingState, firstScanState, noDealsYetState, planLimitState, reducedMonitoringState } from './product-states.js';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const inMin = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
const HEALTHY: SourceStatus = { status: 'healthy', reason: null, nextAttemptAt: null };
const HUNT = { id: '00000000-0000-7000-8000-000000000001', status: 'LIVE' as const, activatedAt: ago(60) };

function activity(over: Partial<HuntActivity> = {}, deals = 0): HuntActivity {
  return {
    huntId: HUNT.id,
    scanning: false,
    lastCheckedAt: ago(4),
    marketplaces: [
      { marketplace: 'ebay', lastCheckedAt: ago(4), lastCheck: 'ok', failingChecks: 0, nextCheckAt: inMin(11), source: HEALTHY },
      { marketplace: 'facebook', lastCheckedAt: ago(5), lastCheck: 'ok', failingChecks: 0, nextCheckAt: inMin(10), source: HEALTHY },
    ],
    counts: { deals, toReview: 0, new: 0, alerts: 0, saved: 0, bought: 0 },
    ...over,
  };
}

describe('first scan', () => {
  it('only while the first check runs; says which source is done', () => {
    const scanning = activity({
      scanning: true,
      lastCheckedAt: ago(1),
      marketplaces: [
        { marketplace: 'ebay', lastCheckedAt: ago(1), lastCheck: 'ok', failingChecks: 0, nextCheckAt: null, source: HEALTHY },
        { marketplace: 'facebook', lastCheckedAt: null, lastCheck: null, failingChecks: 0, nextCheckAt: null, source: HEALTHY },
      ],
    });
    expect(firstScanState(HUNT, scanning, NOW)).toMatchObject({
      state: 'firstScan',
      title: 'Rein Drop is checking for the first time',
      details: ['eBay: done 1 min ago', 'Facebook Marketplace: checking…'],
      live: true,
      actions: [],
    });
    expect(firstScanState(HUNT, activity(), NOW)).toBeNull();
    expect(firstScanState({ ...HUNT, status: 'PAUSED' }, scanning, NOW)).toBeNull();
  });
});

describe('no deals yet while healthy', () => {
  it('live, scanned, healthy, nothing yet: reassure and offer tuning', () => {
    expect(noDealsYetState(HUNT, activity(), NOW)).toEqual({
      state: 'noDealsYet',
      title: 'Watching - nothing has matched yet',
      body: expect.stringContaining('Everything is working'),
      details: ['Last checked 4 min ago', 'Next check in 10 min'],
      actions: [{ label: 'Tune criteria', path: `/hunts/${HUNT.id}/edit`, variant: 'secondary' }],
      live: false,
    });
  });

  it('after a day with nothing: suggest broadening', () => {
    const view = noDealsYetState({ ...HUNT, activatedAt: ago(60 * 50) }, activity(), NOW)!;
    expect(view.body).toMatch(/^Your Hunt has been live for 2 days without a match/);
    expect(view.actions[0]).toMatchObject({ label: 'Broaden criteria', variant: 'primary' });
  });

  it('never while a source is degraded, while scanning, with deals, or not live', () => {
    const degraded = activity();
    degraded.marketplaces[1] = { ...degraded.marketplaces[1]!, source: { status: 'degraded', reason: 'slow', nextAttemptAt: null } };
    expect(noDealsYetState(HUNT, degraded, NOW)).toBeNull();
    expect(noDealsYetState(HUNT, activity({ scanning: true }), NOW)).toBeNull();
    expect(noDealsYetState(HUNT, activity({}, 3), NOW)).toBeNull();
    expect(noDealsYetState({ ...HUNT, status: 'PAUSED' }, activity(), NOW)).toBeNull();
  });
});

describe('Deals before any deal exists', () => {
  const other = { ...HUNT, id: '00000000-0000-7000-8000-000000000002' };
  it('first scan wins; all quiet + healthy = no deals yet; several Hunts point to the Hunts list', () => {
    expect(dealsWaitingState([HUNT], [activity({ scanning: true })], NOW)?.state).toBe('firstScan');
    expect(dealsWaitingState([HUNT], [activity()], NOW)).toMatchObject({ state: 'noDealsYet', actions: [{ label: 'Tune criteria' }] });
    expect(dealsWaitingState([HUNT, other], [activity(), { ...activity(), huntId: other.id }], NOW)).toMatchObject({ actions: [{ label: 'Review your Hunts', path: '/hunts' }] });
  });
  it('null when nothing is live or a Hunt already has deals', () => {
    expect(dealsWaitingState([{ ...HUNT, status: 'PAUSED' }], [activity()], NOW)).toBeNull();
    expect(dealsWaitingState([HUNT], [activity({}, 2)], NOW)).toBeNull();
  });
});

describe('reduced monitoring (placeholder)', () => {
  it('normal = nothing; quiet hours and plan cadence read calmly', () => {
    expect(reducedMonitoringState({ mode: 'normal', reason: null, checksEveryMinutes: null, resumesAt: null }, NOW, { localeTag: 'en-ZA' })).toBeNull();
    const quiet = reducedMonitoringState({ mode: 'reduced', reason: 'quiet_hours', checksEveryMinutes: 60, resumesAt: '2026-10-09T05:00:00.000Z' }, NOW, { localeTag: 'en-GB' })!;
    expect(quiet).toMatchObject({ state: 'reducedMonitoring', title: 'Quiet hours - checking less often' });
    expect(quiet.body).toMatch(/^Rein Drop checks every 60 min overnight and goes back to normal at .+\. Strong deals still reach you/);
    const plan = reducedMonitoringState({ mode: 'reduced', reason: 'plan_cadence', checksEveryMinutes: 30, resumesAt: null }, NOW, { localeTag: 'en' })!;
    expect(plan).toMatchObject({ actions: [{ label: 'See plans', path: '/settings' }] });
  });
});

describe('plan suggestion', () => {
  const ent = (limit: number | null, remaining: number | null) => ({ entitlements: { activeHunts: { limit } } as never, usage: { activeHunts: 1 }, remaining: { activeHunts: remaining } });
  const hunts = [
    { id: 'h1', name: 'ps4', status: 'LIVE' as const },
    { id: 'h2', name: 'PS5', status: 'DRAFT' as const },
  ];

  it('at the limit with a draft waiting: pause or upgrade, nothing lost', () => {
    expect(planLimitState(ent(1, 0), hunts)).toEqual({
      state: 'suggestion',
      title: 'Your plan watches 1 Hunt at a time',
      body: '"PS5" is saved and ready. Pause "ps4" to watch it instead, or upgrade to watch more. Nothing is lost either way.',
      details: [],
      actions: [
        { label: 'See options', path: '/hunts/h2/start', variant: 'primary' },
        { label: 'Manage live Hunts', path: '/hunts?status=LIVE', variant: 'text' },
      ],
      live: false,
    });
  });

  it('room left, unlimited, or no drafts: nothing to suggest', () => {
    expect(planLimitState(ent(2, 1), hunts)).toBeNull();
    expect(planLimitState(ent(null, null), hunts)).toBeNull();
    expect(planLimitState(ent(1, 0), [hunts[0]!])).toBeNull();
  });
});

describe('cancellation (placeholder)', () => {
  it('reassuring and factual; cannot complete until billing exists', () => {
    const paid = cancellationState({ name: 'Pro', isFree: false });
    expect(paid).toMatchObject({ title: 'Cancel Pro?', available: false, actions: [{ label: 'Keep my plan', variant: 'primary' }] });
    expect(paid.consequences).toContain('Your Hunts are kept - nothing is ever deleted.');
    expect(paid.unavailableReason).toMatch(/Nothing will be charged/);
    expect(cancellationState({ name: 'Free', isFree: true })).toMatchObject({ title: "You're on the Free plan", consequences: [] });
  });
});
