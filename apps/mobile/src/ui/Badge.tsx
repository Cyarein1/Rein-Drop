import { StyleSheet, Text, View } from 'react-native';
import { radius, tones, type BadgeTone } from '@rein-drop/design-tokens';
import { font } from './fonts';
import { colors, type } from './theme';

export interface BadgeProps {
  /** fresh = Drop Yellow (pair with explicit text, e.g. "Just dropped"), profit, loss, action, info, neutral. */
  tone?: BadgeTone;
  children: string;
}

/** Compact tag (eBay-style): tinted fill, small caps-like label. Colour is never the only signal: badges always carry text. */
export function Badge({ tone = 'neutral', children }: BadgeProps) {
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.background }]}>
      <Text style={[styles.text, font('bold'), { color: tone === 'profit' ? colors.profitText : tone === 'loss' ? colors.lossText : t.foreground }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm / 2 },
  // Uppercase is display-only: the text (and what screen readers say) stays as written.
  text: { fontSize: type.caption, letterSpacing: 0.3, textTransform: 'uppercase' },
});
