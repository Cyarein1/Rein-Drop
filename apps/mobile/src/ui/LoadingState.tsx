import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
import { font } from './fonts';

export interface LoadingStateProps {
  /** Announced to screen readers and shown under the spinner. */
  label?: string;
}

/** Inline loading state. Plain spinner - no mascot (Mascot Usage Guide, section 7). */
export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={roles.text} />
      <Text style={[styles.label, font('regular')]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: space[3], paddingVertical: space[8] },
  label: { color: roles.textMuted, fontSize: fontSize.sm },
});
