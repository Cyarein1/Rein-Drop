import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space } from '@rein-drop/design-tokens';
import { font } from './fonts';
import { Icon, icons } from './Icon';
import { colors, GUTTER, type } from './theme';

export interface ListRowProps {
  title: string;
  /** Second line (muted). */
  subtitle?: string;
  /** Left: a Thumb, an icon tile (`RowIcon`) or an avatar. */
  leading?: ReactNode;
  /** Right-aligned value text ("On", "3 of 5"). */
  value?: string;
  /** Let a long value wrap onto several lines (label / value fact rows) instead of truncating. */
  wrapValue?: boolean;
  /** Anything else on the right (a Switch, a Badge). Replaces the chevron. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Shows a chevron (default when `onPress` is set and there's no `trailing`). */
  chevron?: boolean;
  /** Last row of a group: no separator below. */
  last?: boolean;
  destructive?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * One settings / navigation row (Account, Hunt detail facts, pickers): 50 pt high, hairline
 * separator inset from the left, chevron when it opens something. Use inside `ListSection`.
 */
export function ListRow({ title, subtitle, leading, value, wrapValue, trailing, onPress, chevron, last, destructive, accessibilityLabel, accessibilityHint }: ListRowProps) {
  const showChevron = chevron ?? (!!onPress && !trailing);
  const body = (
    <View style={styles.row}>
      {leading}
      <View style={[styles.main, !last && styles.separator]}>
        <View style={styles.text}>
          <Text style={[styles.title, font(destructive ? 'medium' : 'regular'), destructive && styles.destructive]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, font('regular')]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text style={[styles.value, wrapValue && styles.valueWrap, font('regular')]} numberOfLines={wrapValue ? undefined : 1}>
            {value}
          </Text>
        ) : null}
        {trailing}
        {showChevron && <Icon name={icons.chevron} color={colors.textMuted} size={14} />}
      </View>
    </View>
  );
  if (!onPress) return <View accessible accessibilityLabel={accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ')}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

/** Small tinted square with an icon or letter, for the left of a ListRow. Decorative. */
export function RowIcon({ children, tint = colors.grouped }: { children: ReactNode; tint?: string }) {
  return (
    <View style={[styles.rowIcon, { backgroundColor: tint }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {children}
    </View>
  );
}

/** A titled group of rows on a white rounded surface (iOS Settings style), on a `grouped` Screen. */
export function ListSection({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? (
        <Text accessibilityRole="header" style={[styles.sectionTitle, font('semibold')]}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={styles.group}>{children}</View>
      {footer ? <Text style={[styles.footer, font('regular')]}>{footer}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingLeft: 14, backgroundColor: colors.background },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 50, paddingVertical: 10, paddingRight: 14 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  text: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: type.body },
  destructive: { color: colors.lossText },
  subtitle: { color: colors.textMuted, fontSize: type.subhead },
  value: { color: colors.textMuted, fontSize: type.body, maxWidth: '45%' },
  valueWrap: { maxWidth: '60%', textAlign: 'right' },
  pressed: { opacity: 0.6 },
  rowIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 6 },
  sectionTitle: { color: colors.textMuted, fontSize: type.subhead, marginHorizontal: 4, letterSpacing: 0.3 },
  group: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.background },
  footer: { color: colors.textMuted, fontSize: type.footnote, marginHorizontal: 4 },
});

export const LIST_GUTTER = GUTTER;
