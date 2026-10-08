import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import type { AnalyticsPeriod } from '@rein-drop/api-client';
import { funnelView, huntFormContext, isAnalyticsPeriod, periodLabel } from '@rein-drop/client-core';
import { useSessionState } from '@/auth/SessionProvider';
import { analyticsStyles as s, Bars, PeriodChips, TONE_COLOR, useAnalytics } from '@/components/AnalyticsParts';
import { getApiClient } from '@/config/api';
import { Badge, Button, Card, EmptyState, font, LoadingState, Screen, SystemBanner } from '@/ui';

const load = (period: AnalyticsPeriod) => getApiClient().getHuntAnalytics({ period });

/** Hunt analytics (screen 25): found -> alerted -> viewed -> saved -> bought -> sold, per Hunt. */
export default function HuntAnalyticsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ period?: string }>();
  const { state: session } = useSessionState();
  const ctx = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null);
  const [period, setPeriod] = useState<AnalyticsPeriod>(isAnalyticsPeriod(params.period) ? params.period : '30d');
  const { state, retry, reset } = useAnalytics(load, period);

  return (
    <Screen description="How each Hunt turns deals into purchases and sales.">
      <PeriodChips
        value={period}
        onChange={(p) => {
          reset();
          setPeriod(p);
        }}
      />
      <Text style={[s.muted, font('regular')]}>{periodLabel(period)}. Each step counts what happened in the period; profit is realized from recorded sales.</Text>
      {state.status === 'loading' && <LoadingState label="Loading Hunt analytics…" />}
      {state.status === 'error' && <SystemBanner tone="error" title="Couldn't load Hunt analytics" message={state.message} action={<Button variant="secondary" onPress={retry}>Try again</Button>} />}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <Card>
          <EmptyState title="No Hunts yet" description="Create a Hunt and its funnel appears here." action={<Button onPress={() => router.push('/hunts/new')}>Create Hunt</Button>} />
        </Card>
      )}
      {state.status === 'ready' &&
        state.data.items.map((h) => {
          const view = funnelView(h, ctx);
          return (
            <Card key={h.huntId} title={h.name} action={<Badge tone={h.status === 'LIVE' ? 'profit' : 'neutral'}>{h.status === 'LIVE' ? 'Live' : h.status.charAt(0) + h.status.slice(1).toLowerCase()}</Badge>}>
              {view.quiet ? (
                <Text style={[s.muted, font('regular')]}>Nothing happened in this period.</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  <Bars bars={view.stages} label={`${h.name}: found to sold`} />
                  <Text style={[s.muted, font('regular')]}>{[`${h.ignored} ignored`, view.rates].filter(Boolean).join(' · ')}</Text>
                  <Text style={[s.body, font('regular')]}>
                    Realized profit:{' '}
                    {view.realized ? <Text style={[font('bold'), { color: TONE_COLOR[view.realized.tone] }]}>{view.realized.value}</Text> : <Text style={s.muted}>no sales yet</Text>}
                  </Text>
                </View>
              )}
            </Card>
          );
        })}
    </Screen>
  );
}
