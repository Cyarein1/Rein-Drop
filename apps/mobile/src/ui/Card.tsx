import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { fontSize, radius, roles, size, space } from '@rein-drop/design-tokens';
import { font } from './fonts';

export interface CardProps extends ViewProps {
  title?: string;
  /** Shown to the right of the title, e.g. a Badge. */
  action?: ReactNode;
}

/** White surface, subtle border, ~12px radius (Mobile UI Screenbook, section 1). */
export function Card({ title, action, children, style, ...rest }: CardProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {(title || action) && (
        <View style={styles.header}>
          {title && (
            <Text accessibilityRole="header" style={[styles.title, font('bold')]}>
              {title}
            </Text>
          )}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[3],
    padding: space[4],
    borderWidth: size.borderWidth,
    borderColor: roles.border,
    borderRadius: radius.md,
    backgroundColor: roles.surface,
    alignSelf: 'stretch',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  title: { color: roles.text, fontSize: fontSize.lg, flexShrink: 1 },
});
