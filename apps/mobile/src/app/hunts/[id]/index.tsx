import { useCallback, useEffect, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, View } from 'react-native';
import { ApiError, type Hunt, type HuntActivity, type HuntEvent } from '@rein-drop/api-client';
import {
  ageText,
  HUNT_ACTION_CONFIRM,
  HUNT_ACTION_LABEL,
  HUNT_EVENT_LABEL,
  HUNT_STATUS_LABEL,
  huntActions,
  huntCriteria,
  huntFormContext,
  marketplaceRows,
  monitoringLine,
  type HuntDetailAction,
} from '@rein-drop/client-core';
import { fontSize, radius, roles, size, space, tones } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { useSession } from '@/auth/SessionProvider';
import { mascotAssets } from '@/brand/assets';
import { getApiClient } from '@/config/api';
import { Badge, Button, Card, font, LoadingState, Metric, Screen, SystemBanner } from '@/ui';

/** loadedAt is "now" for every relative time on screen (render stays pure). */
type Loaded = { hunt: Hunt; activity: HuntActivity; events: HuntEvent[]; loadedAt: Date };
type State = { status: 'loading' } | { status: 'ready'; data: Loaded } | { status: 'error'; message: string; notFound: boolean };
type Transition = 'pause' | 'resume' | 'archive' | 'restore';

/** While the first scan runs, look again this often (stops once it's done). */
const SCAN_REFRESH_MS = 10_000;

/** Hunt detail: monitoring per marketplace, counts, criteria, history and lifecycle actions. */
export default function HuntScreen() {
  return (
    <SessionGate>
      <HuntDetail />
    </SessionGate>
  );
}

function HuntDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const context = huntFormContext(session.user.locale);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    const api = getApiClient();
    Promise.all([api.getHunt(id), api.getHuntActivity(id), api.listHuntEvents(id)]).then(
      ([hunt, activity, events]) => !cancelled && setState({ status: 'ready', data: { hunt, activity, events, loadedAt: new Date() } }),
      (err: unknown) =>
        !cancelled &&
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
          notFound: err instanceof ApiError && (err.status === 404 || err.code === 'VALIDATION_FAILED'),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);
  useFocusEffect(load);

  const scanning = state.status === 'ready' && state.data.activity.scanning;
  useEffect(() => {
    if (!scanning) return;
    const timer = setInterval(load, SCAN_REFRESH_MS);
    return () => clearInterval(timer);
  }, [scanning, load]);

  if (state.status === 'loading') return <LoadingState label="Loading the Hunt…" />;
  if (state.status === 'error') {
    return (
      <Screen>
        <SystemBanner
          tone={state.notFound ? 'info' : 'error'}
          title={state.notFound ? 'Hunt not found' : "Couldn't load this Hunt"}
          message={state.notFound ? 'It may belong to another account.' : state.message}
          action={
            state.notFound ? undefined : (
              <Button variant="secondary" onPress={load}>
                Try again
              </Button>
            )
          }
        />
      </Screen>
    );
  }

  const { hunt, activity, events, loadedAt } = state.data;
  const status = HUNT_STATUS_LABEL[hunt.status];
  const monitoring = monitoringLine(hunt, activity, loadedAt);
  const criteria = huntCriteria(hunt, context);
  const art = mascotAssets.working;

  const run = async (action: Transition) => {
    setBusy(true);
    setNotice(null);
    try {
      const updated = await getApiClient().transitionHunt(hunt.id, action);
      const done: Record<Transition, string> = {
        pause: 'Paused - nothing is checked until you resume.',
        resume: 'Resumed - Rein Drop is watching again.',
        archive: 'Archived. Restore it any time from Archived.',
        restore: updated.status === 'DRAFT' ? 'Restored as a draft.' : 'Restored as paused. Resume it when you want it to watch again.',
      };
      setNotice({ error: false, text: done[action] });
      load();
    } catch (err) {
      const blocked = err instanceof ApiError ? err.activationBlock?.reasons.map((r) => r.message).join(' ') : undefined;
      setNotice({ error: true, text: blocked || (err instanceof Error ? err.message : String(err)) });
    } finally {
      setBusy(false);
    }
  };
  /** Pause and archive change what Rein Drop does: confirm with a native dialog first. */
  const confirm = (action: 'pause' | 'archive') =>
    Alert.alert(`${HUNT_ACTION_LABEL[action]} this Hunt?`, HUNT_ACTION_CONFIRM[action], [
      { text: 'Cancel', style: 'cancel' },
      { text: HUNT_ACTION_LABEL[action], style: action === 'archive' ? 'destructive' : 'default', onPress: () => void run(action) },
    ]);

  const button = (action: HuntDetailAction) => {
    switch (action) {
      case 'start':
        return (
          <Button key={action} onPress={() => router.push({ pathname: '/hunts/[id]/start', params: { id: hunt.id } })}>
            Start watching
          </Button>
        );
      case 'edit':
        return (
          <Button key={action} variant="secondary" onPress={() => router.push({ pathname: '/hunts/[id]/edit', params: { id: hunt.id } })}>
            Edit
          </Button>
        );
      case 'resume':
      case 'restore':
        return (
          <Button key={action} variant={action === 'resume' ? 'primary' : 'secondary'} loading={busy} onPress={() => void run(action)}>
            {HUNT_ACTION_LABEL[action]}
          </Button>
        );
      case 'pause':
      case 'archive':
        return (
          <Button key={action} variant={action === 'archive' ? 'text' : 'secondary'} disabled={busy} onPress={() => confirm(action)}>
            {HUNT_ACTION_LABEL[action]}
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: hunt.name }} />
      <View style={styles.heading}>
        <Badge tone={status.tone}>{status.label}</Badge>
      </View>
      {scanning ? (
        <View style={styles.scanning} accessibilityRole="progressbar" accessibilityLabel={monitoring.text}>
          {/* Approved "working" mascot only; none exists yet, so the normal loading UI. */}
          {art ? <Image source={art} style={styles.art} accessibilityIgnoresInvertColors /> : <ActivityIndicator color={roles.text} />}
          <View style={styles.flex}>
            <Text style={[styles.body, font('semibold')]}>{monitoring.text}</Text>
            <Text style={[styles.muted, font('regular')]}>Your first results usually appear within a few minutes. This screen updates by itself.</Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.body, font('regular'), monitoring.tone === 'fresh' && styles.warn]}>{monitoring.text}</Text>
      )}
      {notice && <SystemBanner tone={notice.error ? 'error' : 'success'} title={notice.error ? "That didn't work" : notice.text} message={notice.error ? notice.text : undefined} />}
      <View style={styles.actions}>{huntActions(hunt.status).map(button)}</View>

      <Card
        title="Performance"
        action={
          activity.counts.deals > 0 ? (
            <Button variant="text" onPress={() => router.push('/deals')}>
              Open deals
            </Button>
          ) : undefined
        }
      >
        <View style={styles.metrics}>
          <Metric label="Deals found" value={String(activity.counts.deals)} />
          <Metric label="To review" value={String(activity.counts.toReview)} />
          <Metric label="Alerts" value={String(activity.counts.alerts)} />
          <Metric label="Saved" value={String(activity.counts.saved)} />
          <Metric label="Bought" value={String(activity.counts.bought)} />
        </View>
      </Card>

      <Card title="Monitoring">
        {hunt.status === 'DRAFT' ? (
          <Text style={[styles.muted, font('regular')]}>Not watching yet - start watching to begin checking marketplaces.</Text>
        ) : (
          marketplaceRows(hunt, activity, loadedAt).map((row) => (
            <View key={row.name} style={styles.row} accessible accessibilityLabel={`${row.name}: ${row.status.label}. ${row.detail}`}>
              <View style={styles.rowHead}>
                <Text style={[styles.body, font('semibold')]}>{row.name}</Text>
                <Badge tone={row.status.tone}>{row.status.label}</Badge>
              </View>
              <Text style={[styles.muted, font('regular')]}>{row.detail}</Text>
            </View>
          ))
        )}
        <Text style={[styles.muted, font('regular')]}>Priority: Normal</Text>
      </Card>

      <Card title="What Rein Drop watches for">
        <Text style={[styles.body, font('regular')]}>{criteria.sentence}</Text>
        {criteria.items.map((item) => (
          <View key={item.label} style={styles.rowHead} accessible accessibilityLabel={`${item.label}: ${item.value}`}>
            <Text style={[styles.muted, font('regular')]}>{item.label}</Text>
            <Text style={[styles.body, styles.value, font('semibold')]}>{item.value}</Text>
          </View>
        ))}
        {criteria.warnings.map((w) => (
          <SystemBanner key={w} tone="warning" title="Before this Hunt can watch" message={w} />
        ))}
      </Card>

      <Card title="History">
        {[...events].reverse().map((e) => (
          <View key={e.id} style={styles.rowHead}>
            <Text style={[styles.body, font('regular')]}>{HUNT_EVENT_LABEL[e.type]}</Text>
            <Text style={[styles.muted, font('regular')]}>{ageText(Math.max(0, Math.floor((loadedAt.getTime() - Date.parse(e.createdAt)) / 60_000)))}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row' },
  scanning: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderWidth: size.borderWidth, borderColor: roles.border, borderRadius: radius.md, backgroundColor: tones.info.background },
  art: { width: 56, height: 56 },
  flex: { flex: 1, gap: space[1] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: space[5] },
  row: { gap: 2 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3], flexWrap: 'wrap' },
  value: { flexShrink: 1, textAlign: 'right' },
  body: { color: roles.text, fontSize: fontSize.md },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
  warn: { paddingLeft: space[2], borderLeftWidth: 3, borderLeftColor: tones.fresh.accent },
});
