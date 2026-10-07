import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
import { font } from './fonts';

export interface ScreenProps {
  title?: string;
  description?: string;
  /** Scrollable content (default). Set false for screens that manage their own lists. */
  scroll?: boolean;
  children: ReactNode;
}

/** Screen container: safe areas, white canvas, standard padding. Web counterpart: `Page`. */
export function Screen({ title, description, scroll = true, children }: ScreenProps) {
  const header = (title || description) && (
    <View style={styles.header}>
      {title && (
        <Text accessibilityRole="header" style={[styles.title, font('extrabold')]}>
          {title}
        </Text>
      )}
      {description && <Text style={[styles.description, font('regular')]}>{description}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: roles.background },
  fill: { flex: 1 },
  content: { padding: space[4], paddingBottom: space[12], gap: space[4] },
  header: { gap: space[1] },
  title: { color: roles.text, fontSize: fontSize['2xl'] },
  description: { color: roles.textMuted, fontSize: fontSize.md },
});
