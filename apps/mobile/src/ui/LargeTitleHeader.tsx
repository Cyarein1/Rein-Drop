import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@rein-drop/design-tokens';
import { font } from './fonts';
import { colors, GUTTER, type } from './theme';

/**
 * A tab screen's own header (the tab navigator's header is hidden): large title on the left,
 * icon buttons on the right, and optional content below (search, chips). The buttons keep the
 * screen gutter from the edge - the right-hand icons used to sit almost on the screen edge.
 */
export function LargeTitleHeader({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space[2] }]}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[styles.title, font('bold')]} numberOfLines={1}>
          {title}
        </Text>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: GUTTER, paddingBottom: space[2], gap: space[3], backgroundColor: colors.background },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  title: { flex: 1, color: colors.text, fontSize: type.largeTitle, letterSpacing: -0.5 },
  // 44 pt buttons; the icon glyph ends ~ GUTTER + 11 pt from the screen edge.
  actions: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
});
