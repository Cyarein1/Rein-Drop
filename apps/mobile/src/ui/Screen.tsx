import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
import { font } from './fonts';

export interface ScreenProps {
  /** Intro line under the native header title. */
  description?: string;
  /** Scrollable content (default). Set false for screens that manage their own lists. */
  scroll?: boolean;
  children: ReactNode;
}

/**
 * Screen container: white canvas and standard padding. The screen title lives in the
 * native header, and the header / tab bar own the safe areas, so Screen adds none.
 * Web counterpart: `Page`.
 */
export function Screen({ description, scroll = true, children }: ScreenProps) {
  const intro = description ? (
    <Text style={[styles.description, font('regular')]}>{description}</Text>
  ) : null;

  if (!scroll) {
    return (
      <View style={[styles.content, styles.fill]}>
        {intro}
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      {intro}
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: roles.background },
  content: { padding: space[4], paddingBottom: space[12], gap: space[4] },
  description: { color: roles.textMuted, fontSize: fontSize.md },
});
