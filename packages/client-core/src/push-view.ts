/**
 * Push permission / registration copy for the mobile app. Permission is only ever asked after
 * the user's first Hunt goes live (never on launch); whatever the answer, alerts stay in the
 * in-app inbox, so a "no" is never a dead end.
 */
import { translator, type MessageKey, type Translator } from '@rein-drop/i18n';

export type PushUnavailableReason =
  /** iOS simulator etc.: no push token without a physical phone. */
  | 'not_a_device'
  /** A development / store build without an EAS project id configured. */
  | 'no_project_id'
  | 'web';

export type PushState =
  | { status: 'checking' }
  /** Never asked yet. */
  | { status: 'undetermined' }
  /** canAskAgain false = the OS won't show the prompt again; only system settings can change it. */
  | { status: 'denied'; canAskAgain: boolean }
  /** Permission granted and this phone is registered. `simulated` = development token (Expo Go). */
  | { status: 'enabled'; deviceId: string; simulated: boolean }
  | { status: 'unavailable'; reason: PushUnavailableReason }
  | { status: 'error'; message: string };

export interface PushView {
  title: string;
  body: string;
  /** Primary action, if any. */
  action: 'enable' | 'open_settings' | 'disable' | null;
  actionLabel: string | null;
  /** Show "Not now" (only when asking). */
  canDismiss: boolean;
  tone: 'info' | 'success' | 'warning';
}

export const PUSH_UNAVAILABLE_COPY: Record<PushUnavailableReason, string> = {
  not_a_device: 'Push needs a physical phone.',
  no_project_id: "This build isn't set up for push yet (no EAS project).",
  web: 'Push notifications are only available in the mobile app.',
};
const UNAVAILABLE_KEY: Record<PushUnavailableReason, MessageKey> = {
  not_a_device: 'notifications.pushUnavailableNotDevice',
  no_project_id: 'notifications.pushUnavailableNoProject',
  web: 'notifications.pushUnavailableWeb',
};
/** Why push is unavailable, in the UI language. Use this; the English PUSH_UNAVAILABLE_COPY will be removed in step 89. */
export function pushUnavailableCopy(reason: PushUnavailableReason, t: Translator): string {
  return t(UNAVAILABLE_KEY[reason]);
}

/** Copy for the push state. Sentences are separate messages, joined with a space. */
export function pushView(state: PushState, t: Translator = translator('en')): PushView | null {
  const inbox = t('notifications.pushInbox');
  switch (state.status) {
    case 'checking':
      return null;
    case 'undetermined':
      return {
        title: t('notifications.pushAskTitle'),
        body: t('notifications.pushAskBody'),
        action: 'enable',
        actionLabel: t('notifications.pushTurnOn'),
        canDismiss: true,
        tone: 'info',
      };
    case 'denied':
      return {
        title: t('notifications.pushOffTitle'),
        body: `${inbox} ${t(state.canAskAgain ? 'notifications.pushOffCanAsk' : 'notifications.pushOffBlocked')}`,
        action: state.canAskAgain ? 'enable' : 'open_settings',
        actionLabel: t(state.canAskAgain ? 'notifications.pushTurnOn' : 'notifications.pushOpenSettings'),
        canDismiss: false,
        tone: 'warning',
      };
    case 'enabled':
      return {
        title: t('notifications.pushOnTitle'),
        body: t(state.simulated ? 'notifications.pushOnSimulated' : 'notifications.pushOnBody'),
        action: 'disable',
        actionLabel: t('notifications.pushTurnOff'),
        canDismiss: false,
        tone: 'success',
      };
    case 'unavailable':
      return { title: t('notifications.pushUnavailableTitle'), body: `${pushUnavailableCopy(state.reason, t)} ${inbox}`, action: null, actionLabel: null, canDismiss: false, tone: 'info' };
    case 'error':
      return {
        title: t('notifications.pushErrorTitle'),
        body: `${inbox} ${t('notifications.pushErrorRetry')}`,
        action: 'enable',
        actionLabel: t('notifications.pushTryAgain'),
        canDismiss: true,
        tone: 'warning',
      };
  }
}
