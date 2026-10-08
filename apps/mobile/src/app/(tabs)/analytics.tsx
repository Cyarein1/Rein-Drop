import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Text, View } from 'react-native';
import type { AnalyticsPeriod } from '@rein-drop/api-client';
import {
  analyticsRecommendation,
  funnelView,
  huntFormContext,
  marketplaceRowsView,
  missedView,
  overviewView,
  periodLabel,
  productRowsView,
} from '@rein-drop/client-core';
import { useSessionState } from '@/auth/SessionProvider';
import { analyticsStyles as s, Bars, MetricTile, PeriodChips, RecommendationBox, TONE_COLOR, useAnalytics } from '@/components/AnalyticsParts';
import { getApiClient } from '@/config/api';
import { Button, Card, EmptyState, font, LoadingState, Screen, SystemBanner } from '@/ui';

const loadAll = (period: AnalyticsPeriod) => {
  const api = getApiClient();
  return Promise.all([
    api.getAnalyticsOverview({ period }),
    api.getHuntAnalytics({ period }),
    api.getProductAnalytics({ period }),
    api.getMarketplaceAnalytics({ period }),
    api.getMissedPotential({ period }),
  ]);
};

/**
 * Analytics overview (screen 24): realized results, where they came from, missed potential kept
 * apart, and one recommendation. No mascot in the dense parts (Mascot Usage Guide, section 7).
 */
export default function AnalyticsScreen() {
  const router = useRouter();
  const { state: session } = useSessionState();
  const ctx = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null);
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const { state, retry, reset } = useAnalytics(loadAll, period);
  const go = (path: string) => router.push((period === '30d' ? path : `${path}?period=${period}`) as Href);

  return (
    <Screen description="What you bought, what you sold, and what actually made money.">
      <PeriodChips
        value={period}
        onChange={(p) => {
          reset();
          setPeriod(p);
        }}
      />
      <View style={s.links}>
        <Button variant="text" onPress={() => go('/analytics/hunts')}>
          Hunts
        </Button>
        <Button variant="text" onPress={() => go('/analytics/products')}>
          Products
        </Button>
        <Button variant="text" onPress={() => go('/analytics/missed')}>
          Missed potential
        </Button>
        <Button variant="text" onPress={() => router.push('/inventory')}>
          Inventory
        </Button>
      </View>
      {state.status === 'loading' && <LoadingState label="Loading your analytics…" />}
      {state.status === 'error' && (
        <SystemBanner
          tone="error"
          title="Couldn't load your analytics"
          message={state.message}
          action={
            <Button variant="secondary" onPress={retry}>
              Try again
            </Button>
          }
        />
      )}
      {state.status === 'ready' && <Overview data={state.data} ctx={ctx} period={period} go={go} />}
    </Screen>
  );
}

function Overview({
  data: [overview, hunts, products, marketplaces, missed],
  ctx,
  period,
  go,
}: {
  data: Awaited<ReturnType<typeof loadAll>>;
  ctx: ReturnType<typeof huntFormContext>;
  period: AnalyticsPeriod;
  go: (path: string) => void;
}) {
  const view = overviewView(overview, ctx);
  const recommendation = analyticsRecommendation({ overview, hunts, products, missed }, ctx);
  const missedSummary = missedView(missed, ctx);
  const activeHunts = hunts.items.map((h) => funnelView(h, ctx)).filter((h) => !h.quiet).slice(0, 3);
  const topProducts = productRowsView(products.items, ctx).filter((p) => p.bar).slice(0, 5);

  return (
    <>
      <Text style={[s.muted, font('regular')]}>{periodLabel(period)}. Realized = from sales you recorded. Estimated = Rein Drop&apos;s estimate, never profit.</Text>
      {!view.hasActivity ? (
        <Card>
          <EmptyState
            title="Nothing bought or sold in this period"
            description="Analytics come from what you buy and sell. Mark a deal Bought, then mark it sold from Inventory."
            action={<Button onPress={() => go('/deals')}>Go to deals</Button>}
          />
        </Card>
      ) : (
        <>
          <View style={s.grid}>
            {view.cards.map((c) => (
              <MetricTile key={c.label} card={c} />
            ))}
          </View>
          {view.otherCurrencies.map((line) => (
            <Text key={line} style={[s.muted, font('regular')]}>
              {line}
            </Text>
          ))}
          <Card title="Money in vs realized profit">
            <Bars bars={view.moneyBars} label={`Capital deployed and realized profit, ${view.currency}`} />
          </Card>
        </>
      )}

      {recommendation && <RecommendationBox recommendation={recommendation} period={period} />}

      <Card title="Hunts">
        {activeHunts.length === 0 ? (
          <Text style={[s.muted, font('regular')]}>No Hunt activity in this period.</Text>
        ) : (
          activeHunts.map((h) => (
            <View key={h.huntId} style={{ gap: 8 }}>
              <View style={s.row}>
                <Text style={[s.body, font('semibold')]}>{h.name}</Text>
                {h.realized && <Text style={[s.body, font('bold'), { color: TONE_COLOR[h.realized.tone] }]}>{h.realized.value}</Text>}
              </View>
              <Bars bars={h.stages} label={`${h.name}: found to sold`} />
              {h.rates && <Text style={[s.muted, font('regular')]}>{h.rates}</Text>}
            </View>
          ))
        )}
      </Card>

      <Card title="Products">
        {topProducts.length === 0 ? (
          <Text style={[s.muted, font('regular')]}>No sold products in this period.</Text>
        ) : (
          <Bars bars={topProducts.map((p) => p.bar!)} label="Realized profit by product" />
        )}
      </Card>

      <Card title="Marketplaces">
        {marketplaceRowsView(marketplaces, ctx).map((m) => (
          <View key={m.name} style={{ gap: 2 }}>
            <View style={s.row}>
              <Text style={[s.body, font('semibold')]}>{m.name}</Text>
              {m.realized && <Text style={[s.body, font('bold'), { color: TONE_COLOR[m.realized.tone] }]}>{m.realized.value}</Text>}
            </View>
            <Text style={[s.muted, font('regular')]}>Sourced: {m.sourced}</Text>
            <Text style={[s.muted, font('regular')]}>{m.soldHere}</Text>
          </View>
        ))}
      </Card>

      <View style={s.potential}>
        <Text style={[s.heading, font('bold')]} accessibilityRole="header">
          Missed potential
        </Text>
        <Text style={[s.body, font('semibold')]}>{missedSummary.headline}</Text>
        {missedSummary.potential && <Text style={[s.body, font('regular')]}>Estimated: {missedSummary.potential.value}</Text>}
        <Text style={[s.muted, font('regular')]}>Not a loss: missed deals never count against your profit.</Text>
        <View style={{ alignSelf: 'flex-start' }}>
          <Button variant="text" onPress={() => go('/analytics/missed')}>
            Details
          </Button>
        </View>
      </View>
    </>
  );
}
