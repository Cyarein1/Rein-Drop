import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { Alert } from '@rein-drop/api-client';
import { alertView, unreadText } from '@rein-drop/client-core';
import { space, tones } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { getApiClient } from '@/config/api';
import { useT } from '@/i18n/useT';
import { Badge, Button, colors, EmptyState, font, GUTTER, Icon, icons, SkeletonRows, SystemBanner, type } from '@/ui';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; alerts: Alert[]; unread: number; refreshing?: boolean };

/** The in-app inbox as a list of rows: every alert Rein Drop sent, newest first. Opening one marks it read. */
export default function AlertsScreen() {
  return (
    <SessionGate>
      <Inbox />
    </SessionGate>
  );
}

function Inbox() {
  const router = useRouter();
  const t = useT();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getApiClient().listAlerts({ limit: 50 }))
      .then(
        (page) => !cancelled && setState({ status: 'ready', alerts: page.items, unread: page.unreadCount }),
        (err: unknown) =>
          !cancelled &&
          // A failed pull-to-refresh keeps what is on screen.
          setState((s) => (s.status === 'ready' ? { ...s, refreshing: false } : { status: 'error', message: err instanceof Error ? err.message : String(err) })),
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

  const ready = state.status === 'ready' ? state : null;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () =>
            ready && ready.unread > 0 ? (
              <Button variant="text" size="small" loading={busy} onPress={markAll}>
                {t('notifications.markAllRead')}
              </Button>
            ) : null,
        }}
      />
      <FlatList
        data={ready?.alerts ?? []}
        keyExtractor={(a) => a.id}
        refreshControl={
          <RefreshControl
            refreshing={!!ready?.refreshing}
            onRefresh={() => {
              if (ready) setState({ ...ready, refreshing: true });
              load();
            }}
            tintColor={colors.text}
            accessibilityLabel={t('common.pullToRefresh')}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {state.status === 'error' && (
              <SystemBanner
                tone="error"
                title={t('notifications.inboxLoadFailed')}
                message={state.message}
                action={
                  <Button
                    variant="secondary"
                    size="small"
                    onPress={() => {
                      setState({ status: 'loading' });
                      load();
                    }}
                  >
                    {t('common.tryAgain')}
                  </Button>
                }
              />
            )}
            {ready && ready.alerts.length > 0 && (
              <Text style={[styles.count, font('medium')]} accessibilityLiveRegion="polite">
                {unreadText(ready.unread, t)}
              </Text>
            )}
            {error && <SystemBanner tone="error" title={t('errors.actionFailed')} message={error} />}
          </View>
        }
        ListEmptyComponent={
          state.status === 'loading' ? (
            <View accessible accessibilityRole="progressbar" accessibilityLabel={t('notifications.inboxLoading')}>
              <SkeletonRows count={6} thumb={10} />
            </View>
          ) : ready ? (
            <EmptyState
              title={t('notifications.inboxEmptyTitle')}
              description={t('notifications.inboxEmptyBody')}
              action={
                <Button variant="secondary" onPress={() => router.push('/deals')}>
                  {t('notifications.openDeals')}
                </Button>
              }
            />
          ) : null
        }
        renderItem={({ item: alert }) => {
          const view = alertView(alert, new Date(), t);
          return (
            <Pressable
              onPress={() => open(alert)}
              accessibilityRole="button"
              accessibilityLabel={t(view.unread ? 'notifications.alertA11yUnread' : 'notifications.alertA11y', { title: view.title, when: view.when })}
              accessibilityHint={view.dealId ? t('deals.openHint') : undefined}
              style={({ pressed }) => [styles.row, view.exceptional && styles.exceptional, pressed && styles.pressed]}
            >
              <View style={styles.dotCol}>{view.unread && <View style={styles.dot} />}</View>
              <View style={styles.main}>
                <View style={styles.meta}>
                  {view.exceptional ? <Badge tone="fresh">{view.kindLabel}</Badge> : <Text style={[styles.kind, font('medium')]}>{view.kindLabel}</Text>}
                  <Text style={[styles.when, font('regular')]}>{view.when}</Text>
                </View>
                <Text style={[styles.title, font(view.unread ? 'semibold' : 'regular')]} numberOfLines={2}>
                  {view.title}
                </Text>
                {view.body && (
                  <Text style={[styles.body, font('regular')]} numberOfLines={2}>
                    {view.body}
                  </Text>
                )}
              </View>
              {view.dealId && <Icon name={icons.chevron} size={14} color={colors.textMuted} />}
            </Pressable>
          );
        }}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: space[8] },
  header: { paddingHorizontal: GUTTER, paddingTop: space[2], gap: space[2] },
  count: { color: colors.textMuted, fontSize: type.subhead, paddingBottom: space[1] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[3],
    paddingLeft: space[2],
    paddingRight: GUTTER,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    backgroundColor: colors.background,
  },
  exceptional: { backgroundColor: tones.fresh.background },
  pressed: { opacity: 0.6 },
  dotCol: { width: 8, alignItems: 'center', alignSelf: 'flex-start', paddingTop: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.action },
  main: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  kind: { color: colors.textMuted, fontSize: type.footnote },
  when: { color: colors.textMuted, fontSize: type.footnote },
  title: { color: colors.text, fontSize: type.body, lineHeight: 20 },
  body: { color: colors.textMuted, fontSize: type.subhead, lineHeight: 18 },
});
