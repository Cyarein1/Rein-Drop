import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useSessionState } from '@/auth/SessionProvider';
import { getApiClient } from '@/config/api';
import { refreshPushRegistration } from './push';

// Alerts are worth showing while the app is open too (it's a selective channel).
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
} catch {
  // Not supported in this runtime (e.g. web): nothing to show.
}

/**
 * App-wide push plumbing, rendered once inside the session:
 * - once signed in, refreshes this phone's registration - silently, and only if notifications
 *   are already allowed (permission is never requested here);
 * - tapping a notification opens its deal and marks the alert read (also from a cold start).
 */
export function NotificationsBridge() {
  const router = useRouter();
  const { state } = useSessionState();
  const signedIn = state.status === 'authenticated';
  const refreshed = useRef(false);
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn || refreshed.current) return;
    refreshed.current = true;
    void refreshPushRegistration(getApiClient());
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn || !lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const data = lastResponse.notification.request.content.data as { alertId?: string; dealId?: string } | undefined;
    if (data?.alertId) getApiClient().markAlertRead(data.alertId).catch(() => undefined);
    if (data?.dealId) router.push({ pathname: '/deals/[id]', params: { id: data.dealId } });
    else router.push('/alerts');
  }, [signedIn, lastResponse, router]);

  return null;
}
