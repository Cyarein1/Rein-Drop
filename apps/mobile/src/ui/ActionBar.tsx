import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@rein-drop/design-tokens';
import { colors, GUTTER } from './theme';

/**
 * The fixed bar at the bottom of a detail screen or step (deal: View on eBay / I bought it;
 * Create Hunt: Continue). Put it AFTER the scrolling content, as a sibling, so it never scrolls
 * away. Buttons inside share the width (`Button fullWidth` or flex: 1 children).
 */
export function ActionBar({ children, stacked = false }: { children: ReactNode; stacked?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, stacked ? styles.stacked : styles.row, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: space[3],
    paddingHorizontal: GUTTER,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    backgroundColor: colors.background,
    gap: space[2],
  },
  row: { flexDirection: 'row' },
  stacked: { flexDirection: 'column' },
});
