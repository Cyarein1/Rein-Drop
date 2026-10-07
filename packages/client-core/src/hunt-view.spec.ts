import { describe, expect, it } from 'vitest';
import type { Hunt, HuntActivity } from '@rein-drop/contracts';
import {
  buildUpdateHuntRequest,
  countsLine,
  editContext,
  huntActions,
  huntCriteria,
  huntFormValues,
  marketplaceRows,
  monitoringLine,
} from './hunt-view.js';

const NOW = new Date('2026-10-07T10:00:00.000Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const ZA = { currency: 'ZAR', distanceUnit: 'km' as const, localeTag: 'en-ZA' };
const US = { currency: 'USD', distanceUnit: 'mi' as const, localeTag: 'en-US' };

const hunt: Hunt = {
  id: '01990000-0000-7000-8000-000000000001',
  name: 'iPhone 13',
  query: 'iPhone 13',
  status: 'LIVE',
  priority: 'NORMAL',
  marketplaces: ['ebay', 'facebook'],
  location: { text: 'Cape Town', radiusKm: 40 },
  conditions: ['used'],
  maxPrice: { amountMinor: 450_000, currency: 'ZAR' },
  target: { kind: 'profit', amount: { amountMinor: 100_000, currency: 'ZAR' } },
  exclusions: ['for parts', 'cracked'],
  createdAt: ago(600),
  updatedAt: ago(600),
  lastEditedAt: null,
  activatedAt: ago(300),
  pausedAt: null,
  archivedAt: null,
};
const activity = (over: Partial<HuntActivity> = {}): HuntActivity => ({
  huntId: hunt.id,
  scanning: false,
  lastCheckedAt: ago(5),
  marketplaces: [
    { marketplace: 'ebay', lastCheckedAt: ago(5), lastCheck: 'ok', failingChecks: 0, nextCheckAt: new Date(NOW.getTime() + 10 * 60_000).toISOString() },
    { marketplace: 'facebook', lastCheckedAt: ago(7), lastCheck: 'ok', failingChecks: 0, nextCheckAt: null },
  ],
  counts: { deals: 6, toReview: 3, new: 2, alerts: 1, saved: 1, bought: 0 },
  ...over,
});

describe('monitoring line', () => {
  it('says what Rein Drop is doing for each state', () => {
    expect(monitoringLine(hunt, activity(), NOW)).toEqual({ text: 'Watching · last checked 5 min ago', tone: 'action', scanning: false });
    expect(monitoringLine(hunt, activity({ scanning: true, lastCheckedAt: null }), NOW)).toMatchObject({
      text: 'Checking eBay and Facebook Marketplace for the first time…',
      scanning: true,
    });
    const failing = activity({ marketplaces: [{ ...activity().marketplaces[1]!, lastCheck: 'failed', failingChecks: 2 }] });
    expect(monitoringLine(hunt, failing, NOW).text).toBe("Last checked 5 min ago · couldn't check Facebook Marketplace last time");
    expect(monitoringLine({ ...hunt, status: 'PAUSED' }, activity(), NOW).text).toBe('Paused · last checked 5 min ago');
    expect(monitoringLine({ ...hunt, status: 'DRAFT' }, null, NOW).text).toBe('Not watching yet');
    expect(monitoringLine({ ...hunt, status: 'ARCHIVED', archivedAt: ago(60 * 50) }, null, NOW).text).toBe('Archived 2 days ago');
  });

  it('per marketplace: last check, next check and failing streaks', () => {
    expect(marketplaceRows(hunt, activity(), NOW)).toEqual([
      { name: 'eBay', status: { label: 'OK', tone: 'profit' }, detail: 'Checked 5 min ago · next in 10 min' },
      { name: 'Facebook Marketplace', status: { label: 'OK', tone: 'profit' }, detail: 'Checked 7 min ago · next check soon' },
    ]);
    const failing = activity({ marketplaces: [{ marketplace: 'facebook', lastCheckedAt: ago(2), lastCheck: 'failed', failingChecks: 3, nextCheckAt: null }] });
    expect(marketplaceRows({ status: 'PAUSED' }, failing, NOW)).toEqual([
      { name: 'Facebook Marketplace', status: { label: '3 failed checks', tone: 'fresh' }, detail: 'Checked 2 min ago' },
    ]);
  });

  it('counts read naturally and stay quiet when empty', () => {
    expect(countsLine(activity())).toBe('6 deals · 3 to review · 1 alert');
    expect(countsLine(activity({ counts: { deals: 0, toReview: 0, new: 0, alerts: 0, saved: 0, bought: 0 } }))).toBeNull();
  });
});

describe('actions', () => {
  it('fit the lifecycle; drafts start through the plan gate; archived is read-only until restored', () => {
    expect(huntActions('DRAFT')).toEqual(['start', 'edit', 'archive']);
    expect(huntActions('LIVE')).toEqual(['pause', 'edit', 'archive']);
    expect(huntActions('PAUSED')).toEqual(['resume', 'edit', 'archive']);
    expect(huntActions('ARCHIVED')).toEqual(['restore']);
  });
});

describe('edit', () => {
  it('fills the form from the hunt and round-trips to the same criteria', () => {
    const values = huntFormValues(hunt, ZA);
    expect(values).toMatchObject({ maxPrice: '4500.00', targetKind: 'profit', targetProfit: '1000.00', radius: '40', exclusions: 'for parts, cracked' });
    const built = buildUpdateHuntRequest(hunt, values, ZA);
    expect(built).toMatchObject({
      ok: true,
      request: {
        name: 'iPhone 13',
        query: 'iPhone 13',
        marketplaces: ['ebay', 'facebook'],
        location: { text: 'Cape Town', radiusKm: 40 },
        maxPrice: { amountMinor: 450_000, currency: 'ZAR' },
        exclusions: ['for parts', 'cracked'],
      },
    });
    expect(huntCriteria(hunt, ZA).sentence).toContain('iPhone 13');
  });

  it('a default name follows the query; a custom name is kept', () => {
    const changed = { ...huntFormValues(hunt, ZA), query: 'iPhone 13 Pro' };
    expect(buildUpdateHuntRequest(hunt, changed, ZA)).toMatchObject({ request: { name: 'iPhone 13 Pro', query: 'iPhone 13 Pro' } });
    expect(buildUpdateHuntRequest({ ...hunt, name: 'Flip stock' }, changed, ZA)).toMatchObject({ request: { name: 'Flip stock' } });
  });

  it("keeps the hunt's own currency and shows the radius in the user's unit", () => {
    const ctx = editContext(hunt, US);
    expect(ctx.currency).toBe('ZAR');
    expect(huntFormValues(hunt, ctx).radius).toBe('25'); // 40 km ~ 25 mi
    expect(buildUpdateHuntRequest(hunt, { ...huntFormValues(hunt, ctx), maxPrice: 'lots' }, ctx)).toMatchObject({ ok: false, errors: { maxPrice: expect.any(String) } });
  });
});
