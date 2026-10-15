import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { Hunt, HuntActivity } from '@rein-drop/api-client';
import {
  countsLine,
  huntFilterEmptyTitle,
  huntFilters,
  huntRowSummary,
  huntStatusLabel,
  monitoringLine,
  planLimitState,
  type HuntFormContext,
  type HuntListFilter,
  type ProductStateView,
} from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { AccessNotice, useCanUseHunts } from '@/access/AccessNotice';
import { MarketplaceName } from '@/brand/MarketplaceMark';
import { LoadStatus } from '@/components/LoadStatus';
import { ProductState } from '@/components/ProductState';
import { LiveSourceBanner } from '@/components/SourceBanner';
import { getApiClient } from '@/config/api';
import { useRefreshable } from '@/data/useRefreshable';
import { useDisplayContext } from '@/i18n/useT';
import { Badge, Button, ChipBar, colors, EmptyState, font, GUTTER, Icon, IconButton, icons, LargeTitleHeader, SkeletonRows, SystemBanner, type } from '@/ui';

type Data = { hunts: Hunt[]; activity: Map<string, HuntActivity>; suggestion: ProductStateView | null };

/** Hunts by state (Active / Paused / Draft / Archived): dense rows with what each one watches and how it's doing. */
export default function HuntsScreen() {
  const router = useRouter();
  const { created } = useLocalSearchParams<{ created?: string }>();
  const [filter, setFilter] = useState<HuntListFilter>('all');
  const canUseHunts = useCanUseHunts();
  const context = useDisplayContext();
  const { t } = context;

  const fetch = useCallback(async (): Promise<Data> => {
    const api = getApiClient();
    const [page, activity, entitlements] = await Promise.all([
      api.listHunts({ limit: 100, ...(filter === 'all' ? {} : { status: filter }) }),
      api.listHuntActivity(),
      // The limit suggestion needs every Hunt (drafts included), so only on the "All" view.
      filter === 'all' ? api.getEntitlements().catch(() => null) : Promise.resolve(null),
    ]);
    return {
      hunts: page.items,
      activity: new Map(activity.map((a) => [a.huntId, a])),
      suggestion: entitlements ? planLimitState(entitlements, page.items, 'companion', t) : null,
    };
  }, [filter, t]);
  // Reloads on focus (e.g. after editing or pausing a Hunt) and when the filter changes.
  const { state: load, refresh, retry } = useRefreshable(fetch, filter);
  const data = load.status === 'ready' ? load.data : null;
  const createdHunt = data && created ? data.hunts.find((h) => h.id === created) : undefined;
  const create = () => router.push('/hunts/new');

  const notices = (
    <View style={styles.notices}>
      <LiveSourceBanner />
      <AccessNotice />
      {data?.suggestion && <ProductState view={data.suggestion} />}
      {createdHunt && <SystemBanner tone="success" title={t('hunts.savedDraftTitle')} message={t('hunts.savedDraftMessage', { name: createdHunt.name })} />}
      {load.status !== 'loading' && <LoadStatus state={load} what={t('hunts.loadWhat')} onRetry={retry} />}
    </View>
  );

  return (
    <View style={styles.fill}>
      <LargeTitleHeader title={t('nav.tabHunts')} actions={canUseHunts ? <IconButton icon={icons.plus} label={t('hunts.create')} onPress={create} /> : undefined}>
        <ChipBar label={t('hunts.listFilterLabel')} chips={huntFilters(t)} value={filter} onChange={setFilter} />
      </LargeTitleHeader>
      {load.status === 'loading' ? (
        <View style={styles.fill}>
          {notices}
          <SkeletonRows count={6} thumb={0} />
        </View>
      ) : (
        <FlatList
          style={styles.fill}
          data={data?.hunts ?? []}
          keyExtractor={(h) => h.id}
          ListHeaderComponent={notices}
          renderItem={({ item }) => (
            <HuntRow
              hunt={item}
              activity={data?.activity.get(item.id) ?? null}
              context={context}
              canStart={canUseHunts}
              onOpen={() => router.push({ pathname: '/hunts/[id]', params: { id: item.id } })}
              onStart={() => router.push({ pathname: '/hunts/[id]/start', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            data ? (
              filter === 'all' ? (
                <EmptyState
                  title={t('hunts.emptyAll')}
                  description={t('hunts.emptyAllBody')}
                  action={canUseHunts ? <Button onPress={create}>{t('hunts.createFirst')}</Button> : undefined}
                />
              ) : (
                <EmptyState title={huntFilterEmptyTitle(filter, t)} />
              )
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={load.status === 'ready' && load.refreshing}
              onRefresh={refresh}
              tintColor={colors.text}
              accessibilityLabel={t('common.pullToRefresh')}
            />
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

/** One Hunt: name + status, what it watches, monitoring and counts. Draft rows keep their Start watching button. */
function HuntRow({
  hunt,
  activity,
  context,
  canStart,
  onOpen,
  onStart,
}: {
  hunt: Hunt;
  activity: HuntActivity | null;
  context: HuntFormContext;
  canStart: boolean;
  onOpen: () => void;
  onStart: () => void;
}) {
  const { t } = context;
  const status = huntStatusLabel(hunt.status, t);
  const monitoring = monitoringLine(hunt, activity, new Date(), t);
  const counts = countsLine(activity, t);
  const summary = huntRowSummary(hunt, context);
  const fresh = activity?.counts.new ?? 0;
  const label = [hunt.name, status.label, summary, fresh > 0 ? t('hunts.rowNew', { count: fresh }) : null, monitoring.text, counts].filter(Boolean).join('. ');
  return (
    <View style={styles.rowWrap}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('hunts.openHint')}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.main}>
          <View style={styles.head}>
            <Text style={[styles.name, font('semibold')]} numberOfLines={2}>
              {hunt.name}
            </Text>
            <Badge tone={status.tone}>{status.label}</Badge>
          </View>
          <Text style={[styles.summary, font('regular')]} numberOfLines={1}>
            {summary}
          </Text>
          <View style={styles.meta}>
            {hunt.marketplaces.map((m) => (
              <MarketplaceName key={m} marketplace={m} size={13} showName={false} />
            ))}
            {fresh > 0 && <Badge tone="fresh">{t('hunts.rowNew', { count: fresh })}</Badge>}
          </View>
          <View style={styles.monitoring}>
            {monitoring.scanning && <ActivityIndicator size="small" color={colors.textMuted} />}
            {monitoring.tone === 'fresh' && <Icon name={icons.warning} color={colors.warningText} size={13} />}
            <Text style={[styles.footnote, font('regular'), monitoring.tone === 'fresh' && styles.warn]} numberOfLines={2}>
              {monitoring.text}
            </Text>
          </View>
          {counts && (
            <Text style={[styles.counts, font('semibold')]} numberOfLines={1}>
              {counts}
            </Text>
          )}
        </View>
        <Icon name={icons.chevron} color={colors.textMuted} size={14} />
      </Pressable>
      {hunt.status === 'DRAFT' && canStart && (
        <View style={styles.start}>
          <Button size="small" variant="secondary" onPress={onStart}>
            {t('hunts.actionStart')}
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  notices: { gap: space[2], paddingHorizontal: GUTTER, paddingTop: space[1], paddingBottom: space[2] },
  listContent: { paddingBottom: space[10] },
  rowWrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: GUTTER, paddingVertical: space[3] },
  pressed: { backgroundColor: colors.grouped },
  main: { flex: 1, gap: 3 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[2] },
  name: { flex: 1, color: colors.text, fontSize: type.headline, lineHeight: 21 },
  summary: { color: colors.text, fontSize: type.callout },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], marginTop: 2 },
  monitoring: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footnote: { flexShrink: 1, color: colors.textMuted, fontSize: type.footnote },
  warn: { color: colors.warningText },
  counts: { color: colors.text, fontSize: type.subhead },
  start: { flexDirection: 'row', paddingHorizontal: GUTTER, paddingBottom: space[3], marginTop: -space[1] },
});
