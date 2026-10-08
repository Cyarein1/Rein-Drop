import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { InventoryItem } from '@rein-drop/api-client';
import { huntFormContext, saleResultView } from '@rein-drop/client-core';
import { brand, fontSize, radius, roles, size, space, tones } from '@rein-drop/design-tokens';
import { useSessionState } from '@/auth/SessionProvider';
import { mascotAssets } from '@/brand/assets';
import { getApiClient } from '@/config/api';
import { Button, Card, EmptyState, font, LoadingState, Metric, Screen, SystemBanner } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; item: InventoryItem };

const TONE_COLOR = { profit: brand.green, loss: brand.lossRed, neutral: roles.text } as const;

/** Sale result (screen 23): realized P/L first, then expected vs actual, one insight, Done. */
export default function SaleResultScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state: session } = useSessionState();
  const context = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null);
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetchItem = useCallback(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getApiClient().getInventoryItem(id))
      .then(
        (item) => !cancelled && setLoad({ status: 'ready', item }),
        (err: unknown) => !cancelled && setLoad({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, [id]);
  useFocusEffect(fetchItem);

  const view = load.status === 'ready' ? saleResultView(load.item, context) : null;
  // Success / profit art only for money actually made (Mascot Usage Guide) - and only approved art.
  const art = view?.celebrate ? mascotAssets.profit : null;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Sale result' }} />
      {load.status === 'loading' && <LoadingState label="Loading the result…" />}
      {load.status === 'error' && <SystemBanner tone="error" title="Couldn't load the result" message={load.message} />}
      {load.status === 'ready' && !view && (
        <Card>
          <EmptyState
            title="Not sold yet"
            description="The result appears once you mark this item sold. Until then it's neither a profit nor a loss."
            action={<Button onPress={() => router.replace({ pathname: '/inventory/[id]/sell', params: { id } })}>Mark sold</Button>}
          />
        </Card>
      )}
      {view && (
        <>
          <Text style={[styles.muted, font('regular')]}>{view.title}</Text>
          <View style={[styles.hero, view.celebrate && styles.celebrate]}>
            {art && <Image source={art} style={styles.art} accessibilityIgnoresInvertColors />}
            <View style={styles.flex}>
              <Metric label={view.headline} value={view.value} tone={view.tone} caption={view.summary ?? undefined} />
            </View>
          </View>
          <Text style={[styles.insight, font('medium')]}>{view.insight}</Text>

          <Card title="Expected vs actual">
            {view.comparisons.map((c) => (
              <View key={c.label} style={styles.compare} accessible accessibilityLabel={`${c.label}: ${c.expectedLabel.toLowerCase()} ${c.expected}, actual ${c.actual}${c.difference ? `, difference ${c.difference}` : ''}`}>
                <Text style={[styles.body, font('semibold')]}>{c.label}</Text>
                <View style={styles.line}>
                  <Text style={[styles.muted, font('regular')]}>{c.expectedLabel}</Text>
                  <Text style={[styles.body, font('regular')]}>{c.expected}</Text>
                </View>
                <View style={styles.line}>
                  <Text style={[styles.muted, font('regular')]}>Actual</Text>
                  <Text style={[styles.body, font('semibold')]}>{c.actual}</Text>
                </View>
                {c.difference && (
                  <View style={styles.line}>
                    <Text style={[styles.muted, font('regular')]}>Difference</Text>
                    <Text style={[styles.body, font('bold'), { color: TONE_COLOR[c.tone] }]}>{c.difference}</Text>
                  </View>
                )}
              </View>
            ))}
            <Text style={[styles.muted, font('regular')]}>{view.comparisonNote}</Text>
          </Card>

          <Card title="How it adds up">
            {view.breakdown.map(([label, value], i) => (
              <View key={`${label}-${i}`} style={styles.line}>
                <Text style={[styles.body, font('regular')]}>{label}</Text>
                <Text style={[styles.body, font('semibold')]}>{value}</Text>
              </View>
            ))}
            <View style={[styles.line, styles.total]}>
              <Text style={[styles.body, font('bold')]}>{view.headline}</Text>
              <Text style={[styles.body, font('bold'), { color: TONE_COLOR[view.tone] }]}>{view.value}</Text>
            </View>
          </Card>

          <Button fullWidth onPress={() => router.dismissTo('/inventory')}>
            Done
          </Button>
          <Button variant="text" onPress={() => router.push({ pathname: '/inventory/[id]/sell', params: { id } })}>
            Correct the sale
          </Button>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { color: roles.text, fontSize: fontSize.md, flexShrink: 1 },
  muted: { color: roles.textMuted, fontSize: fontSize.sm, flexShrink: 1 },
  insight: { color: roles.text, fontSize: fontSize.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[4], borderRadius: radius.md, backgroundColor: tones.info.background },
  celebrate: { backgroundColor: tones.profit.background, borderLeftWidth: 4, borderLeftColor: brand.green },
  art: { width: 80, height: 80, resizeMode: 'contain' },
  compare: { gap: space[1], paddingBottom: space[2], borderBottomWidth: size.borderWidth, borderBottomColor: roles.border },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
  total: { borderTopWidth: size.borderWidth, borderTopColor: roles.border, paddingTop: space[2] },
});
