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
import { ageText, joinList, MARKETPLACE_LABEL, type DealTone, type Labelled } from './deal-view.js';
import { buildCreateHuntRequest, huntReview, type HuntFormContext, type HuntFormErrors, type HuntFormValues } from './hunt-form.js';
import { moneyToInput } from './money.js';
import { retryText, sourceIssue, type HuntMonitoringHealth } from './source-view.js';

/**
 * Hunts list / detail / edit view model, shared by web and mobile. "Active" is the user-facing
 * name of LIVE. No Hot Hunt purchase: priority is always shown as Normal.
 */

export const HUNT_STATUS_LABEL: Record<HuntStatus, Labelled> = {
  LIVE: { label: 'Active', tone: 'action' },
  PAUSED: { label: 'Paused', tone: 'info' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};

export type HuntListFilter = 'all' | HuntStatus;

/** List tabs. "All" = everything except archived (archived hunts are history). */
export const HUNT_FILTERS: readonly { value: HuntListFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'LIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export const HUNT_EVENT_LABEL: Record<HuntEventType, string> = {
  CREATED: 'Created',
  EDITED: 'Edited',
  ACTIVATED: 'Started watching',
  PAUSED: 'Paused',
  RESUMED: 'Resumed',
  ARCHIVED: 'Archived',
  RESTORED: 'Restored',
};

const minutesSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));

/** "in 10 min" / "now" for an upcoming check. */
function untilText(iso: string, now: Date): string {
  const minutes = Math.ceil((Date.parse(iso) - now.getTime()) / 60_000);
  if (minutes <= 0) return 'now';
  return minutes < 60 ? `in ${minutes} min` : `in ${Math.round(minutes / 60)} h`;
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
function marketplaceProblem(m: MarketplaceActivity): string | null {
  const name = MARKETPLACE_LABEL[m.marketplace];
  const issue = sourceIssue(m.source);
  if (issue) return `${name} ${issue.phrase}`;
  if (m.lastCheck === 'failed') return `couldn't check ${name} last time`;
  if (m.lastCheck === 'degraded') return `${name} was slow or incomplete last time`;
  return null;
}

/** ok = every marketplace working; partial = some aren't (others continue); impaired = none are. */
export function huntMonitoringHealth(activity: HuntActivity | null): HuntMonitoringHealth {
  if (!activity || activity.marketplaces.length === 0) return 'unknown';
  const problems = activity.marketplaces.filter((m) => marketplaceProblem(m) !== null).length;
  if (problems === 0) return activity.marketplaces.every((m) => m.lastCheck === null && m.source.status === 'unknown') ? 'unknown' : 'ok';
  return problems === activity.marketplaces.length ? 'impaired' : 'partial';
}

/** One line on what monitoring is doing right now. Never "all good" while a source isn't. */
export function monitoringLine(hunt: Pick<Hunt, 'status' | 'marketplaces' | 'archivedAt'>, activity: HuntActivity | null, now: Date = new Date()): MonitoringLine {
  const names = joinList(hunt.marketplaces.map((m) => MARKETPLACE_LABEL[m]));
  const problems = (activity?.marketplaces ?? []).map(marketplaceProblem).filter((p): p is string => p !== null);
  const last = activity?.lastCheckedAt ? `last checked ${ageText(minutesSince(activity.lastCheckedAt, now))}` : null;
  switch (hunt.status) {
    case 'DRAFT':
      return { text: 'Not watching yet', tone: 'neutral', scanning: false };
    case 'ARCHIVED':
      return { text: hunt.archivedAt ? `Archived ${ageText(minutesSince(hunt.archivedAt, now))}` : 'Archived', tone: 'neutral', scanning: false };
    case 'PAUSED':
      return { text: last ? `Paused · ${last}` : 'Paused', tone: 'info', scanning: false };
    case 'LIVE':
      if (activity?.scanning) return { text: `Checking ${names} for the first time…`, tone: 'info', scanning: true };
      if (problems.length > 0) return { text: `${last ? capitalize(last) : 'Watching'} · ${problems.join(' · ')}`, tone: 'fresh', scanning: false };
      return { text: last ? `Watching · ${last}` : `Watching ${names}`, tone: 'action', scanning: false };
  }
}

/** "6 deals · 3 to review · 1 alert", or null when there's nothing yet. */
export function countsLine(activity: HuntActivity | null): string | null {
  if (!activity) return null;
  const c = activity.counts;
  const parts = [
    c.deals > 0 ? `${c.deals} ${c.deals === 1 ? 'deal' : 'deals'}` : null,
    c.toReview > 0 ? `${c.toReview} to review` : null,
    c.alerts > 0 ? `${c.alerts} ${c.alerts === 1 ? 'alert' : 'alerts'}` : null,
    c.bought > 0 ? `${c.bought} bought` : null,
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
export function marketplaceRows(hunt: Pick<Hunt, 'status'>, activity: HuntActivity | null, now: Date = new Date()): MarketplaceRow[] {
  return (activity?.marketplaces ?? []).map((m) => {
    const checked = m.lastCheckedAt ? `Checked ${ageText(minutesSince(m.lastCheckedAt, now))}` : 'Not checked yet';
    const live = hunt.status === 'LIVE';
    // While the source cools down, the next check is its retry time.
    const next = !live ? '' : m.source.nextAttemptAt ? ` · tries again ${retryText(m.source.nextAttemptAt, now)}` : m.nextCheckAt ? ` · next ${untilText(m.nextCheckAt, now)}` : ' · next check soon';
    const issue = sourceIssue(m.source);
    const status: Labelled = issue
      ? { label: issue.label, tone: issue.tone }
      : m.lastCheck === 'failed'
        ? { label: m.failingChecks > 1 ? `${m.failingChecks} failed checks` : 'Last check failed', tone: 'fresh' }
        : m.lastCheck === 'degraded'
          ? { label: 'Incomplete last time', tone: 'fresh' }
          : m.lastCheck === 'ok'
            ? { label: 'OK', tone: 'profit' }
            : { label: live ? 'Starting' : 'Not checked', tone: 'neutral' };
    return { name: MARKETPLACE_LABEL[m.marketplace], status, detail: `${checked}${next}` };
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

export const HUNT_ACTION_LABEL: Record<HuntDetailAction, string> = {
  start: 'Start watching',
  edit: 'Edit',
  pause: 'Pause',
  resume: 'Resume',
  archive: 'Archive',
  restore: 'Restore',
  activate: 'Start watching',
};

/** Confirmation copy for actions that change what Rein Drop does. */
export const HUNT_ACTION_CONFIRM: Partial<Record<HuntAction, string>> = {
  pause: 'Rein Drop stops checking marketplaces for this Hunt until you resume it. Deals found so far stay.',
  archive: 'Archived Hunts stop watching and move to Archived. You can restore one later; it comes back paused.',
};

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

/** The edit form, filled from the saved hunt (money in major units, radius in the user's unit). */
export function huntFormValues(hunt: Hunt, ctx: HuntFormContext): HuntFormValues {
  return {
    query: hunt.query,
    marketplaces: [...hunt.marketplaces],
    locationText: hunt.location?.text ?? '',
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

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
