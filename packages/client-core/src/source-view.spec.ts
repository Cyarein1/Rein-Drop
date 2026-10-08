import { describe, expect, it } from 'vitest';
import type { Hunt, HuntActivity, SourceHealth, SourceStatus } from '@rein-drop/contracts';
import { dealCardView } from './deal-view.js';
import { huntMonitoringHealth, marketplaceRows, monitoringLine } from './hunt-view.js';
import { sourceBanner, sourceIssue } from './source-view.js';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const inMin = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
const HEALTHY: SourceStatus = { status: 'healthy', reason: null, nextAttemptAt: null };
const src = (marketplace: 'ebay' | 'facebook', over: Partial<SourceHealth> = {}): SourceHealth => ({
  marketplace,
  status: 'healthy',
  reason: null,
  since: ago(60),
  lastSuccessAt: ago(1),
  nextAttemptAt: null,
  checkedAt: ago(1),
  ...over,
});

describe('source banner (calm, says the others continue)', () => {
  it('nothing to say when every source works or simply has not reported yet', () => {
    expect(sourceBanner([src('ebay'), src('facebook')], NOW)).toBeNull();
    expect(sourceBanner([src('ebay', { status: 'unknown' }), src('facebook')], NOW)).toBeNull();
  });

  it('one degraded source: info, names it, says the other continues and retries are automatic', () => {
    expect(sourceBanner([src('ebay'), src('facebook', { status: 'degraded', reason: 'slow' })], NOW)).toEqual({
      tone: 'info',
      title: 'Facebook Marketplace is slow right now',
      message: 'eBay checks continue as normal. Rein Drop retries automatically; nothing you need to do.',
    });
    expect(sourceBanner([src('ebay', { status: 'degraded', reason: 'partial' }), src('facebook')], NOW)!.title).toBe('eBay is returning fewer results right now');
  });

  it('one source down: a warning (never an error) with the retry time', () => {
    expect(sourceBanner([src('ebay', { status: 'down', reason: 'unavailable', nextAttemptAt: inMin(4) }), src('facebook')], NOW)).toEqual({
      tone: 'warning',
      title: "eBay isn't responding right now",
      message: 'Facebook Marketplace checks continue as normal. Rein Drop tries again in 4 min; nothing you need to do. New deals from it may arrive late.',
    });
  });

  it('both impaired: one reassuring message', () => {
    const b = sourceBanner([src('ebay', { status: 'down' }), src('facebook', { status: 'degraded', reason: 'rate_limited' })], NOW)!;
    expect(b).toMatchObject({ tone: 'warning', title: 'Marketplaces are having trouble right now' });
    expect(b.message).toMatch(/your Hunts are safe/);
  });

  it('labels per state', () => {
    expect(sourceIssue({ status: 'degraded', reason: 'rate_limited', nextAttemptAt: null })?.label).toBe('Limiting checks');
    expect(sourceIssue({ status: 'not_configured', reason: null, nextAttemptAt: null })?.label).toBe('Not set up');
    expect(sourceIssue(HEALTHY)).toBeNull();
    expect(sourceIssue({ status: 'unknown', reason: null, nextAttemptAt: null })).toBeNull();
  });
});

describe('a Hunt never looks fully healthy while a source is not', () => {
  const hunt: Pick<Hunt, 'status' | 'marketplaces' | 'archivedAt'> = { status: 'LIVE', marketplaces: ['ebay', 'facebook'], archivedAt: null };
  const activity = (facebook: Partial<HuntActivity['marketplaces'][number]>): HuntActivity => ({
    huntId: '00000000-0000-7000-8000-000000000001',
    scanning: false,
    lastCheckedAt: ago(5),
    marketplaces: [
      { marketplace: 'ebay', lastCheckedAt: ago(5), lastCheck: 'ok', failingChecks: 0, nextCheckAt: inMin(10), source: HEALTHY },
      { marketplace: 'facebook', lastCheckedAt: ago(6), lastCheck: 'ok', failingChecks: 0, nextCheckAt: inMin(9), source: HEALTHY, ...facebook },
    ],
    counts: { deals: 0, toReview: 0, new: 0, alerts: 0, saved: 0, bought: 0 },
  });

  it('a degraded source (even with an OK last check) makes the Hunt "partly working"', () => {
    const a = activity({ source: { status: 'degraded', reason: 'slow', nextAttemptAt: null } });
    expect(huntMonitoringHealth(a)).toBe('partial');
    expect(monitoringLine(hunt, a, NOW)).toEqual({ text: 'Last checked 5 min ago · Facebook Marketplace is slow right now', tone: 'fresh', scanning: false });
    expect(marketplaceRows(hunt, a, NOW)[1]).toEqual({ name: 'Facebook Marketplace', status: { label: 'Slow right now', tone: 'fresh' }, detail: 'Checked 6 min ago · next in 9 min' });
  });

  it('a partial last check is not "OK"', () => {
    const a = activity({ lastCheck: 'degraded' });
    expect(huntMonitoringHealth(a)).toBe('partial');
    expect(marketplaceRows(hunt, a, NOW)[1]!.status).toEqual({ label: 'Incomplete last time', tone: 'fresh' });
  });

  it('a cooling source shows when it is tried again', () => {
    const a = activity({ lastCheck: 'failed', failingChecks: 3, source: { status: 'down', reason: 'unavailable', nextAttemptAt: inMin(4) } });
    expect(marketplaceRows(hunt, a, NOW)[1]).toEqual({ name: 'Facebook Marketplace', status: { label: 'Not responding', tone: 'fresh' }, detail: 'Checked 6 min ago · tries again in 4 min' });
    expect(monitoringLine(hunt, a, NOW).text).toBe("Last checked 5 min ago · Facebook Marketplace isn't responding right now");
  });

  it('every source impaired = impaired; all fine = ok; nothing yet = unknown', () => {
    const bad: SourceStatus = { status: 'down', reason: 'unavailable', nextAttemptAt: null };
    const both = activity({ source: bad });
    both.marketplaces[0] = { ...both.marketplaces[0]!, source: bad };
    expect(huntMonitoringHealth(both)).toBe('impaired');
    expect(huntMonitoringHealth(activity({}))).toBe('ok');
    expect(huntMonitoringHealth(null)).toBe('unknown');
  });

  it('deals from a degraded source say updates may be late', () => {
    const deal = {
      id: '00000000-0000-7000-8000-000000000002',
      status: 'new',
      matchStatus: 'NEW',
      hunt: { id: '00000000-0000-7000-8000-000000000001', name: 'Switch' },
      listing: { marketplace: 'facebook', title: 'Switch', url: 'https://x', imageUrls: [], conditionText: null, locationText: null, listedAt: null, lastSeenAt: ago(5) },
      price: { asking: null, knownCosts: null, knownTotal: null },
      freshness: { basis: 'first_seen', at: ago(5), ageMinutes: 5 },
      source: { marketplace: 'facebook', listingStatus: 'ACTIVE', available: true, lastSeenAt: ago(5), lastCheckedAt: ago(5), lastCheck: 'ok', sourceHealth: { status: 'degraded', reason: 'partial', nextAttemptAt: null } },
      assessment: { status: 'pending', strength: null, confidence: null, score: null },
      estimate: { resale: { status: 'unavailable', reason: 'no_source' }, upside: { status: 'unavailable', reason: 'no_resale_estimate' } },
      reason: null,
      rank: 35,
      isSaved: false,
      decision: { seenAt: null, savedAt: null, ignoredAt: null, ignoreReason: null, boughtAt: null, inventoryItemId: null },
    } as unknown as Parameters<typeof dealCardView>[0];
    expect(dealCardView(deal, { currency: 'ZAR', distanceUnit: 'km', localeTag: 'en-ZA' }).sourceNote).toEqual({ text: 'Facebook Marketplace is slow right now - updates may be late', tone: 'fresh' });
  });
});
