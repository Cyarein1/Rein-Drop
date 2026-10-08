import type { HuntActivity } from '@rein-drop/contracts';
import { profitSnapshot } from './profit.js';
import { homeRecommendation, type RecommendationHunt } from './recommendation.js';

const NOW = new Date('2026-10-07T10:00:00Z');
const HEALTHY = { status: 'healthy' as const, reason: null, nextAttemptAt: null };
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });

describe('profitSnapshot', () => {
  const since = hoursAgo(30 * 24);
  it('realized profit = sale - purchase - recorded costs, for sales in the period only', () => {
    const snapshot = profitSnapshot(
      [
        { purchasedAt: hoursAgo(48), price: ZAR(300_000) },
        { purchasedAt: hoursAgo(24 * 40), price: ZAR(100_000) }, // before the period
      ],
      [
        { soldAt: hoursAgo(5), salePrice: ZAR(500_000), purchasePrice: ZAR(300_000), costs: [ZAR(20_000), ZAR(5_000)] },
        { soldAt: hoursAgo(10), salePrice: ZAR(80_000), purchasePrice: ZAR(100_000), costs: [] }, // a loss
        { soldAt: hoursAgo(24 * 45), salePrice: ZAR(999_999), purchasePrice: ZAR(1), costs: [] }, // before the period
      ],
      since,
    );
    expect(snapshot).toEqual({
      bought: 1,
      sold: 2,
      byCurrency: [{ currency: 'ZAR', spent: ZAR(300_000), revenue: ZAR(580_000), realizedProfit: ZAR(155_000), sold: 2 }],
    });
  });

  it('never mixes currencies; nothing recorded = nothing claimed', () => {
    const snapshot = profitSnapshot(
      [{ purchasedAt: hoursAgo(1), price: { amountMinor: 10_000, currency: 'USD' } }],
      [{ soldAt: hoursAgo(1), salePrice: ZAR(200_000), purchasePrice: { amountMinor: 10_000, currency: 'USD' }, costs: [] }],
      since,
    );
    expect(snapshot.byCurrency).toEqual([
      { currency: 'USD', spent: { amountMinor: 10_000, currency: 'USD' }, revenue: { amountMinor: 0, currency: 'USD' }, realizedProfit: { amountMinor: 0, currency: 'USD' }, sold: 0 },
      { currency: 'ZAR', spent: ZAR(0), revenue: ZAR(0), realizedProfit: ZAR(0), sold: 1 },
    ]);
    expect(profitSnapshot([], [], since)).toEqual({ bought: 0, sold: 0, byCurrency: [] });
  });
});

describe('homeRecommendation', () => {
  const activity = (over: Partial<HuntActivity['counts']> = {}, a: Partial<HuntActivity> = {}): HuntActivity => ({
    huntId: 'h',
    scanning: false,
    lastCheckedAt: NOW.toISOString(),
    marketplaces: [{ marketplace: 'ebay', lastCheckedAt: NOW.toISOString(), lastCheck: 'ok', failingChecks: 0, nextCheckAt: null, source: HEALTHY }],
    counts: { deals: 3, toReview: 2, new: 1, alerts: 1, saved: 0, bought: 0, ...over },
    ...a,
  });
  const hunt = (over: Partial<RecommendationHunt> = {}): RecommendationHunt => ({
    id: '01990000-0000-7000-8000-000000000001',
    name: 'iPhone 13',
    status: 'LIVE',
    liveSince: hoursAgo(48),
    createdAt: hoursAgo(72),
    activity: activity(),
    ...over,
  });
  const rec = (over: Partial<Parameters<typeof homeRecommendation>[0]> = {}) =>
    homeRecommendation({ snapshot: 'complete', hunts: [hunt()], activePushDevices: 1, liveLimit: null, now: NOW, ...over });

  it('setup first: onboarding, first hunt, drafts, everything paused', () => {
    expect(rec({ snapshot: 'in_progress' })).toMatchObject({ code: 'finish_setup', actionLabel: 'Continue setup', target: { kind: 'onboarding' } });
    expect(rec({ snapshot: 'not_reseller', hunts: [] })).toMatchObject({ code: 'create_first_hunt', target: { kind: 'create_hunt' } });
    expect(rec({ hunts: [hunt({ status: 'DRAFT', name: 'PS5' }), hunt({ status: 'PAUSED' })] })).toMatchObject({ code: 'start_draft', title: '"PS5" isn\'t watching yet', target: { kind: 'start_hunt' } });
    expect(rec({ hunts: [hunt({ status: 'PAUSED' })] })).toMatchObject({ code: 'resume_hunt', kind: 'setup' });
  });

  it('then problems: a marketplace failing repeatedly', () => {
    const failing = activity({}, { marketplaces: [{ marketplace: 'facebook', lastCheckedAt: NOW.toISOString(), lastCheck: 'failed', failingChecks: 4, nextCheckAt: null, source: HEALTHY }] });
    expect(rec({ hunts: [hunt({ activity: failing })] })).toMatchObject({ code: 'source_issue', kind: 'issue', title: 'Facebook Marketplace checks are failing' });
    const once = activity({}, { marketplaces: [{ marketplace: 'facebook', lastCheckedAt: NOW.toISOString(), lastCheck: 'failed', failingChecks: 1, nextCheckAt: null, source: HEALTHY }] });
    expect(rec({ hunts: [hunt({ activity: once })] })).toBeNull(); // one blip isn't worth a recommendation
    // The source itself is down for everyone: Home's source banner says so; no duplicate recommendation.
    const sourceDown = activity({}, { marketplaces: [{ marketplace: 'facebook', lastCheckedAt: NOW.toISOString(), lastCheck: 'failed', failingChecks: 4, nextCheckAt: null, source: { status: 'down', reason: 'unavailable', nextAttemptAt: null } }] });
    expect(rec({ hunts: [hunt({ activity: sourceDown })] })?.code).not.toBe('source_issue');
  });

  it('at the plan limit with a draft waiting: pause or upgrade, nothing lost', () => {
    const draft = hunt({ id: '00000000-0000-7000-8000-0000000000d1', status: 'DRAFT', name: 'PS5' });
    expect(rec({ hunts: [hunt({ name: 'ps4' }), draft], liveLimit: 1 })).toEqual({
      code: 'plan_limit',
      kind: 'suggestion',
      title: 'Your plan watches 1 Hunt at a time',
      body: '"PS5" is saved and ready. Pause "ps4" to watch it instead, or upgrade to watch both. Nothing is lost either way.',
      actionLabel: 'See options',
      target: { kind: 'start_hunt', huntId: draft.id },
    });
    // Room left, or unlimited: no plan nudge.
    expect(rec({ hunts: [hunt(), draft], liveLimit: 2 })?.code).not.toBe('plan_limit');
    expect(rec({ hunts: [hunt(), draft], liveLimit: null })?.code).not.toBe('plan_limit');
  });

  it('then tuning, from the hunt\'s own numbers', () => {
    expect(rec({ hunts: [hunt({ activity: activity({ deals: 0, toReview: 0, alerts: 0 }) })] })).toMatchObject({ code: 'broaden_hunt', target: { kind: 'edit_hunt' } });
    expect(rec({ hunts: [hunt({ liveSince: hoursAgo(3), activity: activity({ deals: 0, toReview: 0, alerts: 0 }) })] })).toBeNull(); // too early to tell
    expect(rec({ hunts: [hunt({ activity: activity({ deals: 0 }, { scanning: true }) })] })).toBeNull();
    expect(rec({ hunts: [hunt({ activity: activity({ deals: 30, toReview: 25, alerts: 0 }) })] })).toMatchObject({ code: 'tighten_hunt' });
  });

  it('then reach: push; and nothing when all is well', () => {
    expect(rec({ activePushDevices: 0 })).toMatchObject({ code: 'enable_push', target: { kind: 'notifications' } });
    expect(rec()).toBeNull();
  });
});
