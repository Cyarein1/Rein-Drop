import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { radius, space } from '@rein-drop/design-tokens';
import { font } from './fonts';
import { colors, type } from './theme';

export interface CardProps extends ViewProps {
  title?: string;
  /** Shown to the right of the title, e.g. a Badge. */
  action?: ReactNode;
}

/**
 * A white rounded surface for a block of content. On a white screen it has a hairline border;
 * on a `grouped` (grey) screen it sits borderless like a settings group. Don't nest cards, and
 * prefer edge-to-edge rows (ListRow / list items) over cards for lists.
 */
export function Card({ title, action, children, style, ...rest }: CardProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {(title || action) && (
        <View style={styles.header}>
          {title && (
            <Text accessibilityRole="header" style={[styles.title, font('semibold')]}>
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
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignSelf: 'stretch',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  title: { color: colors.text, fontSize: type.headline, flexShrink: 1 },
});
