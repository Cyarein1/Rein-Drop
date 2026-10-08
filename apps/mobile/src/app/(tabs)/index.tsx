import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Home, HomeTarget } from '@rein-drop/api-client';
import {
  attentionLine,
  countsLine,
  dealCardView,
  huntFormContext,
  huntsLine,
  monitoringLine,
  profitView,
  recentView,
} from '@rein-drop/client-core';
import { fontSize, roles, space, tones } from '@rein-drop/design-tokens';
import { useSessionState } from '@/auth/SessionProvider';
import { DealCard } from '@/components/DealCard';
import { SourceBanner } from '@/components/SourceBanner';
import { getApiClient } from '@/config/api';
import { Button, Card, EmptyState, font, LoadingState, Metric, Screen, SystemBanner } from '@/ui';

/**
 * Onboarding opens by itself once per app launch (Blueprint section 2: new users set up before
 * the dashboard). If the user closes it, Home's recommendation keeps offering it instead.
 */
let onboardingPromptedThisLaunch = false;

function targetHref(target: HomeTarget): Href {
  switch (target.kind) {
    case 'onboarding':
      return '/onboarding';
    case 'create_hunt':
      return '/hunts/new';
    case 'hunt':
      return { pathname: '/hunts/[id]', params: { id: target.huntId } };
    case 'edit_hunt':
      return { pathname: '/hunts/[id]/edit', params: { id: target.huntId } };
    case 'start_hunt':
      return { pathname: '/hunts/[id]/start', params: { id: target.huntId } };
    case 'notifications':
      return '/settings';
  }
}

type State = { status: 'loading' } | { status: 'ready'; home: Home; loadedAt: Date } | { status: 'error'; message: string };

/**
 * Returning-user Home (App Flow Blueprint section 8), in priority order: what needs attention,
 * whether Rein Drop is working, realized profit, recent activity, one recommendation.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { state: session } = useSessionState();
  const context = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null);
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    const api = getApiClient();
    api.getHome().then(
      (home) => !cancelled && setState({ status: 'ready', home, loadedAt: new Date() }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
    );
    // Unfinished onboarding opens once per launch.
    if (!onboardingPromptedThisLaunch) {
      api.getSellerSnapshot().then(
        (s) => {
          if (cancelled || onboardingPromptedThisLaunch) return;
          if (s.status === 'not_started' || s.status === 'in_progress') {
            onboardingPromptedThisLaunch = true;
            router.push('/onboarding');
          }
        },
        () => undefined,
      );
    }
    return () => {
      cancelled = true;
    };
  }, [router]);
  useFocusEffect(load);

  if (state.status === 'loading') return <LoadingState label="Loading Home…" />;
  if (state.status === 'error') {
    return (
      <Screen>
        <SystemBanner
          tone="error"
          title="Couldn't load your Home"
          message={`${state.message}. Your Hunts keep running.`}
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
      </Screen>
    );
  }

  const { home, loadedAt } = state;
  const anyHunts = home.hunts.live + home.hunts.paused + home.hunts.drafts > 0;
  const rec = home.recommendation;

  // Brand-new account: one welcoming step, not five empty sections.
  if (!anyHunts) {
    return (
      <Screen description="Is Rein Drop working, and is anything worth your attention?">
        <Card>
          <EmptyState
            mascot="welcome"
            title="Set up your first Hunt"
            description="Tell Rein Drop what to watch for. It checks the marketplaces and only alerts you when something looks worth acting on."
            action={<Button onPress={() => router.push(rec ? targetHref(rec.target) : '/hunts/new')}>{rec?.actionLabel ?? 'Create Hunt'}</Button>}
          />
        </Card>
      </Screen>
    );
  }

  const attention = attentionLine(home.attention);
  const profit = profitView(home.profit, context);

  return (
    <Screen description="Is Rein Drop working, and is anything worth your attention?">
      <SourceBanner sources={home.sources} now={loadedAt} />
      {/* 1. Needs your attention */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={[styles.heading, font('bold')]} accessibilityRole="header">
            Needs your attention
          </Text>
          {home.attention.unreadAlerts > 0 && (
            <Button variant="text" onPress={() => router.push('/alerts')}>
              {`Inbox (${home.attention.unreadAlerts})`}
            </Button>
          )}
        </View>
        {attention ? (
          <>
            <Text style={[styles.lead, font('semibold')]}>{attention}</Text>
            {home.attention.top.map((deal) => (
              <DealCard key={deal.id} view={dealCardView(deal, context)} onPress={() => router.push({ pathname: '/deals/[id]', params: { id: deal.id } })} />
            ))}
            {home.attention.toReview > home.attention.top.length && (
              <Button variant="secondary" onPress={() => router.push('/deals')}>
                {`See all ${home.attention.toReview} deals`}
              </Button>
            )}
          </>
        ) : (
          <Card>
            {/* "Waiting" mascot has no approved art yet: plain text. */}
            <Text style={[styles.lead, font('semibold')]}>Nothing needs you right now.</Text>
            <Text style={[styles.muted, font('regular')]}>
              {home.hunts.live > 0
                ? `Rein Drop is watching ${home.hunts.live === 1 ? '1 Hunt' : `${home.hunts.live} Hunts`} and will alert you when something is worth a look.`
                : 'No Hunt is live, so nothing new will arrive until one is.'}
            </Text>
          </Card>
        )}
      </View>

      {/* 2. Your Hunts */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={[styles.heading, font('bold')]} accessibilityRole="header">
            Your Hunts
          </Text>
          <Button variant="text" onPress={() => router.push('/hunts')}>
            View all
          </Button>
        </View>
        <Text style={[styles.muted, font('regular')]}>{huntsLine(home.hunts)}</Text>
        {home.hunts.items.length > 0 && (
          <Card>
            {home.hunts.items.map((h) => {
              const monitoring = monitoringLine({ status: h.status, marketplaces: h.activity.marketplaces.map((m) => m.marketplace), archivedAt: null }, h.activity, loadedAt);
              const counts = countsLine(h.activity);
              return (
                <Pressable
                  key={h.id}
                  onPress={() => router.push({ pathname: '/hunts/[id]', params: { id: h.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={[h.name, monitoring.text, counts].filter(Boolean).join('. ')}
                  style={({ pressed }) => [styles.huntRow, pressed && styles.pressed]}
                >
                  <Text style={[styles.body, font('semibold')]}>{h.name}</Text>
                  <View style={[styles.monitoring, monitoring.tone === 'fresh' && styles.warn]}>
                    {/* "Working" mascot has no approved art yet: the normal loading UI. */}
                    {monitoring.scanning && <ActivityIndicator size="small" color={roles.text} />}
                    <Text style={[styles.muted, font('regular')]}>{monitoring.text}</Text>
                  </View>
                  {counts && <Text style={[styles.muted, font('regular')]}>{counts}</Text>}
                </Pressable>
              );
            })}
          </Card>
        )}
      </View>

      {/* 3. Realized profit */}
      <Card title={`Realized profit · ${profit.periodLabel}`}>
        <Metric label="Realized profit" value={profit.realized?.value ?? '-'} tone={profit.realized?.tone ?? 'neutral'} caption={profit.caption} />
        <Text style={[styles.muted, font('regular')]}>{`Bought ${profit.bought} · Sold ${profit.sold} · Holding ${profit.holding}`}</Text>
        {profit.otherCurrencies.map((line) => (
          <Text key={line} style={[styles.muted, font('regular')]}>
            {line}
          </Text>
        ))}
        {(profit.holding > 0 || profit.sold > 0) && (
          <View style={styles.start}>
            <Button variant="secondary" onPress={() => router.push('/inventory')}>
              {profit.holding > 0 ? `Inventory · ${profit.holding} holding` : 'Inventory'}
            </Button>
          </View>
        )}
      </Card>

      {/* 4. Recent - only when there is something */}
      {home.recent.length > 0 && (
        <Card title="Recent">
          {home.recent.map((item) => {
            const view = recentView(item, context, loadedAt);
            return (
              <Pressable
                key={`${item.kind}-${item.at}-${item.title}`}
                disabled={!view.dealId}
                onPress={() => view.dealId && router.push({ pathname: '/deals/[id]', params: { id: view.dealId } })}
                accessibilityRole={view.dealId ? 'button' : undefined}
                style={styles.recentRow}
              >
                <Text style={[styles.body, styles.flex, font('regular')]}>
                  <Text style={font('semibold')}>{view.label}</Text> {view.title}
                  {view.amount ? ` · ${view.amount}` : ''}
                </Text>
                <Text style={[styles.muted, font('regular')]}>{view.when}</Text>
              </Pressable>
            );
          })}
        </Card>
      )}

      {/* 5. One recommendation ("thinking" mascot has no approved art: none shown) */}
      {rec && (
        <SystemBanner
          tone={rec.kind === 'issue' ? 'warning' : 'info'}
          title={rec.title}
          message={rec.body}
          action={
            <Button variant="secondary" onPress={() => router.push(targetHref(rec.target))}>
              {rec.actionLabel}
            </Button>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[2] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: roles.text, fontSize: fontSize.lg },
  lead: { color: roles.text, fontSize: fontSize.md },
  body: { color: roles.text, fontSize: fontSize.md },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  huntRow: { gap: 2, paddingVertical: space[1] },
  pressed: { opacity: 0.7 },
  monitoring: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  warn: { paddingLeft: space[2], borderLeftWidth: 3, borderLeftColor: tones.fresh.accent },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3], paddingVertical: space[1] },
});
