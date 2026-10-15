import { StyleSheet, Text, View } from 'react-native';
import { radius, roles, space, type MetricTone } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { font } from './fonts';
import { colors, type } from './theme';

export interface MetricProps {
  label: string;
  /** Pre-formatted value (formatting money/percent is the caller's job). */
  value: string;
  /** profit = Profit Green, loss = Loss Red (realized only - never for missed potential). */
  tone?: MetricTone;
  /** Estimated values must be explicitly labeled (Screenbook, section 1). */
  estimated?: boolean;
  comparison?: { label: string; value: string };
  caption?: string;
}

// 20 pt is below WCAG "large text", so green / red use the darker AA text shades.
const VALUE_COLOR: Record<MetricTone, string> = {
  neutral: roles.text,
  profit: colors.profitText,
  loss: colors.lossText,
};

export function Metric({ label, value, tone = 'neutral', estimated, comparison, caption }: MetricProps) {
  const t = useT();
  return (
    <View style={styles.metric} accessible accessibilityLabel={t(estimated ? 'common.metricA11yEstimated' : 'common.metricA11y', { label, value })}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, font('medium')]}>{label}</Text>
        {estimated && <Text style={[styles.estimated, font('medium')]}>{t('common.estimated')}</Text>}
      </View>
      <Text style={[styles.value, font('extrabold'), { color: VALUE_COLOR[tone] }]}>{value}</Text>
      {comparison && (
        <Text style={[styles.secondary, font('regular')]}>
          {comparison.label}: <Text style={[font('semibold'), { color: roles.text }]}>{comparison.value}</Text>
        </Text>
      )}
      {caption && <Text style={[styles.secondary, font('regular')]}>{caption}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  metric: { gap: space[1] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  label: { color: roles.textMuted, fontSize: type.footnote },
  estimated: {
    color: roles.textMuted,
    fontSize: type.caption,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: roles.textMuted,
    borderRadius: radius.full,
  },
  value: { fontSize: type.title, fontVariant: ['tabular-nums'] },
  secondary: { color: roles.textMuted, fontSize: type.footnote },
});
