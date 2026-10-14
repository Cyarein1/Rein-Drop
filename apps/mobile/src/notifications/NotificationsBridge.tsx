import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useSessionState } from '@/auth/SessionProvider';
import { getApiClient } from '@/config/api';
import { loadNotifications } from './load-notifications';
import { refreshPushRegistration } from './push';

type TapData = { alertId?: string; dealId?: string } | undefined;

/**
 * App-wide push plumbing, rendered once inside the session:
 * - once signed in, refreshes this phone's registration - silently, and only if notifications
 *   are already allowed (permission is never requested here);
 * - shows alerts while the app is open, and tapping a notification opens its deal and marks the
 *   alert read (also from a cold start).
 * Where expo-notifications can't load (Expo Go on Android), only the silent refresh runs.
 */
export function NotificationsBridge() {
  const router = useRouter();
  const { state } = useSessionState();
  const signedIn = state.status === 'authenticated';
  const userId = signedIn ? state.session.user.userId : null;
  /** The account this phone's registration was refreshed for (again after an account switch). */
  const refreshedFor = useRef<string | null>(null);
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!userId || refreshedFor.current === userId) return;
    refreshedFor.current = userId;
    void refreshPushRegistration(getApiClient());
  }, [userId]);

  useEffect(() => {
    const Notifications = loadNotifications();
    if (!signedIn || !Notifications) return;
    // Alerts are selective, so they're worth showing while the app is open too.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    const open = (id: string, data: TapData) => {
      if (handled.current.has(id)) return;
      handled.current.add(id);
      if (data?.alertId) getApiClient().markAlertRead(data.alertId).catch(() => undefined);
      if (data?.dealId) router.push({ pathname: '/deals/[id]', params: { id: data.dealId } });
      else router.push('/alerts');
    };
    // Cold start: the app was opened by tapping a notification.
    Notifications.getLastNotificationResponseAsync()
      .then((r) => r && open(r.notification.request.identifier, r.notification.request.content.data as TapData))
      .catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener((r) =>
      open(r.notification.request.identifier, r.notification.request.content.data as TapData),
    );
    return () => subscription.remove();
  }, [signedIn, router]);

  return null;
}
