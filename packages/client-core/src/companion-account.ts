import type { AccessResponse } from '@rein-drop/contracts';
import { translator, type Translator } from '@rein-drop/i18n';

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
/** NO_PAID_ACCESS_LINE in the UI language. Use this; the English constant will be removed in step 89. */
export function noPaidAccessLine(t: Translator): string {
  return t('access.noPaidAccess');
}
/** DATA_KEPT_LINE in the UI language. Use this; the English constant will be removed in step 89. */
export function dataKeptLine(t: Translator): string {
  return t('access.dataKept');
}

export function companionAccessView(access: AccessResponse, localeTag: string, t: Translator = translator('en')): CompanionAccessView {
  const source = access.products.source;
  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium' }).format(new Date(iso)) : null);
  const planName = source.plan?.name ?? null;

  if (access.suspended || source.state === 'suspended') {
    return {
      kind: 'suspended',
      label: t('access.labelSuspended'),
      tone: 'loss',
      lines: [t('access.suspendedLine'), dataKeptLine(t)],
      paidFeatures: false,
      canUseHunts: false,
    };
  }

  const until = date(source.periodEndsAt);
  switch (source.state) {
    case 'active':
      return source.cancelsAtPeriodEnd && until
        ? { kind: 'ending', label: t('access.labelActive'), tone: 'profit', lines: [t('access.continuesUntil', { date: until })], paidFeatures: true, canUseHunts: true }
        : {
            kind: 'active',
            label: t('access.labelActive'),
            tone: 'profit',
            lines: [planName ? t('access.planActive', { plan: planName }) : t('access.accessActive')],
            paidFeatures: true,
            canUseHunts: true,
          };
    case 'trialing':
      return {
        kind: 'trial',
        label: t('access.labelTrial'),
        tone: 'info',
        lines: [until ? t('access.trialUntil', { date: until }) : t('access.trialActive')],
        paidFeatures: true,
        canUseHunts: true,
      };
    case 'past_due':
      return {
        kind: 'needs_attention',
        label: t('access.labelNeedsAttention'),
        tone: 'fresh',
        lines: [t('access.needsAttentionLine')],
        paidFeatures: true,
        canUseHunts: true,
      };
    case 'grace_period': {
      const graceUntil = date(source.graceEndsAt);
      return {
        kind: 'grace',
        label: t('access.labelNeedsAttention'),
        tone: 'fresh',
        lines: [graceUntil ? t('access.continuesUntil', { date: graceUntil }) : t('access.continuesShort')],
        paidFeatures: true,
        canUseHunts: true,
      };
    }
    case 'canceled':
    case 'expired':
      return {
        kind: 'ended',
        label: t('access.labelFree'),
        tone: 'neutral',
        lines: [noPaidAccessLine(t), t('access.dataKeptPaused')],
        paidFeatures: false,
        canUseHunts: true,
      };
    default:
      // free / none: never had paid access on this account.
      return { kind: 'no_paid_access', label: t('access.labelFree'), tone: 'neutral', lines: [noPaidAccessLine(t)], paidFeatures: false, canUseHunts: true };
  }
}

/** "Live Hunts: 1 of 1" / "Saved Hunts: 3 (no limit)". */
export function companionUsageLines(access: AccessResponse, t: Translator = translator('en')): string[] {
  const { activeHunts, savedHunts } = access.products.source.limits;
  return [
    activeHunts.limit === null ? t('access.usageLiveUnlimited', { used: activeHunts.used }) : t('access.usageLive', { used: activeHunts.used, limit: activeHunts.limit }),
    savedHunts.limit === null ? t('access.usageSavedUnlimited', { used: savedHunts.used }) : t('access.usageSaved', { used: savedHunts.used, limit: savedHunts.limit }),
  ];
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
