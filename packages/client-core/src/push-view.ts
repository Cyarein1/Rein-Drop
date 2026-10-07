/**
 * Push permission / registration copy for the mobile app. Permission is only ever asked after
 * the user's first Hunt goes live (never on launch); whatever the answer, alerts stay in the
 * in-app inbox, so a "no" is never a dead end.
 */

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

const INBOX = "You'll still find every alert in your inbox.";

export const PUSH_UNAVAILABLE_COPY: Record<PushUnavailableReason, string> = {
  not_a_device: 'Push needs a physical phone.',
  no_project_id: "This build isn't set up for push yet (no EAS project).",
  web: 'Push notifications are only available in the mobile app.',
};

export function pushView(state: PushState): PushView | null {
  switch (state.status) {
    case 'checking':
      return null;
    case 'undetermined':
      return {
        title: 'Get deal alerts on this phone',
        body: "Rein Drop only notifies you when something clears your Hunt's criteria - not for every match. You can change this anytime.",
        action: 'enable',
        actionLabel: 'Turn on notifications',
        canDismiss: true,
        tone: 'info',
      };
    case 'denied':
      return {
        title: 'Notifications are off',
        body: `${INBOX} ${state.canAskAgain ? 'You can turn them on whenever you like.' : 'To get them on this phone, allow notifications for Rein Drop in your phone settings.'}`,
        action: state.canAskAgain ? 'enable' : 'open_settings',
        actionLabel: state.canAskAgain ? 'Turn on notifications' : 'Open settings',
        canDismiss: false,
        tone: 'warning',
      };
    case 'enabled':
      return {
        title: 'Notifications are on for this phone',
        body: state.simulated
          ? 'Development: Expo Go can\'t receive push, so pushes to this phone are simulated and logged. Every alert is in your inbox.'
          : 'Rein Drop will notify this phone about deals worth acting on.',
        action: 'disable',
        actionLabel: 'Turn off for this phone',
        canDismiss: false,
        tone: 'success',
      };
    case 'unavailable':
      return { title: 'Push is not available here', body: `${PUSH_UNAVAILABLE_COPY[state.reason]} ${INBOX}`, action: null, actionLabel: null, canDismiss: false, tone: 'info' };
    case 'error':
      return {
        title: "Couldn't connect this phone",
        body: `${INBOX} Rein Drop will try again the next time you open the app.`,
        action: 'enable',
        actionLabel: 'Try again',
        canDismiss: true,
        tone: 'warning',
      };
  }
}
