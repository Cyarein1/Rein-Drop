import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { DealStatusFilter, DealSummary, MarketplaceKey } from '@rein-drop/api-client';
import { buildIgnoreRequest, DEAL_FILTERS, dealActions, dealCardView, dealsWaitingState, huntFormContext, MARKETPLACE_LABEL, type ProductStateView } from '@rein-drop/client-core';
import { fontSize, roles } from '@rein-drop/design-tokens';
import { useSessionState } from '@/auth/SessionProvider';
import { AccessNotice } from '@/access/AccessNotice';
import { DealCard } from '@/components/DealCard';
import { LoadStatus } from '@/components/LoadStatus';
import { ProductState } from '@/components/ProductState';
import { LiveSourceBanner } from '@/components/SourceBanner';
import { getApiClient } from '@/config/api';
import { useRefreshable } from '@/data/useRefreshable';
import { Button, Card, ChoiceGroup, EmptyState, font, Screen, SystemBanner } from '@/ui';

const PAGE_SIZE = 20;
type Source = '' | MarketplaceKey;
type Data = { items: DealSummary[]; cursor: string | null; hunts: { id: string; name: string }[]; waiting: ProductStateView | null };
type Done = { text: string; undo: (() => Promise<unknown>) | null };

/**
 * Ranked deal feed (strength first, then freshness), filtered by status, source and Hunt. Each card
 * offers the quick decisions - Save, Not for me - without opening the deal; the server decides
 * which list it belongs to afterwards (the feed reloads).
 */
export default function DealsScreen() {
  const router = useRouter();
  const { state: session } = useSessionState();
  const context = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null);
  const [filter, setFilter] = useState<DealStatusFilter>('open');
  const [source, setSource] = useState<Source>('');
  const [huntId, setHuntId] = useState('');
  const [more, setMore] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = { status: filter, marketplace: source || undefined, huntId: huntId || undefined, limit: PAGE_SIZE };
  const key = `${filter}|${source}|${huntId}`;

  const fetch = useCallback(async (): Promise<Data> => {
    const api = getApiClient();
    const [page, hunts] = await Promise.all([api.listDeals({ status: filter, marketplace: source || undefined, huntId: huntId || undefined, limit: PAGE_SIZE }), api.listHunts({ limit: 100 })]);
    // No deals yet: say whether the first scan is running or everything is fine but quiet.
    const unfiltered = !source && !huntId && (filter === 'open' || filter === 'all');
    const wants = page.items.length === 0 && unfiltered && hunts.items.some((h) => h.status === 'LIVE');
    const activity = wants ? await api.listHuntActivity().catch(() => null) : null;
    return { items: page.items, cursor: page.nextCursor, hunts: hunts.items.map((h) => ({ id: h.id, name: h.name })), waiting: activity ? dealsWaitingState(hunts.items, activity, new Date()) : null };
  }, [filter, source, huntId]);
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
        setDone({ text: `Saved "${deal.listing.title}". Find it under Saved.`, undo: () => api.unsaveDeal(deal.id) });
      } else {
        const built = buildIgnoreRequest('');
        await api.ignoreDeal(deal.id, built.ok ? built.request : undefined);
        setDone({ text: `"${deal.listing.title}" moved to Ignored.`, undo: () => api.unignoreDeal(deal.id) });
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
      setDone({ text: 'Undone.', undo: null });
      retry();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const hunts = data?.hunts ?? [];

  return (
    <Screen description="Ranked by how strong the opportunity is, then how fresh." onRefresh={refresh} refreshing={state.status === 'ready' && state.refreshing}>
      <LiveSourceBanner />
      <AccessNotice only={['suspended']} />
      <ChoiceGroup legend="Show" options={DEAL_FILTERS} value={filter} onChange={change(setFilter)} />
      <ChoiceGroup
        legend="Source"
        options={[{ value: '' as Source, label: 'All' }, ...Object.entries(MARKETPLACE_LABEL).map(([value, label]) => ({ value: value as Source, label }))]}
        value={source}
        onChange={change(setSource)}
      />
      {hunts.length > 1 && (
        <ChoiceGroup legend="Hunt" options={[{ value: '', label: 'All' }, ...hunts.map((h) => ({ value: h.id, label: h.name }))]} value={huntId} onChange={change(setHuntId)} />
      )}

      <LoadStatus state={state} what="deals" onRetry={retry} />
      {done && (
        <SystemBanner
          tone="success"
          title={done.text}
          action={
            done.undo ? (
              <Button variant="text" onPress={() => void undo()}>
                Undo
              </Button>
            ) : undefined
          }
        />
      )}
      {actionError && <SystemBanner tone="error" title="That didn't work" message={actionError} />}
      {data && data.items.length === 0 && data.waiting && <ProductState view={data.waiting} />}
      {data && data.items.length === 0 && !data.waiting && (
        <Card>
          {hunts.length === 0 ? (
            <EmptyState
              title="No deals yet"
              description="Deals appear here when a live Hunt finds a listing that clears your criteria."
              action={<Button onPress={() => router.push('/hunts/new')}>Create a Hunt</Button>}
            />
          ) : (
            <EmptyState
              title={filter === 'open' ? 'Nothing to review right now' : 'Nothing here'}
              description={filter === 'open' ? 'Rein Drop keeps checking your live Hunts and lists anything worth a look here.' : 'Try another filter.'}
            />
          )}
        </Card>
      )}
      {data?.items.map((deal) => {
        const can = dealActions(deal);
        return (
          <DealCard
            key={deal.id}
            view={dealCardView(deal, context)}
            onPress={() => router.push({ pathname: '/deals/[id]', params: { id: deal.id } })}
            busy={busy === deal.id}
            onSave={can.canSave ? () => void act(deal, 'save') : undefined}
            onIgnore={can.canIgnore ? () => void act(deal, 'ignore') : undefined}
          />
        );
      })}
      {data && (data.cursor || more.error) && (
        <View style={styles.more}>
          {more.error && <Text style={[styles.error, font('regular')]}>Couldn&apos;t load more: {more.error}</Text>}
          {data.cursor && (
            <Button variant="secondary" loading={more.loading} onPress={showMore}>
              Show more
            </Button>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  more: { alignItems: 'center', gap: 8 },
  error: { color: roles.text, fontSize: fontSize.sm },
});
