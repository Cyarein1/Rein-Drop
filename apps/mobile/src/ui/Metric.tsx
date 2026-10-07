import { StyleSheet, Text, View } from 'react-native';
import { brand, fontSize, radius, roles, space, type MetricTone } from '@rein-drop/design-tokens';
import { font } from './fonts';

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

// KPI size (28px, 800 weight) so green/red text meet WCAG AA-large.
const VALUE_COLOR: Record<MetricTone, string> = {
  neutral: roles.text,
  profit: brand.green,
  loss: brand.lossRed,
};

export function Metric({ label, value, tone = 'neutral', estimated, comparison, caption }: MetricProps) {
  return (
    <View style={styles.metric} accessible accessibilityLabel={`${label}${estimated ? ', estimated' : ''}: ${value}`}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, font('medium')]}>{label}</Text>
        {estimated && <Text style={[styles.estimated, font('medium')]}>Estimated</Text>}
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
  label: { color: roles.textMuted, fontSize: fontSize.sm },
  estimated: {
    color: roles.textMuted,
    fontSize: fontSize.xs,
    paddingHorizontal: space[2],
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: roles.textMuted,
    borderRadius: radius.full,
  },
  value: { fontSize: fontSize['2xl'], fontVariant: ['tabular-nums'] },
  secondary: { color: roles.textMuted, fontSize: fontSize.sm },
});
