import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DealCardView } from '@rein-drop/client-core';
import { fontSize, radius, roles, size, space, tones } from '@rein-drop/design-tokens';
import { Badge, Button, font } from '@/ui';

export interface DealCardProps {
  view: DealCardView;
  onPress: () => void;
  /** Quick decisions from the feed; each is offered only when the deal allows it. */
  onSave?: () => void;
  onIgnore?: () => void;
  /** An action for this deal is in flight. */
  busy?: boolean;
}

/**
 * One deal in the feed: product, source, price, freshness, estimated upside, confidence and
 * status. Exceptional deals get the soft-yellow branded treatment. Quick actions sit below the
 * card's pressable area (never nested buttons), so each has its own accessible name.
 */
export function DealCard({ view, onPress, onSave, onIgnore, busy = false }: DealCardProps) {
  const quick = onSave || onIgnore;
  return (
    <View style={[styles.wrap, view.exceptional && styles.exceptional]}>
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={view.accessibleSummary}
      accessibilityHint="Opens the deal"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.badges}>
        {view.strength && <Badge tone={view.strength.tone}>{view.strength.label}</Badge>}
        {view.justDropped && <Badge tone="fresh">Just dropped</Badge>}
        <Badge tone={view.status.tone}>{view.status.label}</Badge>
      </View>
      <Text style={[styles.title, font('semibold')]}>{view.title}</Text>
      <Text style={[styles.muted, font('regular')]}>
        {view.source} · {view.freshness} · {view.huntName}
      </Text>

      <View style={styles.figures}>
        <View style={styles.figure}>
          <Text style={[styles.label, font('medium')]}>PRICE</Text>
          <Text style={[styles.value, font('bold')]}>{view.price}</Text>
          {view.priceExtra && <Text style={[styles.small, font('regular')]}>{view.priceExtra}</Text>}
        </View>
        <View style={styles.figure}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, font('medium')]}>UPSIDE</Text>
            {view.upside.estimated && <Text style={[styles.estimated, font('regular')]}>Estimated</Text>}
          </View>
          <Text style={[view.upside.estimated ? styles.value : styles.muted, font(view.upside.estimated ? 'bold' : 'regular')]}>
            {view.upside.value}
          </Text>
        </View>
        <View style={styles.figure}>
          <Text style={[styles.label, font('medium')]}>CONFIDENCE</Text>
          <Text style={[view.confidence ? styles.body : styles.muted, font('regular')]}>
            {view.confidence ? view.confidence.replace(' confidence', '') : 'Not yet'}
          </Text>
        </View>
      </View>

      {view.reason && <Text style={[styles.body, font('regular')]}>{view.reason}</Text>}
      {view.analysisNote && <Text style={[styles.small, font('regular')]}>{view.analysisNote}</Text>}
      {view.sourceNote && <Text style={[styles.sourceNote, font('regular')]}>{view.sourceNote.text}</Text>}
    </Pressable>
    {quick && (
      <View style={styles.actions}>
        {onSave && (
          <Button variant="secondary" loading={busy} onPress={onSave} accessibilityLabel={`Save ${view.title}`}>
            Save
          </Button>
        )}
        {onIgnore && (
          <Button variant="text" disabled={busy} onPress={onIgnore} accessibilityLabel={`Not for me: ${view.title}`}>
            Not for me
          </Button>
        )}
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: size.borderWidth,
    borderColor: roles.border,
    borderRadius: radius.md,
    backgroundColor: roles.surface,
    overflow: 'hidden',
  },
  card: { gap: space[2], padding: space[4] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], paddingHorizontal: space[4], paddingBottom: space[4] },
  // The rare, stronger treatment: Drop Yellow accent, no artwork.
  exceptional: { borderWidth: 2, borderColor: tones.fresh.accent, backgroundColor: tones.fresh.background },
  pressed: { opacity: 0.85 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  title: { color: roles.text, fontSize: fontSize.lg },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
  small: { color: roles.textMuted, fontSize: fontSize.xs },
  body: { color: roles.text, fontSize: fontSize.md },
  figures: { flexDirection: 'row', gap: space[3] },
  figure: { flex: 1, gap: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space[1], flexWrap: 'wrap' },
  label: { color: roles.textMuted, fontSize: fontSize.xs, letterSpacing: 0.5 },
  estimated: {
    color: roles.textMuted,
    fontSize: fontSize.xs,
    paddingHorizontal: space[1],
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: roles.textMuted,
    borderRadius: radius.full,
  },
  value: { color: roles.text, fontSize: fontSize.md, fontVariant: ['tabular-nums'] },
  sourceNote: { color: roles.text, fontSize: fontSize.sm, paddingLeft: space[2], borderLeftWidth: 3, borderLeftColor: tones.loss.accent },
});
