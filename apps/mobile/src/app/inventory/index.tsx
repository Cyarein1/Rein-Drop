import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import type { InventoryItem } from '@rein-drop/api-client';
import { huntFormContext, INVENTORY_FILTERS, inventoryEmptyText, inventoryRowView, type InventoryFilter } from '@rein-drop/client-core';
import { useSessionState } from '@/auth/SessionProvider';
import { InventoryRow } from '@/components/InventoryRow';
import { getApiClient } from '@/config/api';
import { Button, Card, ChoiceGroup, EmptyState, LoadingState, Screen, SystemBanner } from '@/ui';

const PAGE_SIZE = 20;

type State =
  | { status: 'loading' }
  | { status: 'ready'; items: InventoryItem[]; cursor: string | null; more: 'idle' | 'loading' | string }
  | { status: 'error'; message: string };

/** Inventory (screen 21): bought items, holding time, Mark sold; sold items with realized results. */
export default function InventoryScreen() {
  const router = useRouter();
  const { state: session } = useSessionState();
  const context = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null);
  const [filter, setFilter] = useState<InventoryFilter>('holding');
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    getApiClient()
      .listInventory({ status: filter, limit: PAGE_SIZE })
      .then(
        (page) => !cancelled && setState({ status: 'ready', items: page.items, cursor: page.nextCursor, more: 'idle' }),
        (err: unknown) => !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, [filter]);
  // Reload on focus (e.g. back from Mark sold) and when the filter changes.
  useFocusEffect(load);

  const showMore = async () => {
    if (state.status !== 'ready' || !state.cursor) return;
    setState({ ...state, more: 'loading' });
    try {
      const page = await getApiClient().listInventory({ status: filter, limit: PAGE_SIZE, cursor: state.cursor });
      setState({ status: 'ready', items: [...state.items, ...page.items.filter((i) => !state.items.some((p) => p.id === i.id))], cursor: page.nextCursor, more: 'idle' });
    } catch (err) {
      setState({ ...state, more: err instanceof Error ? err.message : String(err) });
    }
  };

  const empty = inventoryEmptyText(filter);
  return (
    <Screen description="What you bought, how long you've held it, and what it sold for.">
      <ChoiceGroup
        legend="Show"
        options={INVENTORY_FILTERS}
        value={filter}
        onChange={(v) => {
          setState({ status: 'loading' });
          setFilter(v);
        }}
      />
      {state.status === 'loading' && <LoadingState label="Loading your inventory…" />}
      {state.status === 'error' && (
        <SystemBanner
          tone="error"
          title="Couldn't load your inventory"
          message={state.message}
          action={
            <Button
              variant="secondary"
              onPress={() => {
                setState({ status: 'loading' });
                load();
              }}
            >
              Try again
            </Button>
          }
        />
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <Card>
          <EmptyState
            title={empty.title}
            description={empty.body}
            // The approved "holding box" mascot explains purchase tracking - only when there's nothing yet.
            mascot={filter === 'sold' ? undefined : 'inventory'}
            action={
              filter === 'sold' ? (
                <Button variant="secondary" onPress={() => setFilter('holding')}>
                  See what you&apos;re holding
                </Button>
              ) : (
                <Button onPress={() => router.navigate('/deals')}>Go to deals</Button>
              )
            }
          />
        </Card>
      )}
      {state.status === 'ready' && state.items.map((item) => <InventoryRow key={item.id} view={inventoryRowView(item, context)} />)}
      {state.status === 'ready' && state.more !== 'idle' && state.more !== 'loading' && (
        <SystemBanner tone="error" title="Couldn't load more" message={state.more} />
      )}
      {state.status === 'ready' && state.cursor && (
        <Button variant="secondary" loading={state.more === 'loading'} onPress={showMore}>
          Show more
        </Button>
      )}
    </Screen>
  );
}
