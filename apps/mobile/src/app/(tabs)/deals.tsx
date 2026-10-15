import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { AccessibilityInfo, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import type { DealStatusFilter, DealSummary, MarketplaceKey } from '@rein-drop/api-client';
import { buildIgnoreRequest, dealActions, dealCardView, dealFilters, dealsWaitingState, MARKETPLACE_LABEL, type ProductStateView } from '@rein-drop/client-core';
import { radius, space } from '@rein-drop/design-tokens';
import { AccessNotice } from '@/access/AccessNotice';
import { MarketplaceMark } from '@/brand/MarketplaceMark';
import { DealCard } from '@/components/DealCard';
import { LoadStatus } from '@/components/LoadStatus';
import { ProductState } from '@/components/ProductState';
import { LiveSourceBanner } from '@/components/SourceBanner';
import { getApiClient } from '@/config/api';
import { useRefreshable } from '@/data/useRefreshable';
import { useDisplayContext } from '@/i18n/useT';
import { InboxHeaderButton } from '@/navigation/options';
import { Button, ChipBar, ChipButton, colors, EmptyState, font, GUTTER, haptic, Icon, IconButton, icons, LargeTitleHeader, SystemBanner, type } from '@/ui';

const PAGE_SIZE = 20;
type Source = '' | MarketplaceKey;
type Data = { items: DealSummary[]; cursor: string | null; hunts: { id: string; name: string }[]; waiting: ProductStateView | null; unread: number | undefined };
type Done = { text: string; undo: (() => Promise<unknown>) | null };

/**
 * Ranked deal feed (strength first, then freshness) as a dense list (step 89 mock-up): large
 * title with the inbox bell, a search over the loaded deals, one sideways-scrolling filter row
 * (status, marketplace, Hunt) and photo rows. Swipe a row (or use its accessibility actions) for
 * the quick decisions - Save, Not for me - without opening the deal; the server decides which list
 * it belongs to afterwards (the feed reloads), and an Undo stays at the bottom.
 */
export default function DealsScreen() {
  const router = useRouter();
  const context = useDisplayContext();
  const { t } = context;
  const [filter, setFilter] = useState<DealStatusFilter>('open');
  const [source, setSource] = useState<Source>('');
  const [huntId, setHuntId] = useState('');
  const [huntsOpen, setHuntsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [more, setMore] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = { status: filter, marketplace: source || undefined, huntId: huntId || undefined, limit: PAGE_SIZE };
  const key = `${filter}|${source}|${huntId}`;

  const fetch = useCallback(async (): Promise<Data> => {
    const api = getApiClient();
    const [page, hunts, unread] = await Promise.all([
      api.listDeals({ status: filter, marketplace: source || undefined, huntId: huntId || undefined, limit: PAGE_SIZE }),
      api.listHunts({ limit: 100 }),
      // The bell's unread dot; the feed never fails because of it.
      api.listAlerts({ limit: 1 }).then(
        (p) => p.unreadCount,
        () => undefined,
      ),
    ]);
    // No deals yet: say whether the first scan is running or everything is fine but quiet.
    const unfiltered = !source && !huntId && (filter === 'open' || filter === 'all');
    const wants = page.items.length === 0 && unfiltered && hunts.items.some((h) => h.status === 'LIVE');
    const activity = wants ? await api.listHuntActivity().catch(() => null) : null;
    return {
      items: page.items,
      cursor: page.nextCursor,
      hunts: hunts.items.map((h) => ({ id: h.id, name: h.name })),
      waiting: activity ? dealsWaitingState(hunts.items, activity, new Date(), t) : null,
      unread,
    };
  }, [filter, source, huntId, t]);
  // Reloads on focus (e.g. after acting on a deal) and whenever a filter changes.
  const { state, refresh, retry, update } = useRefreshable(fetch, key);
  const data = state.status === 'ready' ? state.data : null;

  const change =
    <T,>(set: (v: T) => void) =>
    (value: T) => {
      setMore({ loading: false, error: null });
      setDone(null);
      set(value);
    };

  const showMore = async () => {
    if (!data?.cursor) return;
    setMore({ loading: true, error: null });
    try {
      const page = await getApiClient().listDeals({ ...query, cursor: data.cursor });
      update((d) => ({ ...d, items: [...d.items, ...page.items.filter((x) => !d.items.some((i) => i.id === x.id))], cursor: page.nextCursor }));
      setMore({ loading: false, error: null });
    } catch (err) {
      setMore({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const act = async (deal: DealSummary, action: 'save' | 'ignore') => {
    const api = getApiClient();
    setBusy(deal.id);
    setActionError(null);
    try {
      if (action === 'save') {
        await api.saveDeal(deal.id);
        setDone({ text: t('deals.savedNotice', { title: deal.listing.title }), undo: () => api.unsaveDeal(deal.id) });
      } else {
        const built = buildIgnoreRequest('', t);
        await api.ignoreDeal(deal.id, built.ok ? built.request : undefined);
        setDone({ text: t('deals.ignoredNotice', { title: deal.listing.title }), undo: () => api.unignoreDeal(deal.id) });
      }
      retry();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const undo = async () => {
    if (!done?.undo) return;
    try {
      await done.undo();
      setDone({ text: t('deals.undone'), undo: null });
      retry();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const hunts = data?.hunts ?? [];
  const needle = search.trim().toLowerCase();
  const items = useMemo(
    () => (data?.items ?? []).filter((d) => !needle || d.listing.title.toLowerCase().includes(needle) || d.hunt.name.toLowerCase().includes(needle)),
    [data?.items, needle],
  );
  const huntName = hunts.find((h) => h.id === huntId)?.name;

  const empty = () => {
    if (state.status === 'loading') return <LoadStatus state={state} what="deals" onRetry={retry} />;
    if (!data) return null;
    if (data.items.length > 0) {
      return (
        <View style={styles.padded}>
          <Text style={[styles.muted, font('regular')]}>{t('deals.searchNoMatch', { query: search.trim() })}</Text>
        </View>
      );
    }
    if (data.waiting) {
      return (
        <View style={styles.padded}>
          <ProductState view={data.waiting} />
        </View>
      );
    }
    return hunts.length === 0 ? (
      <EmptyState
        title={t('deals.emptyTitle')}
        description={t('deals.emptyBody')}
        action={<Button onPress={() => router.push('/hunts/new')}>{t('deals.createHunt')}</Button>}
      />
    ) : (
      <EmptyState
        title={t(filter === 'open' ? 'deals.emptyOpenTitle' : 'deals.emptyFilteredTitle')}
        description={t(filter === 'open' ? 'deals.emptyOpenBody' : 'deals.emptyFilteredBody')}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <LargeTitleHeader title={t('nav.tabDeals')} actions={<InboxHeaderButton unread={data?.unread} />}>
        <SearchField value={search} onChange={setSearch} />
        <ChipBar
          label={t('deals.filtersA11y')}
          chips={dealFilters(t)}
          value={filter}
          onChange={change(setFilter)}
          trailing={
            <>
              {(Object.keys(MARKETPLACE_LABEL) as MarketplaceKey[]).map((m) => (
                <ChipButton
                  key={m}
                  role="checkbox"
                  label={MARKETPLACE_LABEL[m]}
                  icon={<MarketplaceMark marketplace={m} size={14} />}
                  selected={source === m}
                  onPress={() => {
                    haptic.select();
                    change(setSource)(source === m ? '' : m);
                  }}
                />
              ))}
              {hunts.length > 1 && (
                <ChipButton
                  label={huntName ?? t('deals.allHunts')}
                  selected={!!huntId}
                  trailingIcon={<Icon name={icons.chevronDown} size={12} color={huntId ? colors.background : colors.text} />}
                  accessibilityHint={t('deals.huntPickerHint')}
                  onPress={() => {
                    haptic.select();
                    setHuntsOpen((o) => !o);
                  }}
                />
              )}
            </>
          }
        />
        {huntsOpen && hunts.length > 1 && (
          <ChipBar
            label={t('deals.huntFilterA11y')}
            chips={[{ value: '', label: t('deals.allHunts') }, ...hunts.map((h) => ({ value: h.id, label: h.name }))]}
            value={huntId}
            onChange={(v) => {
              change(setHuntId)(v);
              setHuntsOpen(false);
            }}
          />
        )}
      </LargeTitleHeader>

      <FlatList
        data={items}
        keyExtractor={(d) => d.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={state.status === 'ready' && state.refreshing}
            onRefresh={refresh}
            tintColor={colors.text}
            accessibilityLabel={t('common.pullToRefresh')}
          />
        }
        ListHeaderComponent={
          <View style={styles.notices}>
            <LiveSourceBanner />
            <AccessNotice only={['suspended']} />
            {state.status !== 'loading' && <LoadStatus state={state} what="deals" onRetry={retry} />}
            {actionError && <SystemBanner tone="error" title={t('errors.actionFailed')} message={actionError} />}
          </View>
        }
        renderItem={({ item: deal }) => {
          const can = dealActions(deal);
          return (
            <DealCard
              view={dealCardView(deal, context)}
              onPress={() => router.push({ pathname: '/deals/[id]', params: { id: deal.id } })}
              busy={busy === deal.id}
              saved={deal.isSaved}
              onSave={can.canSave ? () => void act(deal, 'save') : undefined}
              onIgnore={can.canIgnore ? () => void act(deal, 'ignore') : undefined}
            />
          );
        }}
        ListEmptyComponent={empty()}
        ListFooterComponent={
          data && data.items.length > 0 ? (
            <View style={styles.footer}>
              {more.error && <Text style={[styles.error, font('regular')]}>{t('errors.loadMoreFailed', { message: more.error })}</Text>}
              {data.cursor && (
                <Button variant="secondary" loading={more.loading} onPress={showMore}>
                  {t('deals.showMore')}
                </Button>
              )}
              <Text style={[styles.hint, font('regular')]}>{t('deals.swipeHint')}</Text>
            </View>
          ) : null
        }
        contentContainerStyle={done ? styles.withSnack : undefined}
      />
      {done && <Snackbar text={done.text} actionLabel={done.undo ? t('deals.undo') : undefined} onAction={() => void undo()} onClose={() => setDone(null)} closeLabel={t('common.cancel')} />}
    </View>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useDisplayContext();
  return (
    <View style={styles.search}>
      <Icon name={icons.search} size={16} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t('deals.searchPlaceholder')}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={t('deals.searchPlaceholder')}
        returnKeyType="search"
        autoCorrect={false}
        clearButtonMode="never"
        style={[styles.searchInput, font('regular')]}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('deals.searchClear')} onPress={() => onChange('')} hitSlop={10} style={styles.clear}>
          <Icon name={icons.close} size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Bottom notice after a quick decision, with Undo. Announced; stays until closed or the filter changes (no time limit). */
function Snackbar({ text, actionLabel, onAction, onClose, closeLabel }: { text: string; actionLabel?: string; onAction: () => void; onClose: () => void; closeLabel: string }) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
  return (
    <View style={styles.snack} accessibilityLiveRegion="polite">
      <Text style={[styles.snackText, font('medium')]} numberOfLines={2}>
        {text}
      </Text>
      {actionLabel && (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8} style={styles.snackAction}>
          <Text style={[styles.snackActionText, font('bold')]}>{actionLabel}</Text>
        </Pressable>
      )}
      <IconButton icon={icons.close} label={closeLabel} onPress={onClose} color={colors.background} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  search: { flexDirection: 'row', alignItems: 'center', gap: space[2], height: 40, paddingHorizontal: space[3], borderRadius: radius.full, backgroundColor: colors.grouped },
  searchInput: { flex: 1, height: 40, color: colors.text, fontSize: type.body, paddingVertical: 0 },
  clear: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  notices: { paddingHorizontal: GUTTER, paddingBottom: space[1], gap: space[2] },
  padded: { padding: GUTTER },
  muted: { color: colors.textMuted, fontSize: type.callout },
  footer: { alignItems: 'center', gap: space[3], paddingHorizontal: GUTTER, paddingTop: space[4], paddingBottom: space[8] },
  error: { color: colors.text, fontSize: type.subhead, textAlign: 'center' },
  hint: { color: colors.textMuted, fontSize: type.footnote, textAlign: 'center' },
  withSnack: { paddingBottom: 80 },
  snack: {
    position: 'absolute',
    left: GUTTER,
    right: GUTTER,
    bottom: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingLeft: space[4],
    paddingRight: space[1],
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.text,
    shadowColor: colors.text,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  snackText: { flex: 1, color: colors.background, fontSize: type.callout, paddingVertical: space[2] },
  snackAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2] },
  snackActionText: { color: colors.action, fontSize: type.callout },
});
