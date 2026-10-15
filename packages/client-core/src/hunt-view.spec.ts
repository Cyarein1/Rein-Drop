import { displayContext } from './hunt-form.js';
import { describe, expect, it } from 'vitest';
import type { Hunt, HuntActivity } from '@rein-drop/contracts';
import {
  buildUpdateHuntRequest,
  countsLine,
  editContext,
  HUNT_ACTION_CONFIRM,
  HUNT_FILTERS,
  HUNT_STATUS_LABEL,
  huntActionConfirm,
  huntActionLabel,
  huntActions,
  huntCriteria,
  huntEventLabel,
  huntFilterEmptyTitle,
  huntFilters,
  huntFormValues,
  huntStatusLabel,
  marketplaceRows,
  monitoringLine,
} from './hunt-view.js';

const NOW = new Date('2026-10-07T10:00:00.000Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const HEALTHY = { status: 'healthy' as const, reason: null, nextAttemptAt: null };
const ZA = displayContext({ currency: 'ZAR', distanceUnit: 'km' as const, localeTag: 'en-ZA' });
const US = displayContext({ currency: 'USD', distanceUnit: 'mi' as const, localeTag: 'en-US' });

const hunt: Hunt = {
  id: '01990000-0000-7000-8000-000000000001',
  name: 'iPhone 13',
  query: 'iPhone 13',
  status: 'LIVE',
  priority: 'NORMAL',
  marketplaces: ['ebay', 'facebook'],
  location: { text: 'Cape Town', radiusKm: 40, point: null },
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
    { marketplace: 'ebay', lastCheckedAt: ago(5), lastCheck: 'ok', failingChecks: 0, nextCheckAt: new Date(NOW.getTime() + 10 * 60_000).toISOString(), source: HEALTHY },
    { marketplace: 'facebook', lastCheckedAt: ago(7), lastCheck: 'ok', failingChecks: 0, nextCheckAt: null, source: HEALTHY },
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
    const failing = activity({ marketplaces: [{ marketplace: 'facebook', lastCheckedAt: ago(2), lastCheck: 'failed', failingChecks: 3, nextCheckAt: null, source: HEALTHY }] });
    expect(marketplaceRows({ status: 'PAUSED' }, failing, NOW)).toEqual([
      { name: 'Facebook Marketplace', status: { label: '3 failed checks', tone: 'fresh' }, detail: 'Checked 2 min ago' },
    ]);
  });

  it('counts read naturally and stay quiet when empty', () => {
    expect(countsLine(activity())).toBe('6 deals · 3 to review · 1 alert');
    expect(countsLine(activity({ counts: { deals: 0, toReview: 0, new: 0, alerts: 0, saved: 0, bought: 0 } }))).toBeNull();
  });
});

describe('German', () => {
  const DE = displayContext({ currency: 'EUR', distanceUnit: 'km', localeTag: 'de-DE' }, 'de');
  const t = DE.t;

  it('monitoring, counts (plurals) and marketplace rows', () => {
    expect(monitoringLine(hunt, activity(), NOW, t).text).toBe('Beobachtung läuft · zuletzt geprüft vor 5 Min.');
    expect(monitoringLine(hunt, activity({ scanning: true, lastCheckedAt: null }), NOW, t).text).toBe('Erste Prüfung von eBay und Facebook Marketplace…');
    expect(monitoringLine({ ...hunt, status: 'DRAFT' }, null, NOW, t).text).toBe('Noch keine Beobachtung');
    expect(countsLine(activity(), t)).toBe('6 Deals · 3 zu prüfen · 1 Benachrichtigung');
    expect(countsLine(activity({ counts: { deals: 1, toReview: 0, new: 0, alerts: 2, saved: 0, bought: 0 } }), t)).toBe('1 Deal · 2 Benachrichtigungen');
    expect(marketplaceRows(hunt, activity(), NOW, t)[0]).toEqual({ name: 'eBay', status: { label: 'OK', tone: 'profit' }, detail: 'Geprüft vor 5 Min. · nächste Prüfung in 10 Min.' });
  });

  it('labels, tabs, actions and confirmations', () => {
    expect(huntStatusLabel('LIVE', t)).toEqual({ label: 'Aktiv', tone: HUNT_STATUS_LABEL.LIVE.tone });
    expect(huntFilters(t).map((f) => f.label)).toEqual(['Alle', 'Aktiv', 'Pausiert', 'Entwurf', 'Archiviert']);
    expect(huntFilters()).toEqual(HUNT_FILTERS);
    expect(huntFilterEmptyTitle('PAUSED', t)).toBe('Keine pausierten Hunts');
    expect(huntEventLabel('ACTIVATED', t)).toBe('Beobachtung gestartet');
    expect(huntActionLabel('start', t)).toBe('Beobachtung starten');
    expect(huntActionConfirm('pause', t)).toMatchObject({ title: 'Diesen Hunt pausieren?' });
    expect(huntActionConfirm('archive')!.body).toBe(HUNT_ACTION_CONFIRM.archive);
    expect(huntActionConfirm('resume', t)).toBeNull();
  });

  it('the review sentence and form errors', () => {
    const review = huntCriteria(hunt, DE);
    expect(review.sentence).toMatch(/^Rein Drop sucht auf eBay und Facebook Marketplace nach „iPhone 13“ im Umkreis von 40 km um Cape Town, Zustand: gebraucht, zum Preis von höchstens .+\. Bevorzugt werden Deals mit mindestens .+ Gewinn\. Angebote, die „for parts“ oder „cracked“ erwähnen, werden ignoriert\.$/);
    expect(review.items.map((i) => i.label)).toEqual(['Gesucht wird', 'Marktplätze', 'Ort', 'Zustand', 'Höchstpreis', 'Ziel', 'Ausgeschlossen']);
    expect(review.items.find((i) => i.label === 'Ort')?.value).toBe('40 km um Cape Town');
    const bad = buildUpdateHuntRequest(hunt, { ...huntFormValues(hunt, DE), maxPrice: 'viel', radius: '9999', targetKind: 'margin', targetMargin: 'x' }, DE);
    expect(bad).toMatchObject({
      ok: false,
      errors: { maxPrice: 'Gib einen Betrag wie 1500 oder 1500,50 ein', radius: 'Gib eine ganze Zahl zwischen 1 und 500 km ein', targetMargin: 'Gib einen ganzen Prozentwert ein, z. B. 30' },
    });
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
        location: { text: 'Cape Town', radiusKm: 40, point: null },
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
