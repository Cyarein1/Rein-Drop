import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Alert } from '@rein-drop/api-client';
import { alertView, unreadText } from '@rein-drop/client-core';
import { fontSize, radius, roles, size, space, tones } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { getApiClient } from '@/config/api';
import { Badge, Button, Card, EmptyState, font, LoadingState, Screen, SystemBanner } from '@/ui';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; alerts: Alert[]; unread: number };

/** The in-app inbox: every alert Rein Drop sent, newest first. Opening one marks it read. */
export default function AlertsScreen() {
  return (
    <SessionGate>
      <Inbox />
    </SessionGate>
  );
}

function Inbox() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getApiClient().listAlerts({ limit: 50 }))
      .then(
        (page) => !cancelled && setState({ status: 'ready', alerts: page.items, unread: page.unreadCount }),
        (err: unknown) => !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, []);
  useFocusEffect(load);

  const markAll = async () => {
    if (state.status !== 'ready') return;
    setBusy(true);
    setError(null);
    try {
      await getApiClient().markAllAlertsRead();
      const now = new Date().toISOString();
      setState({ ...state, alerts: state.alerts.map((a) => (a.readAt ? a : { ...a, readAt: now })), unread: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const open = (alert: Alert) => {
    if (state.status === 'ready' && !alert.readAt) {
      const now = new Date().toISOString();
      setState({ ...state, alerts: state.alerts.map((a) => (a.id === alert.id ? { ...a, readAt: now } : a)), unread: Math.max(0, state.unread - 1) });
      // Best effort: the deal opens whether or not this lands.
      getApiClient().markAlertRead(alert.id).catch(() => undefined);
    }
    if (alert.dealId) router.push({ pathname: '/deals/[id]', params: { id: alert.dealId } });
  };

  return (
    <Screen>
      {state.status === 'loading' && <LoadingState label="Loading your inbox…" />}
      {state.status === 'error' && (
        <SystemBanner
          tone="error"
          title="Couldn't load your inbox"
          message={state.message}
          action={
            <Button
              variant="secondary"
              onPress={() => {
                setState({ status: 'loading' });
                load();
              }}
            >
              Try again
            </Button>
          }
        />
      )}
      {state.status === 'ready' && state.alerts.length === 0 && (
        <Card>
          <EmptyState
            title="No alerts yet"
            description="Rein Drop alerts you only when a live Hunt finds something worth acting on. Your deals feed shows everything else."
            action={
              <Button variant="secondary" onPress={() => router.push('/deals')}>
                Open deals
              </Button>
            }
          />
        </Card>
      )}
      {state.status === 'ready' && state.alerts.length > 0 && (
        <>
          <View style={styles.toolbar}>
            <Text style={[styles.muted, font('regular')]} accessibilityLiveRegion="polite">
              {unreadText(state.unread)}
            </Text>
            {state.unread > 0 && (
              <Button variant="secondary" loading={busy} onPress={markAll}>
                Mark all read
              </Button>
            )}
          </View>
          {error && <SystemBanner tone="error" title="That didn't work" message={error} />}
          {state.alerts.map((alert) => {
            const view = alertView(alert);
            return (
              <Pressable
                key={view.id}
                onPress={() => open(alert)}
                accessibilityRole="button"
                accessibilityLabel={`${view.unread ? 'Unread. ' : ''}${view.title}. ${view.when}`}
                accessibilityHint={view.dealId ? 'Opens the deal' : undefined}
                style={({ pressed }) => [styles.item, view.unread && styles.unread, view.exceptional && styles.exceptional, pressed && styles.pressed]}
              >
                <View style={styles.meta}>
                  {view.unread && <View style={styles.dot} />}
                  {view.exceptional ? <Badge tone="fresh">{view.kindLabel}</Badge> : <Text style={[styles.muted, font('regular')]}>{view.kindLabel}</Text>}
                  <Text style={[styles.muted, font('regular')]}>· {view.when}</Text>
                </View>
                <Text style={[styles.title, font(view.unread ? 'bold' : 'regular')]}>{view.title}</Text>
                {view.body && <Text style={[styles.muted, font('regular')]}>{view.body}</Text>}
              </Pressable>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  item: { gap: space[1], padding: space[4], borderWidth: size.borderWidth, borderColor: roles.border, borderRadius: radius.md, backgroundColor: roles.surface },
  unread: { borderLeftWidth: 4, borderLeftColor: tones.action.accent },
  exceptional: { backgroundColor: tones.fresh.background },
  pressed: { opacity: 0.85 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  dot: { width: 10, height: 10, borderRadius: radius.full, backgroundColor: tones.action.accent },
  title: { color: roles.text, fontSize: fontSize.md },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
});
