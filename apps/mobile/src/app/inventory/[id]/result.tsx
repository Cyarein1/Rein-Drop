import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { InventoryItem } from '@rein-drop/api-client';
import { saleResultView } from '@rein-drop/client-core';
import { brand, radius, space, tones } from '@rein-drop/design-tokens';
import { mascotAssets } from '@/brand/assets';
import { FactRow, Section } from '@/components/FormRows';
import { getApiClient } from '@/config/api';
import { useDisplayContext } from '@/i18n/useT';
import { ActionBar, Button, colors, EmptyState, font, LoadingState, Metric, Screen, SystemBanner, type } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; item: InventoryItem };

const TONE_COLOR = { profit: colors.profitText, loss: colors.lossText, neutral: colors.text } as const;

/** Sale result (screen 23): realized P/L first, then expected vs actual, one insight; Done at the bottom. */
export default function SaleResultScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const context = useDisplayContext();
  const { t } = context;
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
    <Screen
      footer={
        view ? (
          <ActionBar>
            <Button variant="secondary" size="large" fullWidth onPress={() => router.push({ pathname: '/inventory/[id]/sell', params: { id } })}>
              {t('inventory.correctSale')}
            </Button>
            <Button size="large" fullWidth onPress={() => router.dismissTo('/inventory')}>
              {t('inventory.done')}
            </Button>
          </ActionBar>
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: t('inventory.actionSaleResult') }} />
      {load.status === 'loading' && <LoadingState label={t('inventory.loadingResult')} />}
      {load.status === 'error' && <SystemBanner tone="error" title={t('inventory.loadResultFailed')} message={load.message} />}
      {load.status === 'ready' && !view && (
        <EmptyState
          title={t('inventory.notSoldTitle')}
          description={t('inventory.notSoldBody')}
          action={<Button onPress={() => router.replace({ pathname: '/inventory/[id]/sell', params: { id } })}>{t('inventory.actionMarkSold')}</Button>}
        />
      )}
      {view && (
        <>
          <Text style={[styles.title, font('semibold')]} accessibilityRole="header" numberOfLines={3}>
            {view.title}
          </Text>
          <View style={[styles.hero, view.celebrate && styles.celebrate]}>
            {art && <Image source={art} style={styles.art} accessibilityIgnoresInvertColors />}
            <View style={styles.flex}>
              <Metric label={view.headline} value={view.value} tone={view.tone} caption={view.summary ?? undefined} />
            </View>
          </View>
          <Text style={[styles.insight, font('medium')]}>{view.insight}</Text>

          <Section title={t('inventory.expectedVsActual')}>
            {view.comparisons.map((c) => (
              <View
                key={c.label}
                style={styles.compare}
                accessible
                accessibilityLabel={t('inventory.compareA11y', { label: c.label, expectedLabel: c.expectedLabel, expected: c.expected, actual: c.actual, hasDifference: c.difference ? 'yes' : 'no', difference: c.difference ?? '' })}
              >
                <Text style={[styles.compareTitle, font('semibold')]}>{c.label}</Text>
                <View style={styles.compareGrid}>
                  <Cell label={c.expectedLabel} value={c.expected} />
                  <Cell label={t('inventory.actual')} value={c.actual} strong />
                  {c.difference && <Cell label={t('inventory.difference')} value={c.difference} strong color={TONE_COLOR[c.tone]} />}
                </View>
              </View>
            ))}
            <Text style={[styles.note, font('regular')]}>{view.comparisonNote}</Text>
          </Section>

          <Section title={t('inventory.howItAddsUp')}>
            <View>
              {view.breakdown.map(([label, value], i) => (
                <FactRow key={`${label}-${i}`} label={label} value={value} />
              ))}
              <FactRow label={view.headline} value={view.value} strong tone={view.tone} last />
            </View>
          </Section>
        </>
      )}
    </Screen>
  );
}

function Cell({ label, value, strong, color = colors.text }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <View style={styles.cell}>
      <Text style={[styles.cellLabel, font('regular')]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.cellValue, font(strong ? 'bold' : 'semibold'), { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { color: colors.text, fontSize: type.title, lineHeight: 26 },
  insight: { color: colors.text, fontSize: type.body, lineHeight: 21 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space[4], padding: 14, borderRadius: radius.md, backgroundColor: colors.grouped },
  celebrate: { backgroundColor: tones.profit.background, borderLeftWidth: 4, borderLeftColor: brand.green },
  art: { width: 72, height: 72, resizeMode: 'contain' },
  compare: { gap: space[2], paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  compareTitle: { color: colors.text, fontSize: type.callout },
  compareGrid: { flexDirection: 'row', gap: space[3] },
  cell: { flex: 1, gap: 2 },
  cellLabel: { color: colors.textMuted, fontSize: type.footnote },
  cellValue: { fontSize: type.callout },
  note: { color: colors.textMuted, fontSize: type.footnote, paddingTop: space[2], lineHeight: 17 },
});
