import type { EntitlementEvaluation, Home, Hunt, HuntActivity } from '@rein-drop/contracts';
import { translator, type Translator } from '@rein-drop/i18n';
import { ageText, joinList, MARKETPLACE_LABEL } from './deal-view.js';
import { huntMonitoringHealth } from './hunt-view.js';
import { durationUntilText } from './source-view.js';

/**
 * Polished product states, shared by web and mobile (Mascot Usage Guide section 5, Screenbook
 * frames 31-33). Each state names its PRODUCT_STATE_MASCOTS key; the apps map it to an approved
 * asset or a neutral placeholder (docs/MASCOT_ASSETS.md). Copy is calm and specific: what is
 * happening, what Rein Drop does next, and the one useful thing the user can do.
 *
 * Text goes through the translator: a trailing `t` parameter (English by default), or `ctx.t`.
 */

export type StateKey = 'firstScan' | 'noDealsYet' | 'reducedMonitoring' | 'suggestion' | 'cancellation';

export interface StateAction {
  label: string;
  /** App path (same on web and mobile). */
  path: string;
  variant: 'primary' | 'secondary' | 'text';
}

export interface ProductStateView {
  state: StateKey;
  title: string;
  body: string;
  /** Short facts under the body, e.g. "eBay: checked 2 min ago". */
  details: string[];
  actions: StateAction[];
  /** Polite live region: the state changes by itself (first scan). */
  live: boolean;
}

const EN = (): Translator => translator('en');
const minutesSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
const minutesUntil = (iso: string, now: Date) => Math.max(1, Math.ceil((Date.parse(iso) - now.getTime()) / 60_000));
const untilText = (iso: string, now: Date, t: Translator) => durationUntilText(minutesUntil(iso, now), t);

// ---------------------------------------------------------------------------
// Initial Hunt working (first scan)
// ---------------------------------------------------------------------------

/** The Hunt's very first check is running. Null otherwise. */
export function firstScanState(hunt: Pick<Hunt, 'id' | 'status'>, activity: HuntActivity | null, now: Date, t: Translator = EN()): ProductStateView | null {
  if (hunt.status !== 'LIVE' || !activity?.scanning) return null;
  const details = activity.marketplaces.map((m) => {
    const name = MARKETPLACE_LABEL[m.marketplace];
    return m.lastCheckedAt ? t('states.firstScanDone', { name, age: ageText(minutesSince(m.lastCheckedAt, now), t) }) : t('states.firstScanChecking', { name });
  });
  return {
    state: 'firstScan',
    title: t('states.firstScanTitle'),
    body: t('states.firstScanBody', { names: joinList(activity.marketplaces.map((m) => MARKETPLACE_LABEL[m.marketplace]), t) }),
    details,
    actions: [],
    live: true,
  };
}

// ---------------------------------------------------------------------------
// No deals yet while the Hunt is healthy
// ---------------------------------------------------------------------------

/** Hours a live Hunt can find nothing before suggesting broader criteria. */
export const NO_DEALS_TUNE_AFTER_HOURS = 24;

/**
 * Live, past its first scan, every source working (never shown while a source is degraded - the
 * source status says that), and nothing matched yet. Null otherwise.
 */
export function noDealsYetState(
  hunt: Pick<Hunt, 'id' | 'status' | 'activatedAt'>,
  activity: HuntActivity | null,
  now: Date,
  t: Translator = EN(),
): ProductStateView | null {
  if (hunt.status !== 'LIVE' || !activity || activity.scanning || activity.counts.deals > 0) return null;
  if (huntMonitoringHealth(activity) !== 'ok') return null;
  const last = activity.lastCheckedAt ? t('hunts.lastChecked', { age: ageText(minutesSince(activity.lastCheckedAt, now), t) }) : null;
  const next = activity.marketplaces.map((m) => m.nextCheckAt).filter((at): at is string => at !== null).sort()[0];
  const hoursLive = hunt.activatedAt ? (now.getTime() - Date.parse(hunt.activatedAt)) / 3_600_000 : 0;
  // NO_DEALS_TUNE_AFTER_HOURS is a whole number of days, so a quiet Hunt has been live >= 1 day.
  const quietForLong = hoursLive >= NO_DEALS_TUNE_AFTER_HOURS;
  return {
    state: 'noDealsYet',
    title: t('states.noDealsTitle'),
    body: quietForLong ? t('states.noDealsBodyLong', { days: Math.max(1, Math.floor(hoursLive / 24)) }) : t('states.noDealsBody'),
    details: [last, next ? t('states.nextCheck', { when: untilText(next, now, t) }) : null].filter((d): d is string => d !== null),
    actions: [{ label: quietForLong ? t('states.broadenCriteria') : t('states.tuneCriteria'), path: `/hunts/${hunt.id}/edit`, variant: quietForLong ? 'primary' : 'secondary' }],
    live: false,
  };
}

/**
 * The Deals list before any deal exists: a first scan in progress, or live Hunts that are all
 * healthy and haven't matched anything - said as what it is, not as an empty list. Null = use the
 * normal empty state (no live Hunts, some Hunt has deals, or a source isn't fully working).
 */
export function dealsWaitingState(
  hunts: readonly Pick<Hunt, 'id' | 'status' | 'activatedAt'>[],
  activity: readonly HuntActivity[],
  now: Date,
  t: Translator = EN(),
): ProductStateView | null {
  const live = hunts.filter((h) => h.status === 'LIVE');
  if (live.length === 0) return null;
  const of = (id: string) => activity.find((a) => a.huntId === id) ?? null;
  const scanning = live.map((h) => firstScanState(h, of(h.id), now, t)).find((v) => v !== null);
  if (scanning) return scanning;
  const quiet = live.map((h) => noDealsYetState(h, of(h.id), now, t));
  if (quiet.some((q) => q === null)) return null;
  const first = quiet[0]!;
  // Several quiet Hunts: tuning starts from the Hunts list.
  return live.length === 1 ? first : { ...first, actions: [{ label: t('states.reviewHunts'), path: '/hunts', variant: 'secondary' }] };
}

// ---------------------------------------------------------------------------
// After-hours / reduced monitoring (placeholder: the API reports 'normal' until D22 / D7)
// ---------------------------------------------------------------------------

/** Where a view is shown: the full web app, or a mobile companion app (no selling - decision 0018). */
export type Surface = 'web' | 'companion';

export function reducedMonitoringState(
  monitoring: Home['monitoring'],
  now: Date,
  ctx: { localeTag: string; t?: Translator },
  surface: Surface = 'web',
): ProductStateView | null {
  if (monitoring.mode !== 'reduced') return null;
  const t = ctx.t ?? EN();
  let resumes: string | null = null;
  if (monitoring.resumesAt) {
    try {
      resumes = new Intl.DateTimeFormat(ctx.localeTag, { hour: 'numeric', minute: '2-digit' }).format(new Date(monitoring.resumesAt));
    } catch {
      resumes = untilText(monitoring.resumesAt, now, t);
    }
  }
  const cadence = { hasCadence: monitoring.checksEveryMinutes ? 'yes' : 'no', minutes: monitoring.checksEveryMinutes };
  const plan = monitoring.reason === 'plan_cadence';
  const companion = surface === 'companion';
  return {
    state: 'reducedMonitoring',
    title: plan ? t(companion ? 'states.reducedPlanTitleCompanion' : 'states.reducedPlanTitleWeb') : t('states.reducedQuietTitle'),
    body: plan
      ? t(companion ? 'states.reducedPlanBodyCompanion' : 'states.reducedPlanBodyWeb', cadence)
      : t('states.reducedQuietBody', { ...cadence, hasResumes: resumes ? 'yes' : 'no', resumes }),
    details: [],
    // The companion apps never point to plans (decision 0018).
    actions: plan && surface === 'web' ? [{ label: t('states.seePlans'), path: '/settings', variant: 'secondary' }] : [],
    live: false,
  };
}

// ---------------------------------------------------------------------------
// Actionable Hunt / plan suggestion
// ---------------------------------------------------------------------------

/**
 * At the plan's live-Hunt limit with drafts waiting (Screenbook frame 33 "Limit reached: draft
 * preserved, pause Hunt or upgrade"). Null when there's room or nothing waiting.
 */
export function planLimitState(
  entitlements: Pick<EntitlementEvaluation, 'usage' | 'remaining' | 'entitlements'>,
  hunts: readonly Pick<Hunt, 'id' | 'name' | 'status'>[],
  surface: Surface = 'web',
  t: Translator = EN(),
): ProductStateView | null {
  const limit = entitlements.entitlements.activeHunts.limit;
  const drafts = hunts.filter((h) => h.status === 'DRAFT');
  const live = hunts.filter((h) => h.status === 'LIVE');
  if (limit === null || entitlements.remaining.activeHunts !== 0 || drafts.length === 0 || live.length === 0) return null;
  const first = drafts[0]!;
  // Hunt names are user content: passed through untranslated.
  const waiting = { drafts: drafts.length, draft: first.name, live: live.length, liveName: live[0]!.name };
  if (surface === 'companion') {
    // Decision 0018: neutral "current access" wording, only actions inside that access.
    return {
      state: 'suggestion',
      title: t('states.planLimitTitleCompanion', { limit }),
      body: t('states.planLimitBodyCompanion', waiting),
      details: [],
      actions: [{ label: t('states.manageLiveHunts'), path: '/hunts?status=LIVE', variant: 'primary' }],
      live: false,
    };
  }
  return {
    state: 'suggestion',
    title: t('states.planLimitTitleWeb', { limit }),
    body: t('states.planLimitBodyWeb', waiting),
    details: [],
    actions: [
      { label: t('states.seeOptions'), path: `/hunts/${first.id}/start`, variant: 'primary' },
      { label: t('states.manageLiveHunts'), path: '/hunts?status=LIVE', variant: 'text' },
    ],
    live: false,
  };
}

// ---------------------------------------------------------------------------
// Cancellation flow (web billing: the Stripe portal ends the plan at the period end)
// ---------------------------------------------------------------------------

export interface CancellationView extends ProductStateView {
  /** What happens if they cancel - reassuring and factual (only what the product really does). */
  consequences: string[];
  /** True when the plan can be cancelled online here (a web-billed paid plan). */
  available: boolean;
  /** Why it can't be cancelled here, when it can't. */
  unavailableReason: string | null;
}

export interface CancellationOptions {
  /** A web-billed (Stripe) subscription the billing portal can cancel. */
  canCancelOnline: boolean;
  /** When the paid period ends, already formatted for the user (e.g. "12 Nov 2026"); null if unknown. */
  paidUntil: string | null;
  /** Where to cancel instead, when it can't be done here (e.g. "on the web"), already in the UI language. */
  elsewhere?: string;
}

export function cancellationState(
  plan: { name: string; isFree: boolean },
  options: CancellationOptions = { canCancelOnline: false, paidUntil: null },
  t: Translator = EN(),
): CancellationView {
  // Plan names (Free / Pro / Ultimate) are never translated.
  const name = plan.name;
  return {
    state: 'cancellation',
    title: plan.isFree ? t('states.cancelTitleFree', { plan: name }) : t('states.cancelTitle', { plan: name }),
    body: plan.isFree ? t('states.cancelBodyFree') : t('states.cancelBody'),
    details: [],
    consequences: plan.isFree
      ? []
      : [
          options.paidUntil ? t('states.cancelKeepUntilDate', { plan: name, date: options.paidUntil }) : t('states.cancelKeepUntilEnd', { plan: name }),
          t('states.cancelHuntsKept'),
          t('states.cancelMoveToFree'),
          t('states.cancelDataStays'),
        ],
    actions: [{ label: plan.isFree ? t('states.backToSettings') : t('states.keepMyPlan'), path: '/settings', variant: 'primary' }],
    live: false,
    available: !plan.isFree && options.canCancelOnline,
    unavailableReason: plan.isFree || options.canCancelOnline ? null : (options.elsewhere ?? t('states.cancelUnavailable')),
  };
}

// ---------------------------------------------------------------------------
// Development gallery
// ---------------------------------------------------------------------------

/**
 * Sample data for every product state, built through the real view functions - including states
 * the API can't produce yet (reduced monitoring, paid-plan cancellation). Development only.
 */
export function productStateSamples(now: Date, t: Translator = EN()): (ProductStateView | CancellationView)[] {
  const iso = (min: number) => new Date(now.getTime() + min * 60_000).toISOString();
  const ok = { status: 'healthy' as const, reason: null, nextAttemptAt: null };
  const hunt = { id: '00000000-0000-7000-8000-000000000001', status: 'LIVE' as const, activatedAt: iso(-90) };
  const activity = (scanning: boolean): HuntActivity => ({
    huntId: hunt.id,
    scanning,
    lastCheckedAt: iso(-3),
    marketplaces: [
      { marketplace: 'ebay', lastCheckedAt: iso(-3), lastCheck: 'ok', failingChecks: 0, nextCheckAt: iso(12), source: ok },
      { marketplace: 'facebook', lastCheckedAt: scanning ? null : iso(-4), lastCheck: scanning ? null : 'ok', failingChecks: 0, nextCheckAt: iso(11), source: ok },
    ],
    counts: { deals: 0, toReview: 0, new: 0, alerts: 0, saved: 0, bought: 0 },
  });
  return [
    firstScanState(hunt, activity(true), now, t),
    noDealsYetState(hunt, activity(false), now, t),
    reducedMonitoringState({ mode: 'reduced', reason: 'quiet_hours', checksEveryMinutes: 60, resumesAt: iso(8 * 60) }, now, { localeTag: t.language, t }),
    planLimitState(
      { entitlements: { activeHunts: { limit: 1 } } as never, usage: { activeHunts: 1 }, remaining: { activeHunts: 0 } },
      [
        { id: 'h1', name: 'ps4', status: 'LIVE' },
        { id: 'h2', name: 'PS5', status: 'DRAFT' },
      ],
      'web',
      t,
    ),
    cancellationState({ name: 'Pro', isFree: false }, undefined, t),
  ].filter((v): v is ProductStateView | CancellationView => v !== null);
}
