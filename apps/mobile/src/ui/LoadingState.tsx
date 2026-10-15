import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { font } from './fonts';

export interface LoadingStateProps {
  /** Announced to screen readers and shown under the spinner. */
  label?: string;
}

/** Inline loading state. Plain spinner - no mascot (Mascot Usage Guide, section 7). */
export function LoadingState({ label }: LoadingStateProps) {
  const t = useT();
  const text = label ?? t('common.loading');
  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={text}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator size="large" color={roles.text} />
      <Text style={[styles.label, font('regular')]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: space[3], paddingVertical: space[8] },
  label: { color: roles.textMuted, fontSize: fontSize.sm },
});
