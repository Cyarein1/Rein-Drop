import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { roles, space } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { font } from './fonts';
import { colors, GUTTER, type } from './theme';

export interface ScreenProps {
  /** Intro line under the header title. Keep it short - or leave it out; phone screens rarely need one. */
  description?: string;
  /** Scrollable content (default). Set false for screens that manage their own lists. */
  scroll?: boolean;
  /**
   * plain = white with the gutter; grouped = grey background for ListSection groups (Account,
   * settings, forms); bare = white, no padding (edge-to-edge rows manage their own gutter).
   */
  variant?: 'plain' | 'grouped' | 'bare';
  /** Pull to refresh (scrollable screens): called on pull; `refreshing` shows the spinner. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Fixed content after the scroll area (an `ActionBar`). */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Screen container. The title lives in the native header (stack screens) or `LargeTitleHeader`
 * (tab screens); the header / tab bar own the safe areas. Web counterpart: `Page`.
 */
export function Screen({ description, scroll = true, variant = 'plain', onRefresh, refreshing = false, footer, children }: ScreenProps) {
  const t = useT();
  const bg = variant === 'grouped' ? colors.grouped : roles.background;
  const content = [styles.content, variant === 'bare' && styles.bare, variant === 'grouped' && styles.grouped];
  const intro = description ? <Text style={[styles.description, font('regular'), variant === 'bare' && styles.bareIntro]}>{description}</Text> : null;

  const body = !scroll ? (
    <View style={[...content, styles.fill, { backgroundColor: bg }]}>
      {intro}
      {children}
    </View>
  ) : (
    <ScrollView
      style={[styles.fill, { backgroundColor: bg }]}
      contentContainerStyle={content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={roles.text} accessibilityLabel={t('common.pullToRefresh')} /> : undefined}
    >
      {intro}
      {children}
    </ScrollView>
  );
  if (!footer) return body;
  return (
    <View style={[styles.fill, { backgroundColor: bg }]}>
      {body}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingTop: space[3], paddingBottom: space[10], gap: space[4] },
  grouped: { gap: space[6] },
  bare: { paddingHorizontal: 0, paddingTop: 0, gap: 0 },
  description: { color: colors.textMuted, fontSize: type.callout, lineHeight: 20 },
  bareIntro: { paddingHorizontal: GUTTER, paddingVertical: space[2] },
});
