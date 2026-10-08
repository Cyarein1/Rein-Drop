import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import type { AnalyticsPeriod } from '@rein-drop/api-client';
import { huntFormContext, isAnalyticsPeriod, lossReview, periodLabel, productRowsView, type ProductRowView } from '@rein-drop/client-core';
import { useSessionState } from '@/auth/SessionProvider';
import { analyticsStyles as s, Bars, PeriodChips, TONE_COLOR, useAnalytics } from '@/components/AnalyticsParts';
import { getApiClient } from '@/config/api';
import { Button, Card, EmptyState, font, LoadingState, Screen, SystemBanner } from '@/ui';

const load = (period: AnalyticsPeriod) => getApiClient().getProductAnalytics({ period });

/** Product analytics (screen 26): best realized results, margin, velocity, and the loss review. */
export default function ProductAnalyticsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ period?: string }>();
  const { state: session } = useSessionState();
  const ctx = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null);
  const [period, setPeriod] = useState<AnalyticsPeriod>(isAnalyticsPeriod(params.period) ? params.period : '30d');
  const { state, retry, reset } = useAnalytics(load, period);
  const rows = state.status === 'ready' ? productRowsView(state.data.items, ctx) : [];
  const losses = state.status === 'ready' ? lossReview(state.data.items, ctx) : [];

  return (
    <Screen description="Which products actually make money, and how fast they sell.">
      <PeriodChips
        value={period}
        onChange={(p) => {
          reset();
          setPeriod(p);
        }}
      />
      <Text style={[s.muted, font('regular')]}>{periodLabel(period)}. Profit and margin are realized from recorded sales, after costs.</Text>
      {state.status === 'loading' && <LoadingState label="Loading product analytics…" />}
      {state.status === 'error' && <SystemBanner tone="error" title="Couldn't load product analytics" message={state.message} action={<Button variant="secondary" onPress={retry}>Try again</Button>} />}
      {state.status === 'ready' && rows.length === 0 && (
        <Card>
          <EmptyState title="No products yet" description="Products appear once you buy something." action={<Button onPress={() => router.navigate('/deals')}>Go to deals</Button>} />
        </Card>
      )}
      {rows.some((r) => r.bar) && (
        <Card title="Realized profit by product">
          <Bars bars={rows.filter((r) => r.bar).map((r) => r.bar!)} label="Realized profit by product" />
        </Card>
      )}
      {rows.length > 0 && (
        <>
          <Text style={[s.heading, font('bold')]} accessibilityRole="header">
            All products
          </Text>
          <ProductList rows={rows} />
          <Text style={[s.heading, font('bold')]} accessibilityRole="header">
            Loss review
          </Text>
          {losses.length === 0 ? <Text style={[s.muted, font('regular')]}>No product lost money in this period.</Text> : <ProductList rows={losses} />}
        </>
      )}
    </Screen>
  );
}

function ProductList({ rows }: { rows: ProductRowView[] }) {
  return (
    <>
      {rows.map((r) => (
        <View key={r.key} style={s.item}>
          <View style={s.row}>
            <Text style={[s.body, font('semibold')]}>{r.name}</Text>
            {r.realized ? <Text style={[s.body, font('bold'), { color: TONE_COLOR[r.realized.tone] }]}>{r.realized.value}</Text> : <Text style={[s.muted, font('regular')]}>Not sold yet</Text>}
          </View>
          <Text style={[s.muted, font('regular')]}>{[r.counts, r.realized?.margin, r.avgDays].filter(Boolean).join(' · ')}</Text>
        </View>
      ))}
    </>
  );
}
