import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { AnalyticsPeriod } from '@rein-drop/api-client';
import { huntFormContext, isAnalyticsPeriod, missedView, periodLabel } from '@rein-drop/client-core';
import { useSessionState } from '@/auth/SessionProvider';
import { analyticsStyles as s, PeriodChips, useAnalytics } from '@/components/AnalyticsParts';
import { getApiClient } from '@/config/api';
import { Badge, Button, Card, EmptyState, font, LoadingState, Screen, SystemBanner } from '@/ui';

const load = (period: AnalyticsPeriod) => getApiClient().getMissedPotential({ period });

/** Missed potential (screen 27): strong deals that got away. Estimated, and never a loss. */
export default function MissedPotentialScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ period?: string }>();
  const { state: session } = useSessionState();
  const ctx = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null);
  const [period, setPeriod] = useState<AnalyticsPeriod>(isAnalyticsPeriod(params.period) ? params.period : '30d');
  const { state, retry, reset } = useAnalytics(load, period);
  const view = state.status === 'ready' ? missedView(state.data, ctx) : null;

  return (
    <Screen description="Strong deals you didn't buy. Potential, not a loss.">
      <PeriodChips
        value={period}
        onChange={(p) => {
          reset();
          setPeriod(p);
        }}
      />
      {state.status === 'loading' && <LoadingState label="Loading missed potential…" />}
      {state.status === 'error' && <SystemBanner tone="error" title="Couldn't load missed potential" message={state.message} action={<Button variant="secondary" onPress={retry}>Try again</Button>} />}
      {view?.empty && (
        <Card>
          <EmptyState title={view.headline} description={`${periodLabel(period)}: every strong deal was either bought or is still open.`} />
        </Card>
      )}
      {view && !view.empty && (
        <>
          <View style={s.potential}>
            <Text style={[s.heading, font('bold')]}>{view.headline}</Text>
            <Text style={[s.muted, font('regular')]}>{view.breakdown}</Text>
            {view.potential ? (
              <>
                <Text style={[s.muted, font('medium')]}>Estimated potential (estimate)</Text>
                {/* Neutral colour on purpose: an estimate is neither profit nor loss. */}
                <Text style={[s.heading, font('extrabold')]}>{view.potential.value}</Text>
                <Text style={[s.muted, font('regular')]}>{view.potential.caption}</Text>
              </>
            ) : (
              <Text style={[s.muted, font('regular')]}>None of these had a resale estimate, so their potential can&apos;t be valued. It is never counted as a loss.</Text>
            )}
          </View>
          {view.items.map((i) => (
            <Pressable
              key={i.dealId}
              onPress={() => router.push({ pathname: '/deals/[id]', params: { id: i.dealId } })}
              accessibilityRole="button"
              accessibilityHint="Opens the deal"
              style={({ pressed }) => [s.item, pressed && { opacity: 0.85 }]}
            >
              <View style={s.row}>
                <Text style={[s.body, font('semibold')]}>{i.title}</Text>
                <Badge tone="neutral">{i.reason}</Badge>
              </View>
              <Text style={[s.muted, font('regular')]}>{i.meta}</Text>
              {i.estimate && <Text style={[s.muted, font('regular')]}>{i.estimate} (estimate)</Text>}
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}
