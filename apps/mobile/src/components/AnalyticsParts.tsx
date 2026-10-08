import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { AnalyticsPeriod } from '@rein-drop/api-client';
import { ANALYTICS_PERIOD_OPTIONS, analyticsTargetPath, type AnalyticsRecommendation, type Bar, type MetricCard } from '@rein-drop/client-core';
import { brand, fontSize, radius, roles, size, space, tones } from '@rein-drop/design-tokens';
import { mascotAssets } from '@/brand/assets';
import { Button, ChoiceGroup, font } from '@/ui';

export const TONE_COLOR = { profit: brand.green, loss: brand.lossRed, neutral: roles.text, info: brand.navy } as const;

/** Loads analytics for a period; reloads on focus and when the period changes. */
export function useAnalytics<T>(load: (period: AnalyticsPeriod) => Promise<T>, period: AnalyticsPeriod) {
  type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };
  const [state, setState] = useState<State>({ status: 'loading' });
  const fetch = useCallback(() => {
    let cancelled = false;
    load(period).then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      cancelled = true;
    };
    // `load` is a stable module-level function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);
  useFocusEffect(fetch);
  const retry = () => {
    setState({ status: 'loading' });
    fetch();
  };
  return { state, retry, reset: () => setState({ status: 'loading' }) };
}

export function PeriodChips({ value, onChange }: { value: AnalyticsPeriod; onChange: (p: AnalyticsPeriod) => void }) {
  return <ChoiceGroup legend="Period" hideLegend options={ANALYTICS_PERIOD_OPTIONS} value={value} onChange={onChange} />;
}

/** A labelled number; the basis (Realized / Estimated / Now / Activity) is always visible. */
export function MetricTile({ card }: { card: MetricCard }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${card.label}, ${card.basis}: ${card.value}. ${card.caption ?? ''}`}>
      <View style={styles.tileHead}>
        <Text style={[styles.muted, font('medium')]}>{card.label}</Text>
        <Text style={[styles.basis, card.basis === 'Estimated' && styles.basisEstimated, font('medium')]}>{card.basis}</Text>
      </View>
      <Text style={[styles.value, font('extrabold'), { color: TONE_COLOR[card.tone] }]}>{card.value}</Text>
      {card.caption && <Text style={[styles.small, font('regular')]}>{card.caption}</Text>}
    </View>
  );
}

/** Horizontal bars. Text carries the meaning; the bar is decoration. */
export function Bars({ bars, label }: { bars: Bar[]; label: string }) {
  return (
    <View style={styles.bars} accessibilityLabel={label}>
      {bars.map((b) => (
        <View key={b.label} style={styles.barRow} accessible accessibilityLabel={`${b.label}: ${b.value}`}>
          <Text style={[styles.barLabel, font('regular')]} numberOfLines={1}>
            {b.label}
          </Text>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${b.widthPercent}%`, backgroundColor: TONE_COLOR[b.tone] }]} />
          </View>
          <Text style={[styles.barValue, font('semibold')]}>{b.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** The one recommendation; the thinking / idea mascot only here, and only approved art (none yet). */
export function RecommendationBox({ recommendation, period }: { recommendation: AnalyticsRecommendation; period: AnalyticsPeriod }) {
  const router = useRouter();
  const art = mascotAssets.suggestion;
  return (
    <View style={styles.recommendation}>
      {art && <Image source={art} style={styles.art} accessibilityIgnoresInvertColors />}
      <View style={styles.flex}>
        <Text style={[styles.small, font('regular')]}>Based on your numbers</Text>
        <Text style={[styles.heading, font('bold')]} accessibilityRole="header">
          {recommendation.title}
        </Text>
        <Text style={[styles.body, font('regular')]}>{recommendation.body}</Text>
        <View style={styles.start}>
          <Button variant="secondary" onPress={() => router.push(analyticsTargetPath(recommendation.target, period) as Href)}>
            {recommendation.actionLabel}
          </Button>
        </View>
      </View>
    </View>
  );
}

export const analyticsStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  heading: { color: roles.text, fontSize: fontSize.lg },
  body: { color: roles.text, fontSize: fontSize.md, flexShrink: 1 },
  muted: { color: roles.textMuted, fontSize: fontSize.sm, flexShrink: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3] },
  item: { gap: space[1], padding: space[4], borderWidth: size.borderWidth, borderColor: roles.border, borderRadius: radius.md, backgroundColor: roles.surface },
  potential: { gap: space[1], padding: space[4], borderWidth: size.borderWidth, borderStyle: 'dashed', borderColor: roles.textMuted, borderRadius: radius.md },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});

const styles = StyleSheet.create({
  flex: { flex: 1, gap: space[2] },
  start: { alignSelf: 'flex-start' },
  heading: { color: roles.text, fontSize: fontSize.lg },
  body: { color: roles.text, fontSize: fontSize.md },
  muted: { color: roles.textMuted, fontSize: fontSize.sm, flexShrink: 1 },
  small: { color: roles.textMuted, fontSize: fontSize.sm },
  tile: { flexBasis: '47%', flexGrow: 1, gap: space[1], padding: space[3], borderWidth: size.borderWidth, borderColor: roles.border, borderRadius: radius.md, backgroundColor: roles.surface },
  tileHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[1] },
  basis: { paddingHorizontal: space[2], borderRadius: radius.full, backgroundColor: tones.neutral.background, color: roles.text, fontSize: fontSize.xs, overflow: 'hidden' },
  basisEstimated: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: roles.textMuted },
  value: { fontSize: fontSize.xl },
  bars: { gap: space[2] },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  barLabel: { width: 96, color: roles.text, fontSize: fontSize.sm },
  track: { flex: 1, height: 12, borderRadius: radius.full, backgroundColor: tones.neutral.background, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: radius.full },
  barValue: { minWidth: 40, textAlign: 'right', color: roles.text, fontSize: fontSize.sm },
  recommendation: { flexDirection: 'row', gap: space[3], padding: space[4], borderLeftWidth: 4, borderLeftColor: brand.yellow, borderRadius: radius.md, backgroundColor: tones.fresh.background },
  art: { width: 64, height: 64, resizeMode: 'contain' },
});
