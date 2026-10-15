import { describe, expect, it } from 'vitest';
import type { HuntActivity, SourceStatus } from '@rein-drop/contracts';
import { translator } from '@rein-drop/i18n';
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

describe('German', () => {
  const t = translator('de');
  const ent = { entitlements: { activeHunts: { limit: 1 } } as never, usage: { activeHunts: 1 }, remaining: { activeHunts: 0 } };

  it('first scan, no deals yet (plural days) and several Hunts', () => {
    expect(firstScanState(HUNT, activity({ scanning: true }), NOW, t)).toMatchObject({ title: 'Rein Drop prüft zum ersten Mal', details: ['eBay: fertig vor 4 Min.', 'Facebook Marketplace: fertig vor 5 Min.'] });
    expect(noDealsYetState(HUNT, activity(), NOW, t)).toMatchObject({ details: ['Zuletzt geprüft vor 4 Min.', 'Nächste Prüfung in 10 Min.'], actions: [{ label: 'Kriterien anpassen' }] });
    expect(noDealsYetState({ ...HUNT, activatedAt: ago(60 * 25) }, activity(), NOW, t)!.body).toMatch(/^Dein Hunt ist seit 1 Tag aktiv/);
    expect(noDealsYetState({ ...HUNT, activatedAt: ago(60 * 50) }, activity(), NOW, t)!.body).toMatch(/^Dein Hunt ist seit 2 Tagen aktiv/);
  });

  it('plan limit: one draft vs several, web vs companion', () => {
    const hunts = [
      { id: 'h1', name: 'ps4', status: 'LIVE' as const },
      { id: 'h2', name: 'PS5', status: 'DRAFT' as const },
    ];
    expect(planLimitState(ent, hunts, 'web', t)).toMatchObject({
      title: 'Dein Plan beobachtet 1 Hunt gleichzeitig',
      body: '„PS5“ ist gespeichert und bereit. Pausiere „ps4“, um stattdessen diesen zu beobachten, oder wechsle auf einen größeren Plan, um mehr zu beobachten. So oder so geht nichts verloren.',
    });
    const more = [...hunts, { id: 'h3', name: 'Switch', status: 'DRAFT' as const }, { id: 'h4', name: 'Xbox', status: 'LIVE' as const }];
    expect(planLimitState(ent, more, 'companion', t)).toMatchObject({
      title: 'Dein aktueller Zugang beobachtet 1 Hunt gleichzeitig',
      body: '2 Entwürfe sind gespeichert und bereit. Pausiere einen aktiven Hunt, um stattdessen einen davon zu beobachten. Es geht nichts verloren.',
    });
    // English plural branches match the old wording.
    expect(planLimitState(ent, more, 'companion')!.body).toBe('2 drafts are saved and ready. Pause a live Hunt to watch one instead. Nothing is lost.');
  });

  it('reduced monitoring and cancellation', () => {
    const quiet = reducedMonitoringState({ mode: 'reduced', reason: 'quiet_hours', checksEveryMinutes: 60, resumesAt: '2026-10-09T05:00:00.000Z' }, NOW, { localeTag: 'de-DE', t })!;
    expect(quiet.title).toBe('Ruhezeit – seltenere Prüfungen');
    expect(quiet.body).toMatch(/^Rein Drop prüft nachts alle 60 Min\. und kehrt um .+ zum normalen Takt zurück\. Starke Deals/);
    expect(reducedMonitoringState({ mode: 'reduced', reason: 'plan_cadence', checksEveryMinutes: null, resumesAt: null }, NOW, { localeTag: 'de-DE', t }, 'companion')).toMatchObject({
      body: expect.stringMatching(/^Dein aktueller Zugang prüft Marktplätze seltener\./),
      actions: [],
    });
    const paid = cancellationState({ name: 'Pro', isFree: false }, { canCancelOnline: true, paidUntil: '12.11.2026' }, t);
    expect(paid).toMatchObject({ title: 'Pro kündigen?', actions: [{ label: 'Meinen Plan behalten' }] });
    expect(paid.consequences[0]).toBe('Du behältst Pro bis 12.11.2026 – dem Ende des Zeitraums, den du bezahlt hast. Dir wird nichts mehr berechnet.');
    expect(cancellationState({ name: 'Free', isFree: true }, undefined, t).title).toBe('Du nutzt den Free-Plan');
  });
});

describe('cancellation', () => {
  it('a web-billed plan can be cancelled online; reassuring and factual about what happens', () => {
    const paid = cancellationState({ name: 'Pro', isFree: false }, { canCancelOnline: true, paidUntil: '12 Nov 2026' });
    expect(paid).toMatchObject({ title: 'Cancel Pro?', available: true, unavailableReason: null, actions: [{ label: 'Keep my plan', variant: 'primary' }] });
    expect(paid.consequences[0]).toBe("You keep Pro until 12 Nov 2026 - the end of the period you've paid for. You won't be charged again.");
    expect(paid.consequences).toContain('Your Hunts are kept - nothing is ever deleted.');
    expect(paid.consequences.join(' ')).toMatch(/paused, the most recently started first/);
  });

  it('says plainly when the plan cannot be cancelled here, and Free has nothing to cancel', () => {
    const other = cancellationState({ name: 'Pro', isFree: false });
    expect(other).toMatchObject({ available: false, unavailableReason: expect.stringMatching(/Nothing will be charged/) });
    expect(cancellationState({ name: 'Free', isFree: true })).toMatchObject({ title: "You're on the Free plan", consequences: [], available: false, unavailableReason: null });
  });
});
