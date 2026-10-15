import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Hunt, HuntActivity } from '@rein-drop/api-client';
import {
  countsLine,
  huntFilterEmptyTitle,
  huntFilters,
  huntStatusLabel,
  monitoringLine,
  planLimitState,
  type HuntListFilter,
  type ProductStateView,
} from '@rein-drop/client-core';
import { fontSize, radius, roles, size, space, tones } from '@rein-drop/design-tokens';
import { AccessNotice, useCanUseHunts } from '@/access/AccessNotice';
import { MarketplaceName } from '@/brand/MarketplaceMark';
import { LoadStatus } from '@/components/LoadStatus';
import { ProductState } from '@/components/ProductState';
import { LiveSourceBanner } from '@/components/SourceBanner';
import { getApiClient } from '@/config/api';
import { useRefreshable } from '@/data/useRefreshable';
import { useT } from '@/i18n/useT';
import { Badge, Button, Card, ChoiceGroup, EmptyState, font, Screen, SystemBanner } from '@/ui';

type Data = { hunts: Hunt[]; activity: Map<string, HuntActivity>; suggestion: ProductStateView | null };

/** Hunts by state (Active / Paused / Draft / Archived), with monitoring and simple counts. */
export default function HuntsScreen() {
  const router = useRouter();
  const { created } = useLocalSearchParams<{ created?: string }>();
  const [filter, setFilter] = useState<HuntListFilter>('all');
  const canUseHunts = useCanUseHunts();
  const t = useT();

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
  const state = load.status === 'ready' ? { status: 'ready' as const, ...load.data } : load;
  const createdHunt = state.status === 'ready' && created ? state.hunts.find((h) => h.id === created) : undefined;
  return (
    <Screen description={t('hunts.listDescription')} onRefresh={refresh} refreshing={load.status === 'ready' && load.refreshing}>
      <LiveSourceBanner />
      <AccessNotice />
      {state.status === 'ready' && state.suggestion && <ProductState view={state.suggestion} />}
      {createdHunt && (
        <SystemBanner tone="success" title={t('hunts.savedDraftTitle')} message={t('hunts.savedDraftMessage', { name: createdHunt.name })} />
      )}
      <ChoiceGroup
        legend={t('hunts.filterLegend')}
        options={huntFilters(t)}
        value={filter}
        onChange={setFilter}
      />
      <LoadStatus state={load} what={t('hunts.loadWhat')} onRetry={retry} />
      {state.status === 'ready' && state.hunts.length === 0 && (
        <Card>
          {filter === 'all' ? (
            <EmptyState
              title={t('hunts.emptyAll')}
              description={t('hunts.emptyAllBody')}
              action={canUseHunts ? <Button onPress={() => router.push('/hunts/new')}>{t('hunts.createFirst')}</Button> : undefined}
            />
          ) : (
            <EmptyState title={huntFilterEmptyTitle(filter, t)} />
          )}
        </Card>
      )}
      {state.status === 'ready' &&
        state.hunts.map((hunt) => {
          const status = huntStatusLabel(hunt.status, t);
          const activity = state.activity.get(hunt.id) ?? null;
          const monitoring = monitoringLine(hunt, activity, new Date(), t);
          const counts = countsLine(activity, t);
          return (
            <Pressable
              key={hunt.id}
              onPress={() => router.push({ pathname: '/hunts/[id]', params: { id: hunt.id } })}
              accessibilityRole="button"
              accessibilityLabel={[hunt.name, status.label, monitoring.text, counts].filter(Boolean).join('. ')}
              accessibilityHint={t('hunts.openHint')}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.head}>
                <Text style={[styles.title, font('semibold')]}>{hunt.name}</Text>
                <Badge tone={status.tone}>{status.label}</Badge>
              </View>
              <View style={styles.markets}>
                {hunt.marketplaces.map((m) => (
                  <MarketplaceName key={m} marketplace={m} />
                ))}
                {hunt.location && <Text style={[styles.muted, font('regular')]}>{`· ${hunt.location.text}`}</Text>}
              </View>
              <View style={[styles.monitoring, monitoring.tone === 'fresh' && styles.warn]}>
                {monitoring.scanning && <ActivityIndicator size="small" color={roles.text} />}
                <Text style={[styles.body, font('regular')]}>{monitoring.text}</Text>
              </View>
              {counts && <Text style={[styles.body, font('semibold')]}>{counts}</Text>}
              {hunt.status === 'DRAFT' && canUseHunts && (
                <View>
                  <Button variant="secondary" onPress={() => router.push({ pathname: '/hunts/[id]/start', params: { id: hunt.id } })}>
                    {t('hunts.actionStart')}
                  </Button>
                </View>
              )}
            </Pressable>
          );
        })}
      {state.status === 'ready' && state.hunts.length > 0 && canUseHunts && (
        <View>
          <Button variant="secondary" onPress={() => router.push('/hunts/new')}>
            {t('hunts.create')}
          </Button>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[2], padding: space[4], borderWidth: size.borderWidth, borderColor: roles.border, borderRadius: radius.md, backgroundColor: roles.surface },
  pressed: { opacity: 0.85 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[3] },
  title: { color: roles.text, fontSize: fontSize.lg, flexShrink: 1 },
  monitoring: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  warn: { paddingLeft: space[2], borderLeftWidth: 3, borderLeftColor: tones.fresh.accent },
  body: { color: roles.text, fontSize: fontSize.sm, flexShrink: 1 },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
  markets: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
});
