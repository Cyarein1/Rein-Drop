import { useCallback, useEffect, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { ApiError, type Hunt, type HuntActivity, type HuntEvent, type MarketplaceKey } from '@rein-drop/api-client';
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
import { space } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { MarketplaceMark } from '@/brand/MarketplaceMark';
import { ProductState } from '@/components/ProductState';
import { getApiClient } from '@/config/api';
import { useDisplayContext } from '@/i18n/useT';
import { ActionBar, Badge, Button, colors, font, Icon, icons, ListRow, ListSection, LoadingState, RowIcon, Screen, SystemBanner, type } from '@/ui';

/** loadedAt is "now" for every relative time on screen (render stays pure). */
type Loaded = { hunt: Hunt; activity: HuntActivity; events: HuntEvent[]; loadedAt: Date };
type State = { status: 'loading' } | { status: 'ready'; data: Loaded } | { status: 'error'; message: string; notFound: boolean };
type Transition = 'pause' | 'resume' | 'archive' | 'restore';

/** While the first scan runs, look again this often (stops once it's done). */
const SCAN_REFRESH_MS = 10_000;
const ARCHIVE_ICON = { ios: 'archivebox', android: 'archive' } as const;

/** Hunt detail: status, counts, monitoring per marketplace, criteria, history and lifecycle actions. */
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
  const actions = huntActions(hunt.status);
  // The first action is the main one (Start watching / Pause / Resume / Restore): the sticky bar.
  const [primary, ...others] = actions;

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
  const perform = (action: HuntDetailAction) => {
    switch (action) {
      case 'start':
        return router.push({ pathname: '/hunts/[id]/start', params: { id: hunt.id } });
      case 'edit':
        return router.push({ pathname: '/hunts/[id]/edit', params: { id: hunt.id } });
      case 'resume':
      case 'restore':
        return void run(action);
      case 'pause':
      case 'archive':
        return confirm(action);
      default:
        return undefined;
    }
  };
  const actionIcon = (action: HuntDetailAction) =>
    action === 'edit' ? icons.edit : action === 'pause' ? icons.pause : action === 'archive' ? ARCHIVE_ICON : icons.play;

  const footer = primary ? (
    <ActionBar>
      <Button
        size="large"
        fullWidth
        variant={primary === 'pause' ? 'secondary' : 'primary'}
        loading={busy && (primary === 'resume' || primary === 'restore')}
        disabled={busy}
        onPress={() => perform(primary)}
      >
        {huntActionLabel(primary, t)}
      </Button>
    </ActionBar>
  ) : undefined;

  const stats: { label: string; value: number }[] = [
    { label: t('hunts.metricDeals'), value: activity.counts.deals },
    { label: t('hunts.metricToReview'), value: activity.counts.toReview },
    { label: t('hunts.metricAlerts'), value: activity.counts.alerts },
    { label: t('hunts.metricSaved'), value: activity.counts.saved },
    { label: t('hunts.metricBought'), value: activity.counts.bought },
  ];

  return (
    <Screen variant="grouped" footer={footer}>
      <Stack.Screen options={{ title: hunt.name }} />

      <View style={styles.summary}>
        <Badge tone={status.tone}>{status.label}</Badge>
        {!firstScan && (
          <View style={styles.monitoring}>
            {monitoring.scanning && <ActivityIndicator size="small" color={colors.textMuted} />}
            {monitoring.tone === 'fresh' && <Icon name={icons.warning} color={colors.warningText} size={15} />}
            <Text style={[styles.monitoringText, font('regular'), monitoring.tone === 'fresh' && styles.warn]}>{monitoring.text}</Text>
          </View>
        )}
      </View>
      {firstScan && <ProductState view={firstScan} />}
      {noDeals && <ProductState view={noDeals} />}
      {notice && (
        <SystemBanner tone={notice.error ? 'error' : 'success'} title={notice.error ? t('hunts.actionFailed') : notice.text} message={notice.error ? notice.text : undefined} />
      )}

      <ListSection title={t('hunts.performance')}>
        <View style={[styles.stats, activity.counts.deals > 0 && styles.separator]}>
          {stats.map((s) => (
            <View key={s.label} style={styles.stat} accessible accessibilityLabel={t('hunts.labelValue', { label: s.label, value: s.value })}>
              <Text style={[styles.statValue, font('bold')]}>{s.value}</Text>
              <Text style={[styles.statLabel, font('regular')]} numberOfLines={2}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
        {activity.counts.deals > 0 && <ListRow title={t('hunts.openDeals')} onPress={() => router.push('/deals')} last />}
      </ListSection>

      <ListSection title={t('hunts.monitoring')} footer={t('hunts.priorityNormal')}>
        {hunt.status === 'DRAFT' ? (
          <ListRow title={t('hunts.draftMonitoring')} last />
        ) : (
          marketplaceRows(hunt, activity, loadedAt, t).map((row, i, all) => {
            const marketplace = activity.marketplaces[i]!.marketplace;
            return (
              <ListRow
                key={marketplace}
                leading={<MarketLogo marketplace={marketplace} />}
                title={row.name}
                subtitle={row.detail}
                trailing={<Badge tone={row.status.tone}>{row.status.label}</Badge>}
                accessibilityLabel={t('hunts.rowA11y', { name: row.name, status: row.status.label, detail: row.detail })}
                last={i === all.length - 1}
              />
            );
          })
        )}
      </ListSection>

      <ListSection title={t('hunts.criteriaTitle')} footer={criteria.sentence}>
        {criteria.items.map((item, i) => (
          <FactRow key={item.label} label={item.label} value={item.value} a11y={t('hunts.labelValue', { label: item.label, value: item.value })} last={i === criteria.items.length - 1} />
        ))}
      </ListSection>
      {criteria.warnings.map((w) => (
        <SystemBanner key={w} tone="warning" title={t('hunts.beforeWatch')} message={w} />
      ))}

      {others.length > 0 && (
        <ListSection title={t('hunts.manageTitle')}>
          {others.map((action, i) => (
            <ListRow
              key={action}
              leading={
                <RowIcon>
                  <Icon name={actionIcon(action)} color={action === 'archive' ? colors.lossText : colors.text} size={16} />
                </RowIcon>
              }
              title={huntActionLabel(action, t)}
              destructive={action === 'archive'}
              onPress={busy ? undefined : () => perform(action)}
              chevron={action === 'edit'}
              last={i === others.length - 1}
            />
          ))}
        </ListSection>
      )}

      <ListSection title={t('hunts.history')}>
        {[...events].reverse().map((e, i, all) => (
          <ListRow
            key={e.id}
            title={huntEventLabel(e.type, t)}
            value={ageText(Math.max(0, Math.floor((loadedAt.getTime() - Date.parse(e.createdAt)) / 60_000)), t)}
            last={i === all.length - 1}
          />
        ))}
      </ListSection>
    </Screen>
  );
}

/** Marketplace logo in a row's icon tile; the row title names it. */
function MarketLogo({ marketplace }: { marketplace: MarketplaceKey }) {
  return (
    <RowIcon tint={colors.background}>
      <MarketplaceMark marketplace={marketplace} size={marketplace === 'ebay' ? 10 : 22} />
    </RowIcon>
  );
}

/** Label on the left, a value that may wrap on the right (criteria can be long: places, ignored words). */
function FactRow({ label, value, a11y, last }: { label: string; value: string; a11y: string; last: boolean }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={a11y}>
      <View style={[styles.factMain, !last && styles.separator]}>
        <Text style={[styles.factLabel, font('regular')]}>{label}</Text>
        <Text style={[styles.factValue, font('medium')]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: space[2] },
  monitoring: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monitoringText: { flexShrink: 1, color: colors.textMuted, fontSize: type.callout, lineHeight: 19 },
  warn: { color: colors.warningText },
  stats: { flexDirection: 'row', paddingVertical: space[3], paddingHorizontal: space[1], backgroundColor: colors.background },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontSize: type.price },
  statLabel: { color: colors.textMuted, fontSize: type.caption, textAlign: 'center' },
  fact: { paddingLeft: 14, backgroundColor: colors.background },
  factMain: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], minHeight: 44, paddingVertical: 12, paddingRight: 14 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  factLabel: { color: colors.textMuted, fontSize: type.body },
  factValue: { flex: 1, color: colors.text, fontSize: type.body, textAlign: 'right' },
});
