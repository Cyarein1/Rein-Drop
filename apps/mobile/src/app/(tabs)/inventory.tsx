import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import type { InventoryItem } from '@rein-drop/api-client';
import { inventoryEmptyText, inventoryFilters, inventoryRowView, type InventoryFilter } from '@rein-drop/client-core';
import { InventoryRow } from '@/components/InventoryRow';
import { LoadStatus } from '@/components/LoadStatus';
import { getApiClient } from '@/config/api';
import { useRefreshable } from '@/data/useRefreshable';
import { useDisplayContext } from '@/i18n/useT';
import { Button, Card, ChoiceGroup, EmptyState, Screen, SystemBanner } from '@/ui';

const PAGE_SIZE = 20;

/**
 * Inventory (screen 21): bought items, holding time, Mark sold; sold items with realized results.
 * Source purchase tracking only - product photos and listing workflows arrive with the Sell
 * workspace (capabilities `inventory.photos` / `sell.workspace`, not built), so nothing of them shows.
 */
export default function InventoryScreen() {
  const router = useRouter();
  const context = useDisplayContext();
  const { t } = context;
  const [filter, setFilter] = useState<InventoryFilter>('holding');
  const [more, setMore] = useState<'idle' | 'loading' | string>('idle');

  const fetch = useCallback(() => getApiClient().listInventory({ status: filter, limit: PAGE_SIZE }), [filter]);
  const { state, refresh, retry, update } = useRefreshable(fetch, filter);
  const page = state.status === 'ready' ? state.data : null;

  const showMore = async () => {
    if (!page?.nextCursor) return;
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
  return (
    <Screen description={t('inventory.listDescription')} onRefresh={refresh} refreshing={state.status === 'ready' && state.refreshing}>
      <ChoiceGroup
        legend={t('inventory.filterLegend')}
        options={inventoryFilters(t)}
        value={filter}
        onChange={(v) => {
          setMore('idle');
          setFilter(v);
        }}
      />
      <LoadStatus state={state} what={t('inventory.loadWhat')} onRetry={retry} />
      {page && page.items.length === 0 && (
        <Card>
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
        </Card>
      )}
      {page?.items.map((item) => <InventoryRow key={item.id} view={inventoryRowView(item, context)} />)}
      {more !== 'idle' && more !== 'loading' && <SystemBanner tone="error" title={t('inventory.loadMoreFailed')} message={more} />}
      {page?.nextCursor && (
        <Button variant="secondary" loading={more === 'loading'} onPress={showMore}>
          {t('inventory.showMore')}
        </Button>
      )}
    </Screen>
  );
}
