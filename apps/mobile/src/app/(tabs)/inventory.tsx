import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import type { InventoryItem } from '@rein-drop/api-client';
import { inventoryEmptyText, inventoryFilters, inventoryRowView, type InventoryFilter } from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { useCapabilities } from '@/capabilities/CapabilitiesProvider';
import { InventoryRow } from '@/components/InventoryRow';
import { LoadStatus } from '@/components/LoadStatus';
import { getApiClient } from '@/config/api';
import { useRefreshable } from '@/data/useRefreshable';
import { useDisplayContext } from '@/i18n/useT';
import { ListingsHeaderButton } from '@/navigation/options';
import { Button, ChipBar, colors, EmptyState, GUTTER, LargeTitleHeader, SkeletonRows, SystemBanner } from '@/ui';

const PAGE_SIZE = 20;

/**
 * Inventory (screen 21): bought items as dense rows - holding time and Mark sold; sold items with
 * realized results. Filter chips scroll sideways; the storefront button opens Your listings (Sell).
 */
export default function InventoryScreen() {
  const router = useRouter();
  const context = useDisplayContext();
  const { t } = context;
  const caps = useCapabilities();
  const [filter, setFilter] = useState<InventoryFilter>('holding');
  const [more, setMore] = useState<'idle' | 'loading' | string>('idle');

  const fetch = useCallback(() => getApiClient().listInventory({ status: filter, limit: PAGE_SIZE }), [filter]);
  const { state, refresh, retry, update } = useRefreshable(fetch, filter);
  const page = state.status === 'ready' ? state.data : null;

  const showMore = async () => {
    if (!page?.nextCursor || more === 'loading') return;
    setMore('loading');
    try {
      const next = await getApiClient().listInventory({ status: filter, limit: PAGE_SIZE, cursor: page.nextCursor });
      update((p) => ({ ...p, items: [...p.items, ...next.items.filter((i: InventoryItem) => !p.items.some((x) => x.id === i.id))], nextCursor: next.nextCursor }));
      setMore('idle');
    } catch (err) {
      setMore(err instanceof Error ? err.message : String(err));
    }
  };

  const empty = inventoryEmptyText(filter, t);
  const failedMore = more !== 'idle' && more !== 'loading';
  return (
    <View style={styles.screen}>
      <LargeTitleHeader title={t('nav.tabInventory')} actions={caps['sell.workspace'].available ? <ListingsHeaderButton /> : undefined}>
        <ChipBar
          label={t('inventory.filterLegend')}
          chips={inventoryFilters(t)}
          value={filter}
          onChange={(v) => {
            setMore('idle');
            setFilter(v);
          }}
        />
      </LargeTitleHeader>
      {state.status === 'loading' ? (
        <SkeletonRows thumb={56} />
      ) : (
        <FlatList
          data={page?.items ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <InventoryRow view={inventoryRowView(item, context)} />}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={refresh} tintColor={colors.text} accessibilityLabel={t('common.pullToRefresh')} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (!failedMore) void showMore();
          }}
          ListHeaderComponent={
            <View style={styles.status}>
              <LoadStatus state={state} what={t('inventory.loadWhat')} onRetry={retry} />
            </View>
          }
          ListEmptyComponent={
            page ? (
              <EmptyState
                title={empty.title}
                description={empty.body}
                // The approved "holding box" mascot explains purchase tracking - only when there's nothing yet.
                mascot={filter === 'sold' ? undefined : 'inventory'}
                action={
                  filter === 'sold' ? (
                    <Button variant="secondary" onPress={() => setFilter('holding')}>
                      {t('inventory.seeHolding')}
                    </Button>
                  ) : (
                    <Button onPress={() => router.navigate('/deals')}>{t('inventory.goToDeals')}</Button>
                  )
                }
              />
            ) : null
          }
          ListFooterComponent={
            <View style={styles.footer}>
              {more === 'loading' && <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />}
              {failedMore && (
                <SystemBanner
                  tone="error"
                  title={t('inventory.loadMoreFailed')}
                  message={more}
                  action={
                    <Button variant="secondary" size="small" onPress={() => void showMore()}>
                      {t('inventory.showMore')}
                    </Button>
                  }
                />
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  status: { paddingHorizontal: GUTTER },
  footer: { paddingHorizontal: GUTTER, paddingVertical: space[4], gap: space[3] },
});
