import { Pressable, StyleSheet, Text, View } from 'react-native';
import { confidenceLabel, type DealCardView } from '@rein-drop/client-core';
import { fontSize, radius, roles, size, space, tones } from '@rein-drop/design-tokens';
import { MarketplaceName } from '@/brand/MarketplaceMark';
import { useT } from '@/i18n/useT';
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
  const t = useT();
  const quick = onSave || onIgnore;
  // The column is headed "Confidence", so show the short level ("High"), not "High confidence".
  const level = (['high', 'medium', 'low'] as const).find((c) => confidenceLabel(c, t) === view.confidence);
  const confidence = level ? t(CONFIDENCE_SHORT[level]) : view.confidence;
  return (
    <View style={[styles.wrap, view.exceptional && styles.exceptional]}>
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={view.accessibleSummary}
      accessibilityHint={t('deals.openHint')}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.badges}>
        {view.strength && <Badge tone={view.strength.tone}>{view.strength.label}</Badge>}
        {view.justDropped && <Badge tone="fresh">{t('deals.justDropped')}</Badge>}
        <Badge tone={view.status.tone}>{view.status.label}</Badge>
      </View>
      <Text style={[styles.title, font('semibold')]}>{view.title}</Text>
      <View style={styles.meta}>
        <MarketplaceName marketplace={view.marketplace} />
        <Text style={[styles.muted, styles.metaText, font('regular')]}>
          · {view.freshness} · {view.huntName}
        </Text>
      </View>

      <View style={styles.figures}>
        <View style={styles.figure}>
          <Text style={[styles.label, font('medium')]}>{t('deals.labelPrice')}</Text>
          <Text style={[styles.value, font('bold')]}>{view.price}</Text>
          {view.priceExtra && <Text style={[styles.small, font('regular')]}>{view.priceExtra}</Text>}
        </View>
        <View style={styles.figure}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, font('medium')]}>{t('deals.labelUpside')}</Text>
            {view.upside.estimated && <Text style={[styles.estimated, font('regular')]}>{t('common.estimated')}</Text>}
          </View>
          <Text style={[view.upside.estimated ? styles.value : styles.muted, font(view.upside.estimated ? 'bold' : 'regular')]}>
            {view.upside.value}
          </Text>
        </View>
        <View style={styles.figure}>
          <Text style={[styles.label, font('medium')]}>{t('deals.labelConfidence')}</Text>
          <Text style={[confidence ? styles.body : styles.muted, font('regular')]}>
            {confidence ?? t('deals.confidenceNotYet')}
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
          <Button variant="secondary" loading={busy} onPress={onSave} accessibilityLabel={t('deals.saveA11y', { title: view.title })}>
            {t('deals.save')}
          </Button>
        )}
        {onIgnore && (
          <Button variant="text" disabled={busy} onPress={onIgnore} accessibilityLabel={t('deals.notForMeA11y', { title: view.title })}>
            {t('deals.notForMe')}
          </Button>
        )}
      </View>
    )}
    </View>
  );
}

const CONFIDENCE_SHORT = {
  high: 'deals.confidenceShortHigh',
  medium: 'deals.confidenceShortMedium',
  low: 'deals.confidenceShortLow',
} as const;

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
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[1] },
  metaText: { flexShrink: 1 },
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
