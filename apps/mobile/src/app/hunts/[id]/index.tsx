import { useCallback, useEffect, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ApiError, type Hunt, type HuntActivity, type HuntEvent } from '@rein-drop/api-client';
import {
  ageText,
  firstScanState,
  huntActionConfirm,
  huntActionLabel,
  huntActions,
  huntCriteria,
  huntEventLabel,
  huntStatusLabel,
  marketplaceRows,
  monitoringLine,
  noDealsYetState,
  type HuntDetailAction,
} from '@rein-drop/client-core';
import { fontSize, roles, space, tones } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { ProductState } from '@/components/ProductState';
import { getApiClient } from '@/config/api';
import { useDisplayContext } from '@/i18n/useT';
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
  const context = useDisplayContext();
  const { t } = context;
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

  if (state.status === 'loading') return <LoadingState label={t('hunts.loadingOne')} />;
  if (state.status === 'error') {
    return (
      <Screen>
        <SystemBanner
          tone={state.notFound ? 'info' : 'error'}
          title={state.notFound ? t('hunts.notFoundTitle') : t('hunts.loadOneFailed')}
          message={state.notFound ? t('hunts.notFoundBody') : state.message}
          action={
            state.notFound ? undefined : (
              <Button variant="secondary" onPress={load}>
                {t('hunts.tryAgain')}
              </Button>
            )
          }
        />
      </Screen>
    );
  }

  const { hunt, activity, events, loadedAt } = state.data;
  const status = huntStatusLabel(hunt.status, t);
  const monitoring = monitoringLine(hunt, activity, loadedAt, t);
  const criteria = huntCriteria(hunt, context);
  // Product states by semantic mascot token (approved art or a neutral placeholder).
  const firstScan = firstScanState(hunt, activity, loadedAt, t);
  const noDeals = noDealsYetState(hunt, activity, loadedAt, t);

  const run = async (action: Transition) => {
    setBusy(true);
    setNotice(null);
    try {
      const updated = await getApiClient().transitionHunt(hunt.id, action);
      const done: Record<Transition, string> = {
        pause: t('hunts.donePause'),
        resume: t('hunts.doneResume'),
        archive: t('hunts.doneArchive'),
        restore: updated.status === 'DRAFT' ? t('hunts.doneRestoreDraft') : t('hunts.doneRestorePaused'),
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
  const confirm = (action: 'pause' | 'archive') => {
    const copy = huntActionConfirm(action, t);
    Alert.alert(copy?.title ?? huntActionLabel(action, t), copy?.body, [
      { text: t('hunts.cancel'), style: 'cancel' },
      { text: huntActionLabel(action, t), style: action === 'archive' ? 'destructive' : 'default', onPress: () => void run(action) },
    ]);
  };

  const button = (action: HuntDetailAction) => {
    switch (action) {
      case 'start':
        return (
          <Button key={action} onPress={() => router.push({ pathname: '/hunts/[id]/start', params: { id: hunt.id } })}>
            {t('hunts.actionStart')}
          </Button>
        );
      case 'edit':
        return (
          <Button key={action} variant="secondary" onPress={() => router.push({ pathname: '/hunts/[id]/edit', params: { id: hunt.id } })}>
            {t('hunts.actionEdit')}
          </Button>
        );
      case 'resume':
      case 'restore':
        return (
          <Button key={action} variant={action === 'resume' ? 'primary' : 'secondary'} loading={busy} onPress={() => void run(action)}>
            {huntActionLabel(action, t)}
          </Button>
        );
      case 'pause':
      case 'archive':
        return (
          <Button key={action} variant={action === 'archive' ? 'text' : 'secondary'} disabled={busy} onPress={() => confirm(action)}>
            {huntActionLabel(action, t)}
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
      {firstScan ? (
        <ProductState view={firstScan} />
      ) : (
        <Text style={[styles.body, font('regular'), monitoring.tone === 'fresh' && styles.warn]}>{monitoring.text}</Text>
      )}
      {noDeals && <ProductState view={noDeals} />}
      {notice && <SystemBanner tone={notice.error ? 'error' : 'success'} title={notice.error ? t('hunts.actionFailed') : notice.text} message={notice.error ? notice.text : undefined} />}
      <View style={styles.actions}>{huntActions(hunt.status).map(button)}</View>

      <Card
        title={t('hunts.performance')}
        action={
          activity.counts.deals > 0 ? (
            <Button variant="text" onPress={() => router.push('/deals')}>
              {t('hunts.openDeals')}
            </Button>
          ) : undefined
        }
      >
        <View style={styles.metrics}>
          <Metric label={t('hunts.metricDeals')} value={String(activity.counts.deals)} />
          <Metric label={t('hunts.metricToReview')} value={String(activity.counts.toReview)} />
          <Metric label={t('hunts.metricAlerts')} value={String(activity.counts.alerts)} />
          <Metric label={t('hunts.metricSaved')} value={String(activity.counts.saved)} />
          <Metric label={t('hunts.metricBought')} value={String(activity.counts.bought)} />
        </View>
      </Card>

      <Card title={t('hunts.monitoring')}>
        {hunt.status === 'DRAFT' ? (
          <Text style={[styles.muted, font('regular')]}>{t('hunts.draftMonitoring')}</Text>
        ) : (
          marketplaceRows(hunt, activity, loadedAt, t).map((row) => (
            <View key={row.name} style={styles.row} accessible accessibilityLabel={t('hunts.rowA11y', { name: row.name, status: row.status.label, detail: row.detail })}>
              <View style={styles.rowHead}>
                <Text style={[styles.body, font('semibold')]}>{row.name}</Text>
                <Badge tone={row.status.tone}>{row.status.label}</Badge>
              </View>
              <Text style={[styles.muted, font('regular')]}>{row.detail}</Text>
            </View>
          ))
        )}
        <Text style={[styles.muted, font('regular')]}>{t('hunts.priorityNormal')}</Text>
      </Card>

      <Card title={t('hunts.criteriaTitle')}>
        <Text style={[styles.body, font('regular')]}>{criteria.sentence}</Text>
        {criteria.items.map((item) => (
          <View key={item.label} style={styles.rowHead} accessible accessibilityLabel={t('hunts.labelValue', { label: item.label, value: item.value })}>
            <Text style={[styles.muted, font('regular')]}>{item.label}</Text>
            <Text style={[styles.body, styles.value, font('semibold')]}>{item.value}</Text>
          </View>
        ))}
        {criteria.warnings.map((w) => (
          <SystemBanner key={w} tone="warning" title={t('hunts.beforeWatch')} message={w} />
        ))}
      </Card>

      <Card title={t('hunts.history')}>
        {[...events].reverse().map((e) => (
          <View key={e.id} style={styles.rowHead}>
            <Text style={[styles.body, font('regular')]}>{huntEventLabel(e.type, t)}</Text>
            <Text style={[styles.muted, font('regular')]}>{ageText(Math.max(0, Math.floor((loadedAt.getTime() - Date.parse(e.createdAt)) / 60_000)), t)}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row' },
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
