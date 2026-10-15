import {
  defaultHuntName,
  kmToUnit,
  type CreateHuntRequest,
  type Hunt,
  type HuntAction,
  type HuntActivity,
  type HuntEventType,
  type HuntStatus,
  type UpdateHuntRequest,
} from '@rein-drop/contracts';
import { translator, type MessageKey, type Translator } from '@rein-drop/i18n';
import { ageText, joinList, MARKETPLACE_LABEL, type DealTone, type Labelled } from './deal-view.js';
import { buildCreateHuntRequest, huntReview, type HuntFormContext, type HuntFormErrors, type HuntFormValues } from './hunt-form.js';
import { moneyToInput } from './money.js';
import { durationUntilText, retryText, sourceIssue, sourceIssueText, type HuntMonitoringHealth } from './source-view.js';

/**
 * Hunts list / detail / edit view model, shared by web and mobile. "Active" is the user-facing
 * name of LIVE. No Hot Hunt purchase: priority is always shown as Normal.
 *
 * Text goes through the translator (a trailing `t` parameter, English by default). The exported
 * label constants are English-only and will be removed in step 89 - use the translated accessors
 * (`huntStatusLabel(status, t)`, `huntFilters(t)`, ...).
 */

const EN = (): Translator => translator('en');

const HUNT_STATUS_KEY: Record<HuntStatus, MessageKey> = {
  LIVE: 'hunts.statusLive',
  PAUSED: 'hunts.statusPaused',
  DRAFT: 'hunts.statusDraft',
  ARCHIVED: 'hunts.statusArchived',
};
/** English only - use `huntStatusLabel(status, t)`; will be removed in step 89. */
export const HUNT_STATUS_LABEL: Record<HuntStatus, Labelled> = {
  LIVE: { label: 'Active', tone: 'action' },
  PAUSED: { label: 'Paused', tone: 'info' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};
export function huntStatusLabel(status: HuntStatus, t: Translator = EN()): Labelled {
  return { label: t(HUNT_STATUS_KEY[status]), tone: HUNT_STATUS_LABEL[status].tone };
}

export type HuntListFilter = 'all' | HuntStatus;

/** List tabs. "All" = everything except archived (archived hunts are history). English only - use `huntFilters(t)`; will be removed in step 89. */
export const HUNT_FILTERS: readonly { value: HuntListFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'LIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
];
/** List tabs in the UI language (same order and values as HUNT_FILTERS). */
export function huntFilters(t: Translator = EN()): { value: HuntListFilter; label: string }[] {
  return HUNT_FILTERS.map(({ value }) => ({ value, label: value === 'all' ? t('hunts.filterAll') : t(HUNT_STATUS_KEY[value]) }));
}

const EMPTY_FILTER_KEY: Record<HuntListFilter, MessageKey> = {
  all: 'hunts.emptyAll',
  LIVE: 'hunts.emptyLive',
  PAUSED: 'hunts.emptyPaused',
  DRAFT: 'hunts.emptyDraft',
  ARCHIVED: 'hunts.emptyArchived',
};
/** Empty-list title for a tab, e.g. "No paused Hunts". */
export function huntFilterEmptyTitle(filter: HuntListFilter, t: Translator = EN()): string {
  return t(EMPTY_FILTER_KEY[filter]);
}

const HUNT_EVENT_KEY: Record<HuntEventType, MessageKey> = {
  CREATED: 'hunts.eventCreated',
  EDITED: 'hunts.eventEdited',
  ACTIVATED: 'hunts.eventActivated',
  PAUSED: 'hunts.eventPaused',
  RESUMED: 'hunts.eventResumed',
  ARCHIVED: 'hunts.eventArchived',
  RESTORED: 'hunts.eventRestored',
};
/** English only - use `huntEventLabel(type, t)`; will be removed in step 89. */
export const HUNT_EVENT_LABEL: Record<HuntEventType, string> = {
  CREATED: 'Created',
  EDITED: 'Edited',
  ACTIVATED: 'Started watching',
  PAUSED: 'Paused',
  RESUMED: 'Resumed',
  ARCHIVED: 'Archived',
  RESTORED: 'Restored',
};
export function huntEventLabel(type: HuntEventType, t: Translator = EN()): string {
  return t(HUNT_EVENT_KEY[type]);
}

const minutesSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));

/** "in 10 min" / "now" for an upcoming check. */
function untilText(iso: string, now: Date, t: Translator): string {
  const minutes = Math.ceil((Date.parse(iso) - now.getTime()) / 60_000);
  if (minutes <= 0) return t('common.now');
  return durationUntilText(minutes, t);
}

export interface MonitoringLine {
  text: string;
  tone: DealTone;
  /** First scan running: show the working state (mascot if approved, else a spinner). */
  scanning: boolean;
}

type MarketplaceActivity = HuntActivity['marketplaces'][number];

/**
 * What's wrong with one marketplace for this Hunt, if anything: the source's own state first
 * (it affects everyone), then this Hunt's last check.
 */
function marketplaceProblem(m: MarketplaceActivity, t: Translator): string | null {
  const name = MARKETPLACE_LABEL[m.marketplace];
  const issue = sourceIssueText(m.source, name, t);
  if (issue) return issue;
  if (m.lastCheck === 'failed') return t('hunts.problemCheckFailed', { name });
  if (m.lastCheck === 'degraded') return t('hunts.problemDegraded', { name });
  return null;
}

/** ok = every marketplace working; partial = some aren't (others continue); impaired = none are. */
export function huntMonitoringHealth(activity: HuntActivity | null): HuntMonitoringHealth {
  if (!activity || activity.marketplaces.length === 0) return 'unknown';
  const problems = activity.marketplaces.filter((m) => marketplaceProblem(m, EN()) !== null).length;
  if (problems === 0) return activity.marketplaces.every((m) => m.lastCheck === null && m.source.status === 'unknown') ? 'unknown' : 'ok';
  return problems === activity.marketplaces.length ? 'impaired' : 'partial';
}

/** One line on what monitoring is doing right now. Never "all good" while a source isn't. */
export function monitoringLine(
  hunt: Pick<Hunt, 'status' | 'marketplaces' | 'archivedAt'>,
  activity: HuntActivity | null,
  now: Date = new Date(),
  t: Translator = EN(),
): MonitoringLine {
  const names = joinList(hunt.marketplaces.map((m) => MARKETPLACE_LABEL[m]), t);
  const problems = (activity?.marketplaces ?? []).map((m) => marketplaceProblem(m, t)).filter((p): p is string => p !== null);
  const age = activity?.lastCheckedAt ? ageText(minutesSince(activity.lastCheckedAt, now), t) : null;
  switch (hunt.status) {
    case 'DRAFT':
      return { text: t('hunts.notWatchingYet'), tone: 'neutral', scanning: false };
    case 'ARCHIVED':
      return { text: hunt.archivedAt ? t('hunts.archivedAgo', { age: ageText(minutesSince(hunt.archivedAt, now), t) }) : t('hunts.statusArchived'), tone: 'neutral', scanning: false };
    case 'PAUSED':
      return { text: age ? t('hunts.pausedLastChecked', { age }) : t('hunts.statusPaused'), tone: 'info', scanning: false };
    case 'LIVE':
      if (activity?.scanning) return { text: t('hunts.checkingFirstTime', { names }), tone: 'info', scanning: true };
      if (problems.length > 0) return { text: [age ? t('hunts.lastChecked', { age }) : t('hunts.watching'), ...problems].join(' · '), tone: 'fresh', scanning: false };
      return { text: age ? t('hunts.watchingLastChecked', { age }) : t('hunts.watchingNames', { names }), tone: 'action', scanning: false };
  }
}

/** "6 deals · 3 to review · 1 alert", or null when there's nothing yet. */
export function countsLine(activity: HuntActivity | null, t: Translator = EN()): string | null {
  if (!activity) return null;
  const c = activity.counts;
  const parts = [
    c.deals > 0 ? t('hunts.countDeals', { count: c.deals }) : null,
    c.toReview > 0 ? t('hunts.countToReview', { count: c.toReview }) : null,
    c.alerts > 0 ? t('hunts.countAlerts', { count: c.alerts }) : null,
    c.bought > 0 ? t('hunts.countBought', { count: c.bought }) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The criteria as the Create Hunt review shows them (same sentence + labelled lines). */
export function huntCriteria(hunt: Hunt, ctx: HuntFormContext) {
  return huntReview(toCreateRequest(hunt), ctx);
}

function toCreateRequest(hunt: Hunt): CreateHuntRequest {
  return {
    name: hunt.name,
    query: hunt.query,
    marketplaces: hunt.marketplaces,
    location: hunt.location,
    conditions: hunt.conditions,
    maxPrice: hunt.maxPrice,
    target: hunt.target,
    exclusions: hunt.exclusions,
    priority: hunt.priority,
  };
}

export interface MarketplaceRow {
  name: string;
  status: Labelled;
  detail: string;
}

/** Per-marketplace monitoring rows for the detail screen. */
export function marketplaceRows(hunt: Pick<Hunt, 'status'>, activity: HuntActivity | null, now: Date = new Date(), t: Translator = EN()): MarketplaceRow[] {
  return (activity?.marketplaces ?? []).map((m) => {
    const checked = m.lastCheckedAt ? t('hunts.rowChecked', { age: ageText(minutesSince(m.lastCheckedAt, now), t) }) : t('hunts.rowNotCheckedYet');
    const live = hunt.status === 'LIVE';
    // While the source cools down, the next check is its retry time.
    const next = !live
      ? null
      : m.source.nextAttemptAt
        ? t('hunts.rowTriesAgain', { when: retryText(m.source.nextAttemptAt, now, t) })
        : m.nextCheckAt
          ? t('hunts.rowNext', { when: untilText(m.nextCheckAt, now, t) })
          : t('hunts.rowNextSoon');
    const issue = sourceIssue(m.source, t);
    const status: Labelled = issue
      ? { label: issue.label, tone: issue.tone }
      : m.lastCheck === 'failed'
        ? { label: m.failingChecks > 1 ? t('hunts.rowFailedChecks', { count: m.failingChecks }) : t('hunts.rowLastCheckFailed'), tone: 'fresh' }
        : m.lastCheck === 'degraded'
          ? { label: t('hunts.rowIncomplete'), tone: 'fresh' }
          : m.lastCheck === 'ok'
            ? { label: t('hunts.rowOk'), tone: 'profit' }
            : { label: live ? t('hunts.rowStarting') : t('hunts.rowNotChecked'), tone: 'neutral' };
    return { name: MARKETPLACE_LABEL[m.marketplace], status, detail: next ? `${checked} · ${next}` : checked };
  });
}

export type HuntDetailAction = HuntAction | 'start' | 'edit';

/**
 * What the user can do from here. Activating a draft goes through the plan gate ("start"), not a
 * bare `activate`. Archived hunts are read-only until restored.
 */
export function huntActions(status: HuntStatus): HuntDetailAction[] {
  switch (status) {
    case 'DRAFT':
      return ['start', 'edit', 'archive'];
    case 'LIVE':
      return ['pause', 'edit', 'archive'];
    case 'PAUSED':
      return ['resume', 'edit', 'archive'];
    case 'ARCHIVED':
      return ['restore'];
  }
}

const HUNT_ACTION_KEY: Record<HuntDetailAction, MessageKey> = {
  start: 'hunts.actionStart',
  edit: 'hunts.actionEdit',
  pause: 'hunts.actionPause',
  resume: 'hunts.actionResume',
  archive: 'hunts.actionArchive',
  restore: 'hunts.actionRestore',
  activate: 'hunts.actionStart',
};
/** English only - use `huntActionLabel(action, t)`; will be removed in step 89. */
export const HUNT_ACTION_LABEL: Record<HuntDetailAction, string> = {
  start: 'Start watching',
  edit: 'Edit',
  pause: 'Pause',
  resume: 'Resume',
  archive: 'Archive',
  restore: 'Restore',
  activate: 'Start watching',
};
export function huntActionLabel(action: HuntDetailAction, t: Translator = EN()): string {
  return t(HUNT_ACTION_KEY[action]);
}

const HUNT_ACTION_CONFIRM_KEY: Partial<Record<HuntAction, { title: MessageKey; body: MessageKey }>> = {
  pause: { title: 'hunts.confirmPauseTitle', body: 'hunts.confirmPause' },
  archive: { title: 'hunts.confirmArchiveTitle', body: 'hunts.confirmArchive' },
};
/**
 * Confirmation copy for actions that change what Rein Drop does.
 * English only - use `huntActionConfirm(action, t)`; will be removed in step 89.
 */
export const HUNT_ACTION_CONFIRM: Partial<Record<HuntAction, string>> = {
  pause: 'Rein Drop stops checking marketplaces for this Hunt until you resume it. Deals found so far stay.',
  archive: 'Archived Hunts stop watching and move to Archived. You can restore one later; it comes back paused.',
};
/** Confirmation for actions that change what Rein Drop does ("Pause this Hunt?" + body), or null when none is needed. */
export function huntActionConfirm(action: HuntAction, t: Translator = EN()): { title: string; body: string } | null {
  const keys = HUNT_ACTION_CONFIRM_KEY[action];
  return keys ? { title: t(keys.title), body: t(keys.body) } : null;
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

/** The edit form, filled from the saved hunt (money in major units, radius in the user's unit). */
export function huntFormValues(hunt: Hunt, ctx: HuntFormContext): HuntFormValues {
  return {
    query: hunt.query,
    marketplaces: [...hunt.marketplaces],
    locationText: hunt.location?.text ?? '',
    locationPoint: hunt.location?.point ?? null,
    radius: hunt.location?.radiusKm ? String(kmToUnit(hunt.location.radiusKm, ctx.distanceUnit)) : '',
    conditions: [...hunt.conditions],
    maxPrice: hunt.maxPrice ? moneyToInput(hunt.maxPrice) : '',
    targetKind: hunt.target?.kind ?? 'none',
    targetProfit: hunt.target?.kind === 'profit' ? moneyToInput(hunt.target.amount) : '',
    targetMargin: hunt.target?.kind === 'margin' ? String(hunt.target.percent) : '',
    exclusions: hunt.exclusions.join(', '),
  };
}

/** Context for editing: the hunt's own currency wins over the user's locale. */
export function editContext(hunt: Hunt, ctx: HuntFormContext): HuntFormContext {
  const currency = hunt.maxPrice?.currency ?? (hunt.target?.kind === 'profit' ? hunt.target.amount.currency : null);
  return currency ? { ...ctx, currency } : ctx;
}

/**
 * Edited form -> `PATCH /hunts/:id` body (whole criteria, validated like create). A name the
 * user never changed (the default) follows the new query; a custom name is kept.
 */
export function buildUpdateHuntRequest(
  hunt: Hunt,
  values: HuntFormValues,
  ctx: HuntFormContext,
): { ok: true; request: UpdateHuntRequest; review: CreateHuntRequest } | { ok: false; errors: HuntFormErrors } {
  const built = buildCreateHuntRequest(values, ctx);
  if (!built.ok) return built;
  const name = hunt.name === defaultHuntName(hunt.query) ? defaultHuntName(built.request.query) : hunt.name;
  const { priority: _priority, ...criteria } = built.request;
  return { ok: true, request: { ...criteria, name }, review: { ...built.request, name } };
}
