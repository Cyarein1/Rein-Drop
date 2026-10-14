import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Hunt, HuntActivity } from '@rein-drop/api-client';
import {
  countsLine,
  HUNT_FILTERS,
  HUNT_STATUS_LABEL,
  joinList,
  MARKETPLACE_LABEL,
  monitoringLine,
  planLimitState,
  type HuntListFilter,
  type ProductStateView,
} from '@rein-drop/client-core';
import { fontSize, radius, roles, size, space, tones } from '@rein-drop/design-tokens';
import { AccessNotice, useCanUseHunts } from '@/access/AccessNotice';
import { ProductState } from '@/components/ProductState';
import { LiveSourceBanner } from '@/components/SourceBanner';
import { getApiClient } from '@/config/api';
import { Badge, Button, Card, ChoiceGroup, EmptyState, font, LoadingState, Screen, SystemBanner } from '@/ui';

type State =
  | { status: 'loading' }
  | { status: 'ready'; hunts: Hunt[]; activity: Map<string, HuntActivity>; suggestion: ProductStateView | null }
  | { status: 'error'; message: string };

/** Hunts by state (Active / Paused / Draft / Archived), with monitoring and simple counts. */
export default function HuntsScreen() {
  const router = useRouter();
  const { created } = useLocalSearchParams<{ created?: string }>();
  const [filter, setFilter] = useState<HuntListFilter>('all');
  const [state, setState] = useState<State>({ status: 'loading' });
  const canUseHunts = useCanUseHunts();

  const load = useCallback(() => {
    let cancelled = false;
    const api = getApiClient();
    Promise.all([
      api.listHunts({ limit: 100, ...(filter === 'all' ? {} : { status: filter }) }),
      api.listHuntActivity(),
      // The plan suggestion needs every Hunt (drafts included), so only on the "All" view.
      filter === 'all' ? api.getEntitlements().catch(() => null) : Promise.resolve(null),
    ]).then(
      ([page, activity, entitlements]) =>
        !cancelled &&
        setState({
          status: 'ready',
          hunts: page.items,
          activity: new Map(activity.map((a) => [a.huntId, a])),
          suggestion: entitlements ? planLimitState(entitlements, page.items, 'companion') : null,
        }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [filter]);

  // Reload whenever the tab comes into focus (e.g. after editing or pausing a hunt) or the filter changes.
  useFocusEffect(load);

  const retry = () => {
    setState({ status: 'loading' });
    load();
  };
  const createdHunt = state.status === 'ready' && created ? state.hunts.find((h) => h.id === created) : undefined;

  return (
    <Screen description="Everything Rein Drop is watching for you.">
      <LiveSourceBanner />
      <AccessNotice />
      {state.status === 'ready' && state.suggestion && <ProductState view={state.suggestion} />}
      {createdHunt && (
        <SystemBanner tone="success" title="Hunt saved as a draft" message={`"${createdHunt.name}" is ready. Choose Start watching when you want monitoring to begin.`} />
      )}
      <ChoiceGroup
        legend="Show"
        options={HUNT_FILTERS}
        value={filter}
        onChange={(v) => {
          setState({ status: 'loading' });
          setFilter(v);
        }}
      />
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
          {filter === 'all' ? (
            <EmptyState
              title="No Hunts yet"
              description="A Hunt is a saved search Rein Drop keeps checking on eBay and Facebook Marketplace."
              action={canUseHunts ? <Button onPress={() => router.push('/hunts/new')}>Create your first Hunt</Button> : undefined}
            />
          ) : (
            <EmptyState title={`No ${HUNT_FILTERS.find((f) => f.value === filter)!.label.toLowerCase()} Hunts`} />
          )}
        </Card>
      )}
      {state.status === 'ready' &&
        state.hunts.map((hunt) => {
          const status = HUNT_STATUS_LABEL[hunt.status];
          const activity = state.activity.get(hunt.id) ?? null;
          const monitoring = monitoringLine(hunt, activity);
          const counts = countsLine(activity);
          return (
            <Pressable
              key={hunt.id}
              onPress={() => router.push({ pathname: '/hunts/[id]', params: { id: hunt.id } })}
              accessibilityRole="button"
              accessibilityLabel={[hunt.name, status.label, monitoring.text, counts].filter(Boolean).join('. ')}
              accessibilityHint="Opens the Hunt"
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.head}>
                <Text style={[styles.title, font('semibold')]}>{hunt.name}</Text>
                <Badge tone={status.tone}>{status.label}</Badge>
              </View>
              <Text style={[styles.muted, font('regular')]}>
                {joinList(hunt.marketplaces.map((m) => MARKETPLACE_LABEL[m]))}
                {hunt.location ? ` · ${hunt.location.text}` : ''}
              </Text>
              <View style={[styles.monitoring, monitoring.tone === 'fresh' && styles.warn]}>
                {monitoring.scanning && <ActivityIndicator size="small" color={roles.text} />}
                <Text style={[styles.body, font('regular')]}>{monitoring.text}</Text>
              </View>
              {counts && <Text style={[styles.body, font('semibold')]}>{counts}</Text>}
              {hunt.status === 'DRAFT' && canUseHunts && (
                <View>
                  <Button variant="secondary" onPress={() => router.push({ pathname: '/hunts/[id]/start', params: { id: hunt.id } })}>
                    Start watching
                  </Button>
                </View>
              )}
            </Pressable>
          );
        })}
      {state.status === 'ready' && state.hunts.length > 0 && canUseHunts && (
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
  card: { gap: space[2], padding: space[4], borderWidth: size.borderWidth, borderColor: roles.border, borderRadius: radius.md, backgroundColor: roles.surface },
  pressed: { opacity: 0.85 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[3] },
  title: { color: roles.text, fontSize: fontSize.lg, flexShrink: 1 },
  monitoring: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  warn: { paddingLeft: space[2], borderLeftWidth: 3, borderLeftColor: tones.fresh.accent },
  body: { color: roles.text, fontSize: fontSize.sm, flexShrink: 1 },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
});
