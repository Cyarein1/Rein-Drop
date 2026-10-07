import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { Hunt, HuntStatus } from '@rein-drop/api-client';
import { fontSize, roles } from '@rein-drop/design-tokens';
import { getApiClient } from '@/config/api';
import { Badge, Button, Card, EmptyState, font, LoadingState, Screen, SystemBanner, type BadgeProps } from '@/ui';

const STATUS: Record<HuntStatus, { label: string; tone: NonNullable<BadgeProps['tone']> }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  LIVE: { label: 'Live', tone: 'action' },
  PAUSED: { label: 'Paused', tone: 'info' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};
const MARKETPLACE: Record<string, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };

type State = { status: 'loading' } | { status: 'ready'; hunts: Hunt[] } | { status: 'error'; message: string };

export default function HuntsScreen() {
  const router = useRouter();
  const { created } = useLocalSearchParams<{ created?: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getApiClient().listHunts({ limit: 50 }))
      .then(
        (page) => !cancelled && setState({ status: 'ready', hunts: page.items }),
        (err: unknown) =>
          !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  // Reload whenever the tab comes into focus (e.g. after saving a new hunt).
  useFocusEffect(load);

  const retry = () => {
    setState({ status: 'loading' });
    load();
  };

  const createdHunt = state.status === 'ready' && created ? state.hunts.find((h) => h.id === created) : undefined;

  return (
    <Screen description="Everything Rein Drop is watching for you.">
      {createdHunt && (
        <SystemBanner
          tone="success"
          title="Hunt saved as a draft"
          message={`"${createdHunt.name}" is ready. Choose Start watching when you want monitoring to begin.`}
        />
      )}
      {state.status === 'loading' && <LoadingState label="Loading your Hunts…" />}
      {state.status === 'error' && (
        <SystemBanner
          tone="error"
          title="Couldn't load your Hunts"
          message={state.message}
          action={
            <Button variant="secondary" onPress={retry}>
              Try again
            </Button>
          }
        />
      )}
      {state.status === 'ready' && state.hunts.length === 0 && (
        <Card>
          <EmptyState
            title="No Hunts yet"
            description="A Hunt is a saved search Rein Drop keeps checking on eBay and Facebook Marketplace."
            action={<Button onPress={() => router.push('/hunts/new')}>Create your first Hunt</Button>}
          />
        </Card>
      )}
      {state.status === 'ready' &&
        state.hunts.map((hunt) => {
          const status = STATUS[hunt.status];
          return (
            <Card key={hunt.id} title={hunt.name} action={<Badge tone={status.tone}>{status.label}</Badge>}>
              <Text style={[styles.meta, font('regular')]}>
                {hunt.marketplaces.map((m) => MARKETPLACE[m] ?? m).join(' · ')}
                {hunt.location ? ` · ${hunt.location.text}` : ''}
              </Text>
              {hunt.status === 'DRAFT' && (
                <View>
                  <Button
                    variant="secondary"
                    onPress={() => router.push({ pathname: '/hunts/[id]/start', params: { id: hunt.id } })}
                  >
                    Start watching
                  </Button>
                </View>
              )}
            </Card>
          );
        })}
      {state.status === 'ready' && state.hunts.length > 0 && (
        <View>
          <Button variant="secondary" onPress={() => router.push('/hunts/new')}>
            Create Hunt
          </Button>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { color: roles.textMuted, fontSize: fontSize.sm },
});
