import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { DealStatusFilter, DealSummary, MarketplaceKey } from '@rein-drop/api-client';
import { DEAL_FILTERS, dealCardView, huntFormContext, MARKETPLACE_LABEL } from '@rein-drop/client-core';
import { fontSize, roles } from '@rein-drop/design-tokens';
import { useSessionState } from '@/auth/SessionProvider';
import { DealCard } from '@/components/DealCard';
import { getApiClient } from '@/config/api';
import { Button, Card, ChoiceGroup, EmptyState, font, LoadingState, Screen, SystemBanner } from '@/ui';

const PAGE_SIZE = 20;
type Source = '' | MarketplaceKey;

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: DealSummary[]; cursor: string | null; hunts: { id: string; name: string }[] };

/** Ranked deal feed (strength first, then freshness), filtered by status, source and Hunt. */
export default function DealsScreen() {
  const router = useRouter();
  const { state: session } = useSessionState();
  const context = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null);
  const [filter, setFilter] = useState<DealStatusFilter>('open');
  const [source, setSource] = useState<Source>('');
  const [huntId, setHuntId] = useState('');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [more, setMore] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });

  const query = { status: filter, marketplace: source || undefined, huntId: huntId || undefined, limit: PAGE_SIZE };

  const load = useCallback(() => {
    let cancelled = false;
    const api = getApiClient();
    Promise.all([api.listDeals({ status: filter, marketplace: source || undefined, huntId: huntId || undefined, limit: PAGE_SIZE }), api.listHunts({ limit: 100 })]).then(
      ([page, hunts]) =>
        !cancelled &&
        setState({ status: 'ready', items: page.items, cursor: page.nextCursor, hunts: hunts.items.map((h) => ({ id: h.id, name: h.name })) }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [filter, source, huntId]);

  // Reload on focus (e.g. after acting on a deal) and whenever a filter changes.
  useFocusEffect(load);

  const change = <T,>(set: (v: T) => void) => (value: T) => {
    setState({ status: 'loading' });
    setMore({ loading: false, error: null });
    set(value);
  };

  const showMore = async () => {
    if (state.status !== 'ready' || !state.cursor) return;
    setMore({ loading: true, error: null });
    try {
      const page = await getApiClient().listDeals({ ...query, cursor: state.cursor });
      setState({ ...state, items: [...state.items, ...page.items.filter((d) => !state.items.some((i) => i.id === d.id))], cursor: page.nextCursor });
      setMore({ loading: false, error: null });
    } catch (err) {
      setMore({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const hunts = state.status === 'ready' ? state.hunts : [];

  return (
    <Screen description="Ranked by how strong the opportunity is, then how fresh.">
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

      {state.status === 'loading' && <LoadingState label="Loading your deals…" />}
      {state.status === 'error' && (
        <SystemBanner
          tone="error"
          title="Couldn't load your deals"
          message={state.message}
          action={
            <Button variant="secondary" onPress={() => change(setFilter)(filter)}>
              Try again
            </Button>
          }
        />
      )}
      {state.status === 'ready' && state.items.length === 0 && (
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
              description={
                filter === 'open'
                  ? 'Rein Drop keeps checking your live Hunts and lists anything worth a look here.'
                  : 'Try another filter.'
              }
            />
          )}
        </Card>
      )}
      {state.status === 'ready' &&
        state.items.map((deal) => (
          <DealCard key={deal.id} view={dealCardView(deal, context)} onPress={() => router.push({ pathname: '/deals/[id]', params: { id: deal.id } })} />
        ))}
      {state.status === 'ready' && (state.cursor || more.error) && (
        <View style={styles.more}>
          {more.error && <Text style={[styles.error, font('regular')]}>Couldn&apos;t load more: {more.error}</Text>}
          {state.cursor && (
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
