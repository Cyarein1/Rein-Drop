import type { EntitlementEvaluation, Home, Hunt, HuntActivity } from '@rein-drop/contracts';
import { ageText, joinList, MARKETPLACE_LABEL } from './deal-view.js';
import { huntMonitoringHealth } from './hunt-view.js';
import { durationUntilText } from './source-view.js';

/**
 * Polished product states, shared by web and mobile (Mascot Usage Guide section 5, Screenbook
 * frames 31-33). Each state names its PRODUCT_STATE_MASCOTS key; the apps map it to an approved
 * asset or a neutral placeholder (docs/ASSET_TODO.md). Copy is calm and specific: what is
 * happening, what Rein Drop does next, and the one useful thing the user can do.
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

const minutesSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
const minutesUntil = (iso: string, now: Date) => Math.max(1, Math.ceil((Date.parse(iso) - now.getTime()) / 60_000));
const untilText = (iso: string, now: Date) => {
  const m = minutesUntil(iso, now);
  return durationUntilText(m);
};

// ---------------------------------------------------------------------------
// Initial Hunt working (first scan)
// ---------------------------------------------------------------------------

/** The Hunt's very first check is running. Null otherwise. */
export function firstScanState(hunt: Pick<Hunt, 'id' | 'status'>, activity: HuntActivity | null, now: Date): ProductStateView | null {
  if (hunt.status !== 'LIVE' || !activity?.scanning) return null;
  const details = activity.marketplaces.map((m) =>
    m.lastCheckedAt ? `${MARKETPLACE_LABEL[m.marketplace]}: done ${ageText(minutesSince(m.lastCheckedAt, now))}` : `${MARKETPLACE_LABEL[m.marketplace]}: checking…`,
  );
  return {
    state: 'firstScan',
    title: 'Rein Drop is checking for the first time',
    body: `It's looking through ${joinList(activity.marketplaces.map((m) => MARKETPLACE_LABEL[m.marketplace]))} for listings that fit your Hunt. This usually takes a minute or two, and this page updates by itself.`,
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
): ProductStateView | null {
  if (hunt.status !== 'LIVE' || !activity || activity.scanning || activity.counts.deals > 0) return null;
  if (huntMonitoringHealth(activity) !== 'ok') return null;
  const last = activity.lastCheckedAt ? `Last checked ${ageText(minutesSince(activity.lastCheckedAt, now))}` : null;
  const next = activity.marketplaces.map((m) => m.nextCheckAt).filter((t): t is string => t !== null).sort()[0];
  const hoursLive = hunt.activatedAt ? (now.getTime() - Date.parse(hunt.activatedAt)) / 3_600_000 : 0;
  const quietForLong = hoursLive >= NO_DEALS_TUNE_AFTER_HOURS;
  return {
    state: 'noDealsYet',
    title: 'Watching - nothing has matched yet',
    body: quietForLong
      ? `Your Hunt has been live for ${Math.floor(hoursLive / 24) >= 1 ? `${Math.floor(hoursLive / 24)} ${Math.floor(hoursLive / 24) === 1 ? 'day' : 'days'}` : `${Math.floor(hoursLive)} hours`} without a match. A higher max price, more conditions or a wider area can help.`
      : "Everything is working. Rein Drop keeps checking and tells you when something clears your criteria - that can take a while for a specific item.",
    details: [last, next ? `Next check ${untilText(next, now)}` : null].filter((d): d is string => d !== null),
    actions: [{ label: quietForLong ? 'Broaden criteria' : 'Tune criteria', path: `/hunts/${hunt.id}/edit`, variant: quietForLong ? 'primary' : 'secondary' }],
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
): ProductStateView | null {
  const live = hunts.filter((h) => h.status === 'LIVE');
  if (live.length === 0) return null;
  const of = (id: string) => activity.find((a) => a.huntId === id) ?? null;
  const scanning = live.map((h) => firstScanState(h, of(h.id), now)).find((v) => v !== null);
  if (scanning) return scanning;
  const quiet = live.map((h) => noDealsYetState(h, of(h.id), now));
  if (quiet.some((q) => q === null)) return null;
  const first = quiet[0]!;
  // Several quiet Hunts: tuning starts from the Hunts list.
  return live.length === 1 ? first : { ...first, actions: [{ label: 'Review your Hunts', path: '/hunts', variant: 'secondary' }] };
}

// ---------------------------------------------------------------------------
// After-hours / reduced monitoring (placeholder: the API reports 'normal' until D22 / D7)
// ---------------------------------------------------------------------------

export function reducedMonitoringState(monitoring: Home['monitoring'], now: Date, ctx: { localeTag: string }): ProductStateView | null {
  if (monitoring.mode !== 'reduced') return null;
  let resumes: string | null = null;
  if (monitoring.resumesAt) {
    try {
      resumes = new Intl.DateTimeFormat(ctx.localeTag, { hour: 'numeric', minute: '2-digit' }).format(new Date(monitoring.resumesAt));
    } catch {
      resumes = untilText(monitoring.resumesAt, now);
    }
  }
  const cadence = monitoring.checksEveryMinutes ? `every ${monitoring.checksEveryMinutes} min` : 'less often';
  return {
    state: 'reducedMonitoring',
    title: monitoring.reason === 'plan_cadence' ? 'Checking at your plan’s pace' : 'Quiet hours - checking less often',
    body:
      monitoring.reason === 'plan_cadence'
        ? `Your plan checks marketplaces ${cadence}. Strong deals still reach you as soon as they're found.`
        : `Rein Drop checks ${cadence} overnight${resumes ? ` and goes back to normal at ${resumes}` : ''}. Strong deals still reach you as soon as they're found.`,
    details: [],
    actions: monitoring.reason === 'plan_cadence' ? [{ label: 'See plans', path: '/settings', variant: 'secondary' }] : [],
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
export function planLimitState(entitlements: Pick<EntitlementEvaluation, 'usage' | 'remaining' | 'entitlements'>, hunts: readonly Pick<Hunt, 'id' | 'name' | 'status'>[]): ProductStateView | null {
  const limit = entitlements.entitlements.activeHunts.limit;
  const drafts = hunts.filter((h) => h.status === 'DRAFT');
  const live = hunts.filter((h) => h.status === 'LIVE');
  if (limit === null || entitlements.remaining.activeHunts !== 0 || drafts.length === 0 || live.length === 0) return null;
  const first = drafts[0]!;
  return {
    state: 'suggestion',
    title: `Your plan watches ${limit} ${limit === 1 ? 'Hunt' : 'Hunts'} at a time`,
    body: `${drafts.length === 1 ? `"${first.name}" is` : `${drafts.length} drafts are`} saved and ready. Pause ${live.length === 1 ? `"${live[0]!.name}"` : 'a live Hunt'} to watch ${drafts.length === 1 ? 'it' : 'one'} instead, or upgrade to watch more. Nothing is lost either way.`,
    details: [],
    actions: [
      { label: 'See options', path: `/hunts/${first.id}/start`, variant: 'primary' },
      { label: 'Manage live Hunts', path: '/hunts?status=LIVE', variant: 'text' },
    ],
    live: false,
  };
}

// ---------------------------------------------------------------------------
// Cancellation flow (placeholder until billing exists - D2)
// ---------------------------------------------------------------------------

export interface CancellationView extends ProductStateView {
  /** What happens if they cancel - reassuring and factual. */
  consequences: string[];
  /** The flow can't complete yet: billing isn't connected. */
  available: false;
  unavailableReason: string;
}

export function cancellationState(plan: { name: string; isFree: boolean }): CancellationView {
  return {
    state: 'cancellation',
    title: plan.isFree ? `You're on the ${plan.name} plan` : `Cancel ${plan.name}?`,
    body: plan.isFree
      ? 'There is nothing to cancel - the Free plan never charges you.'
      : "We're sorry to see you go. Here's exactly what happens, so there are no surprises:",
    details: [],
    consequences: plan.isFree
      ? []
      : [
          'Your Hunts are kept - nothing is ever deleted.',
          'Live Hunts above the Free plan limit are paused; you choose which stay live.',
          'Your inventory, sales and analytics stay exactly as they are.',
          'You can come back to a paid plan at any time.',
        ],
    actions: [{ label: plan.isFree ? 'Back to Settings' : 'Keep my plan', path: '/settings', variant: 'primary' }],
    live: false,
    available: false,
    unavailableReason: 'Cancelling online isn’t available yet - billing is still being set up. Nothing will be charged in the meantime.',
  };
}

// ---------------------------------------------------------------------------
// Development gallery
// ---------------------------------------------------------------------------

/**
 * Sample data for every product state, built through the real view functions - including states
 * the API can't produce yet (reduced monitoring, paid-plan cancellation). Development only.
 */
export function productStateSamples(now: Date): (ProductStateView | CancellationView)[] {
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
    firstScanState(hunt, activity(true), now),
    noDealsYetState(hunt, activity(false), now),
    reducedMonitoringState({ mode: 'reduced', reason: 'quiet_hours', checksEveryMinutes: 60, resumesAt: iso(8 * 60) }, now, { localeTag: 'en' }),
    planLimitState(
      { entitlements: { activeHunts: { limit: 1 } } as never, usage: { activeHunts: 1 }, remaining: { activeHunts: 0 } },
      [
        { id: 'h1', name: 'ps4', status: 'LIVE' },
        { id: 'h2', name: 'PS5', status: 'DRAFT' },
      ],
    ),
    cancellationState({ name: 'Pro', isFree: false }),
  ].filter((v): v is ProductStateView | CancellationView => v !== null);
}
