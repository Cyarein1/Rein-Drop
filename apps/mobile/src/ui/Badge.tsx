import { StyleSheet, Text, View } from 'react-native';
import { fontSize, radius, roles, space, tones, type BadgeTone } from '@rein-drop/design-tokens';
import { font } from './fonts';

export interface BadgeProps {
  /** fresh = Drop Yellow (pair with explicit text, e.g. "Just dropped"), profit, loss, action, info, neutral. */
  tone?: BadgeTone;
  children: string;
}

/** Colour is never the only signal: badges always carry text. */
export function Badge({ tone = 'neutral', children }: BadgeProps) {
  const t = tones[tone];
  const bordered = tone === 'neutral' || tone === 'fresh';
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: t.background },
        bordered && { borderColor: tone === 'fresh' ? t.accent : roles.border },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: t.accent }]} />
      <Text style={[styles.text, font('semibold'), { color: t.foreground }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[1],
    paddingHorizontal: space[2],
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  text: { fontSize: fontSize.xs },
});
