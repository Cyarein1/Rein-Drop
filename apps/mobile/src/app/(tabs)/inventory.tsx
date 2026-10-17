import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import type { InventoryItem, InventorySection, SellListingView } from '@rein-drop/api-client';
import { inventoryRowView, inventorySections, sellListingViews } from '@rein-drop/client-core';
import type { MessageKey } from '@rein-drop/i18n';
import { space } from '@rein-drop/design-tokens';
import { useCapabilities } from '@/capabilities/CapabilitiesProvider';
import { InventoryRow } from '@/components/InventoryRow';
import { ListingRow } from '@/components/ListingRow';
import { LoadStatus } from '@/components/LoadStatus';
import { getApiClient } from '@/config/api';
import { useRefreshable } from '@/data/useRefreshable';
import { useDisplayContext, useT } from '@/i18n/useT';
import { Button, ChipBar, colors, EmptyState, GUTTER, IconButton, icons, LargeTitleHeader, SkeletonRows, SystemBanner } from '@/ui';

const PAGE_SIZE = 20;
const SECTIONS: readonly InventorySection[] = ['holding', 'listed', 'sold', 'other'];
/** Listing tabs on the phone: Drafts, Active, Discarded (sold / ended listings show under Sold). */
type PhoneListingView = Exclude<SellListingView, 'closed'>;

const EMPTY: Record<Exclude<InventorySection, 'listed'> | PhoneListingView, { title: MessageKey; body: MessageKey }> = {
  holding: { title: 'inventory.emptyTitle', body: 'inventory.emptyBody' },
  sold: { title: 'inventory.emptySoldTitle', body: 'inventory.emptySoldBody' },
  other: { title: 'inventory.emptyOtherTitle', body: 'inventory.emptyOtherBody' },
  drafts: { title: 'sell.emptyDraftsTitle', body: 'sell.emptyDraftsBody' },
  active: { title: 'sell.emptyActiveTitle', body: 'sell.emptyActiveBody' },
  discarded: { title: 'sell.emptyDiscardedTitle', body: 'sell.emptyDiscardedBody' },
};

/** The helpers' labels already carry the count ("Sold (3)"), so the chip shows just the label. */
const chip = <T extends string>(o: { value: T; label: string }) => ({ value: o.value, label: o.label });
const isSection = (v: unknown): v is InventorySection => typeof v === 'string' && (SECTIONS as readonly string[]).includes(v);

/**
 * Sell (decision 0021: Inventory merged into Sell): one area for everything you bought. Sections
 * Holding · Listings · Sold · Other with counts (GET /inventory/counts); Listings has its own tabs
 * Drafts / Active / Discarded (GET /sell/listings?view=). "Add item" (bought outside Rein Drop) sits
 * in the header. Insights stay on the web (companion, decision 0018).
 */
export default function SellScreen() {
  const router = useRouter();
  const t = useT();
  const caps = useCapabilities();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<InventorySection>(isSection(params.section) ? params.section : 'holding');
  const [view, setView] = useState<PhoneListingView>('drafts');
  // A link to /inventory?section=listed (e.g. the old /sell) switches section (adjusted while rendering).
  const [linked, setLinked] = useState(params.section);
  if (params.section !== linked) {
    setLinked(params.section);
    if (isSection(params.section)) setSection(params.section);
  }

  const fetchCounts = useCallback(() => getApiClient().getInventoryCounts(), []);
  const counts = useRefreshable(fetchCounts, 'counts');
  const c = counts.state.status === 'ready' ? counts.state.data : undefined;
  // Without the Sell workspace, Listings shows the items you marked as listed (no listing tabs).
  const listingTabs = section === 'listed' && caps['sell.workspace'].available;

  return (
    <View style={styles.screen}>
      <LargeTitleHeader
        title={t('nav.tabSell')}
        actions={<IconButton icon={icons.plus} label={t('inventory.addItemTitle')} onPress={() => router.push('/inventory/new')} />}
      >
        <ChipBar label={t('sell.sectionsLegend')} chips={inventorySections(t, c).map(chip)} value={section} onChange={setSection} />
        {listingTabs && (
          <ChipBar
            label={t('sell.listingTabsLegend')}
            chips={sellListingViews(t, c?.listings)
              .filter((v): v is { value: PhoneListingView; label: string; count: number | null } => v.value !== 'closed')
              .map(chip)}
            value={view}
            onChange={setView}
          />
        )}
      </LargeTitleHeader>
      {listingTabs ? (
        <ListingsList view={view} onRefreshed={counts.retry} />
      ) : (
        <ItemsList key={section} section={section} onRefreshed={counts.retry} onShowHolding={() => setSection('holding')} />
      )}
    </View>
  );
}

/** Items of one section, newest purchase first, paged. */
function ItemsList({ section, onRefreshed, onShowHolding }: { section: InventorySection; onRefreshed: () => void; onShowHolding: () => void }) {
  const router = useRouter();
  const context = useDisplayContext();
  const { t } = context;
  const [more, setMore] = useState<'idle' | 'loading' | string>('idle');
  const fetch = useCallback(() => getApiClient().listInventory({ section, limit: PAGE_SIZE }), [section]);
  const { state, refresh, retry, update } = useRefreshable(fetch, section);
  const page = state.status === 'ready' ? state.data : null;

  const showMore = async () => {
    if (!page?.nextCursor || more === 'loading') return;
    setMore('loading');
    try {
      const next = await getApiClient().listInventory({ section, limit: PAGE_SIZE, cursor: page.nextCursor });
      update((p) => ({ ...p, items: [...p.items, ...next.items.filter((i: InventoryItem) => !p.items.some((x) => x.id === i.id))], nextCursor: next.nextCursor }));
      setMore('idle');
    } catch (err) {
      setMore(err instanceof Error ? err.message : String(err));
    }
  };

  const failedMore = more !== 'idle' && more !== 'loading';
  const empty = EMPTY[section === 'listed' ? 'active' : section];
  if (state.status === 'loading') return <SkeletonRows thumb={56} />;
  return (
    <FlatList
      data={page?.items ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <InventoryRow view={inventoryRowView(item, context)} />}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={state.status === 'ready' && state.refreshing}
          onRefresh={() => {
            refresh();
            onRefreshed();
          }}
          tintColor={colors.text}
          accessibilityLabel={t('common.pullToRefresh')}
        />
      }
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
            title={t(empty.title)}
            description={t(empty.body)}
            // The approved "holding box" mascot explains purchase tracking - only when nothing is held yet.
            mascot={section === 'holding' ? 'inventory' : undefined}
            action={
              section === 'holding' ? (
                <Button onPress={() => router.push('/inventory/new')}>{t('inventory.addItemTitle')}</Button>
              ) : section === 'sold' || section === 'other' ? (
                <Button variant="secondary" onPress={onShowHolding}>
                  {t('inventory.seeHolding')}
                </Button>
              ) : undefined
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
  );
}

/** Sell listings of one tab (drafts, active, discarded), as photo rows. */
function ListingsList({ view, onRefreshed }: { view: PhoneListingView; onRefreshed: () => void }) {
  const router = useRouter();
  const t = useT();
  const fetch = useCallback(() => getApiClient().listSellListings({ view }), [view]);
  const { state, refresh, retry } = useRefreshable(fetch, view);
  const listings = state.status === 'ready' ? state.data : null;
  const empty = EMPTY[view];
  if (state.status === 'loading') return <SkeletonRows thumb={72} />;
  return (
    <FlatList
      data={listings ?? []}
      keyExtractor={(l) => l.id}
      renderItem={({ item }) => <ListingRow listing={item} onPress={() => router.push({ pathname: '/sell/[id]', params: { id: item.id } })} />}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={state.status === 'ready' && state.refreshing}
          onRefresh={() => {
            refresh();
            onRefreshed();
          }}
          tintColor={colors.text}
          accessibilityLabel={t('common.pullToRefresh')}
        />
      }
      ListHeaderComponent={
        <View style={styles.status}>
          <LoadStatus state={state} what={t('sell.loadWhat')} onRetry={retry} />
        </View>
      }
      ListEmptyComponent={listings ? <EmptyState title={t(empty.title)} description={t(empty.body)} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  status: { paddingHorizontal: GUTTER },
  footer: { paddingHorizontal: GUTTER, paddingVertical: space[4], gap: space[3] },
});
