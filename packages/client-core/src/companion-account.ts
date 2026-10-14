import type { AccessResponse } from '@rein-drop/contracts';

/**
 * Mobile companion account access (decision 0018): what the signed-in account can use right now,
 * from `GET /me/access`, worded neutrally. The companion never sells - no prices, plans to choose,
 * upgrade / subscribe / checkout, or "pay on the web" (guarded by SELLING_WORDS in tests).
 * Data is never deleted when paid access ends: Hunts, inventory and saved deals stay.
 */

export type CompanionAccessKind =
  | 'active'
  | 'trial'
  | 'needs_attention'
  | 'grace'
  | 'ending'
  | 'no_paid_access'
  | 'ended'
  | 'suspended';

export interface CompanionAccessView {
  kind: CompanionAccessKind;
  /** Short badge text. */
  label: string;
  /** Badge tone: fresh = needs attention. */
  tone: 'profit' | 'info' | 'fresh' | 'loss' | 'neutral';
  /** Neutral sentences, most important first. */
  lines: string[];
  /** Paid features are usable now (active, trial, retrying, grace). */
  paidFeatures: boolean;
  /** New Hunts can be created / started (false only while suspended). */
  canUseHunts: boolean;
}

export const NO_PAID_ACCESS_LINE = "This account doesn't currently have access to paid features.";
export const DATA_KEPT_LINE = 'Your Hunts, inventory and saved deals are kept.';

export function companionAccessView(access: AccessResponse, localeTag: string): CompanionAccessView {
  const source = access.products.source;
  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium' }).format(new Date(iso)) : null);
  const planName = source.plan?.name ?? null;

  if (access.suspended || source.state === 'suspended') {
    return {
      kind: 'suspended',
      label: 'Suspended',
      tone: 'loss',
      lines: ["This account's access is suspended by Rein Drop, so Hunts aren't being watched.", DATA_KEPT_LINE],
      paidFeatures: false,
      canUseHunts: false,
    };
  }

  const until = date(source.periodEndsAt);
  switch (source.state) {
    case 'active':
      return source.cancelsAtPeriodEnd && until
        ? { kind: 'ending', label: 'Active', tone: 'profit', lines: [`Your current access continues until ${until}.`], paidFeatures: true, canUseHunts: true }
        : { kind: 'active', label: 'Active', tone: 'profit', lines: [planName ? `Your ${planName} access is active.` : 'Your access is active.'], paidFeatures: true, canUseHunts: true };
    case 'trialing':
      return {
        kind: 'trial',
        label: 'Trial',
        tone: 'info',
        lines: [until ? `Your trial access continues until ${until}.` : 'Your trial access is active.'],
        paidFeatures: true,
        canUseHunts: true,
      };
    case 'past_due':
      return {
        kind: 'needs_attention',
        label: 'Needs attention',
        tone: 'fresh',
        lines: ['Your account needs attention. Your current access continues for now.'],
        paidFeatures: true,
        canUseHunts: true,
      };
    case 'grace_period': {
      const graceUntil = date(source.graceEndsAt);
      return {
        kind: 'grace',
        label: 'Needs attention',
        tone: 'fresh',
        lines: [graceUntil ? `Your current access continues until ${graceUntil}.` : 'Your current access continues for a short time.'],
        paidFeatures: true,
        canUseHunts: true,
      };
    }
    case 'canceled':
    case 'expired':
      return {
        kind: 'ended',
        label: 'Free',
        tone: 'neutral',
        lines: [NO_PAID_ACCESS_LINE, `${DATA_KEPT_LINE} Hunts beyond what's included now are paused, not deleted.`],
        paidFeatures: false,
        canUseHunts: true,
      };
    default:
      // free / none: never had paid access on this account.
      return { kind: 'no_paid_access', label: 'Free', tone: 'neutral', lines: [NO_PAID_ACCESS_LINE], paidFeatures: false, canUseHunts: true };
  }
}

/** "Live Hunts: 1 of 1" / "Saved Hunts: 3 (no limit)". */
export function companionUsageLines(access: AccessResponse): string[] {
  const { activeHunts, savedHunts } = access.products.source.limits;
  const line = (label: string, u: { limit: number | null; used: number }) => `${label}: ${u.used}${u.limit === null ? ' (no limit)' : ` of ${u.limit}`}`;
  return [line('Live Hunts', activeHunts), line('Saved Hunts', savedHunts)];
}

/**
 * Loading the account's access, keyed by the signed-in user so a response for a previous account
 * (account switch, sign-out) is never shown. `stale` keeps the last good answer visible while
 * offline instead of hiding what the person can do.
 */
export type AccessLoad =
  | { status: 'signed_out' }
  | { status: 'loading'; userId: string }
  | { status: 'ready'; userId: string; access: AccessResponse }
  | { status: 'error'; userId: string; reason: 'offline' | 'failed'; stale: AccessResponse | null };

export type AccessLoadEvent =
  | { type: 'signed_in'; userId: string }
  | { type: 'signed_out' }
  | { type: 'loaded'; userId: string; access: AccessResponse }
  | { type: 'failed'; userId: string; reason: 'offline' | 'failed' };

/** The load state as seen by the account signed in now (null = signed out): another account's data never shows. */
export function accessLoadFor(state: AccessLoad, userId: string | null): AccessLoad {
  return userId ? accessLoadReducer(state, { type: 'signed_in', userId }) : { status: 'signed_out' };
}

export function accessLoadReducer(state: AccessLoad, event: AccessLoadEvent): AccessLoad {
  switch (event.type) {
    case 'signed_out':
      return { status: 'signed_out' };
    case 'signed_in':
      // Same user (refresh): keep showing what we have; another user: start clean.
      if (state.status !== 'signed_out' && state.userId === event.userId) return state.status === 'ready' ? state : { status: 'loading', userId: event.userId };
      return { status: 'loading', userId: event.userId };
    case 'loaded':
      if (state.status === 'signed_out' || state.userId !== event.userId) return state;
      return { status: 'ready', userId: event.userId, access: event.access };
    case 'failed': {
      if (state.status === 'signed_out' || state.userId !== event.userId) return state;
      const stale = state.status === 'ready' ? state.access : state.status === 'error' ? state.stale : null;
      return { status: 'error', userId: event.userId, reason: event.reason, stale };
    }
  }
}
