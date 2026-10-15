import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { createTapDeduper, notificationTarget, takePendingTap, type NotificationTarget, type PendingTap } from '@rein-drop/client-core';
import { useSessionState } from '@/auth/SessionProvider';
import { getApiClient } from '@/config/api';
import { loadNotifications } from './load-notifications';
import { refreshPushRegistration } from './push';

/** The screen on show (read by the foreground handler, which runs outside React). */
let currentPath = '/';
/** Alerts already shown while the app was open - a duplicate delivery never shows twice. */
const shownInForeground = new Set<string>();

/**
 * App-wide push plumbing, rendered once at the root (step 84):
 * - Registration: refreshed silently once signed in (never prompts), again for another account,
 *   and whenever the OS rotates the push token.
 * - Foreground: alerts show as a banner - except a duplicate of one already shown, or for the deal
 *   that's already on screen.
 * - Tap (background or closed app): opens the deal and marks the alert read. Payloads carry ids
 *   only and are validated (client-core `notificationTarget`); anything else opens the inbox. A tap
 *   before the session is ready (launching, expired, signed out) waits and opens after sign-in -
 *   never for a different account. Each tap is handled once; the cold-start response is cleared so
 *   a later launch doesn't replay it. Deleted / other-account deals show "Deal not found".
 * Where expo-notifications can't load (Expo Go on Android), only the silent refresh runs.
 */
export function NotificationsBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useSessionState();
  const userId = state.status === 'authenticated' ? state.session.user.userId : null;
  const userRef = useRef<string | null>(userId);
  const refreshedFor = useRef<string | null>(null);
  const pending = useRef<PendingTap | null>(null);
  const firstTap = useRef(createTapDeduper());

  useEffect(() => {
    currentPath = pathname;
  }, [pathname]);

  /** Opens a tap's target (set below, so it always uses the current router). */
  const open = useRef<(target: NotificationTarget) => void>(() => undefined);
  useEffect(() => {
    open.current = (target) => {
      if (target.alertId) getApiClient().markAlertRead(target.alertId).catch(() => undefined);
      if (target.kind === 'deal') router.push({ pathname: '/deals/[id]', params: { id: target.dealId } });
      else router.push('/alerts');
    };
  }, [router]);

  // Signed in (or switched account): refresh this phone's registration, then open a waiting tap.
  useEffect(() => {
    userRef.current = userId;
    if (userId && refreshedFor.current !== userId) {
      refreshedFor.current = userId;
      void refreshPushRegistration(getApiClient());
    }
    const { open: target, keep } = takePendingTap(pending.current, userId);
    pending.current = keep;
    if (target) open.current(target);
  }, [userId]);

  useEffect(() => {
    const Notifications = loadNotifications();
    if (!Notifications) return;
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const target = notificationTarget(notification.request.content.data);
        const duplicate = target.alertId !== null && shownInForeground.has(target.alertId);
        if (target.alertId) shownInForeground.add(target.alertId);
        const onScreen = target.kind === 'deal' && currentPath === `/deals/${target.dealId}`;
        const show = !duplicate && !onScreen;
        return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
      },
    });

    const handle = (notificationId: string, data: unknown) => {
      if (!firstTap.current(notificationId)) return;
      const target = notificationTarget(data);
      if (userRef.current) open.current(target);
      else pending.current = { target, forUserId: null };
    };
    // Cold start: the app was launched by tapping a notification. Cleared once handled.
    Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        if (!r) return;
        handle(r.notification.request.identifier, r.notification.request.content.data);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => undefined);
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => handle(r.notification.request.identifier, r.notification.request.content.data));
    // The OS can rotate the push token while the app runs: register the new one.
    const rotated = Notifications.addPushTokenListener(() => {
      if (userRef.current) void refreshPushRegistration(getApiClient());
    });
    return () => {
      tapped.remove();
      rotated.remove();
    };
  }, []);

  return null;
}
