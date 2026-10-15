import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DealCardView } from '@rein-drop/client-core';
import { space, tones } from '@rein-drop/design-tokens';
import { MarketplaceName } from '@/brand/MarketplaceMark';
import { useT } from '@/i18n/useT';
import { Badge, colors, font, GUTTER, Icon, IconButton, icons, SwipeRow, Thumb, type } from '@/ui';

export interface DealCardProps {
  view: DealCardView;
  onPress: () => void;
  /** Quick decisions from the feed; each is offered only when the deal allows it. */
  onSave?: () => void;
  onIgnore?: () => void;
  /** Already saved: a filled bookmark instead of the Save button (the status is in the spoken summary). */
  saved?: boolean;
  /** An action for this deal is in flight. */
  busy?: boolean;
}

/** Statuses worth a tag on the row; new / seen deals need none. */
const DECIDED = new Set<DealCardView['statusKey']>(['saved', 'ignored', 'bought', 'unavailable']);

/**
 * One deal in the feed as a dense list row (step 89, eBay-style): photo, two-line title, price,
 * estimated upside (always marked "est."), then marketplace, age and strength. Exceptional and
 * just-dropped deals get the soft-yellow row. Swipe right = Save, swipe left = Not for me; the
 * same decisions are offered as accessibility actions on the row (never swipe-only), and Save
 * also has its own small button. The row and the button are siblings (never nested buttons).
 */
export function DealCard({ view, onPress, onSave, onIgnore, saved = false, busy = false }: DealCardProps) {
  const t = useT();
  const highlight = view.exceptional || view.justDropped;
  const saveLabel = t('deals.saveA11y', { title: view.title });
  const ignoreLabel = t('deals.notForMeA11y', { title: view.title });
  const a11yActions = [
    ...(onSave && !busy ? [{ name: 'save', label: saveLabel }] : []),
    ...(onIgnore && !busy ? [{ name: 'ignore', label: ignoreLabel }] : []),
  ];
  const meta = [view.age, view.strength?.label].filter(Boolean).join(' · ');

  return (
    <SwipeRow
      enabled={!busy}
      left={onSave ? { label: t('deals.save'), icon: icons.save, color: tones.info.background, onAction: onSave } : undefined}
      right={onIgnore ? { label: t('deals.notForMe'), icon: icons.dismiss, color: colors.grouped, onAction: onIgnore } : undefined}
    >
      <View style={[styles.row, highlight && styles.highlight]}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={view.accessibleSummary}
          accessibilityHint={t('deals.openHint')}
          accessibilityActions={a11yActions}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'save') onSave?.();
            if (e.nativeEvent.actionName === 'ignore') onIgnore?.();
          }}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        >
          <View>
            <Thumb uri={view.imageUrl} size={92} />
            {view.justDropped && (
              <View style={styles.fresh}>
                <Text style={[styles.freshText, font('bold')]}>{t('deals.freshBadge')}</Text>
              </View>
            )}
          </View>
          <View style={styles.text}>
            <Text style={[styles.title, font('medium')]} numberOfLines={2}>
              {view.title}
            </Text>
            <Text style={styles.priceLine} numberOfLines={1}>
              <Text style={[styles.price, font('bold')]}>{view.price}</Text>
              {view.priceExtra ? <Text style={[styles.extra, font('regular')]}>{`  ${view.priceExtra}`}</Text> : null}
            </Text>
            {view.upside.estimated ? (
              <Text style={[styles.upside, font('semibold')]} numberOfLines={1}>
                {view.upside.value} <Text style={[styles.muted, font('regular')]}>{t('deals.upsideEst')}</Text>
              </Text>
            ) : (
              <Text style={[styles.muted, font('regular')]} numberOfLines={1}>
                {view.upside.value}
              </Text>
            )}
            <View style={styles.meta}>
              <MarketplaceName marketplace={view.marketplace} size={13} showName={false} textStyle={styles.source} />
              <Text style={[styles.metaText, font('regular')]} numberOfLines={1}>
                {meta ? `· ${meta}` : ''}
              </Text>
            </View>
            {(DECIDED.has(view.statusKey) || view.sourceNote) && (
              <View style={styles.meta}>
                {DECIDED.has(view.statusKey) && <Badge tone={view.status.tone}>{view.status.label}</Badge>}
                {view.sourceNote && (
                  <Text style={[styles.note, font('regular'), view.sourceNote.tone === 'loss' && styles.loss]} numberOfLines={1}>
                    {view.sourceNote.text}
                  </Text>
                )}
              </View>
            )}
          </View>
        </Pressable>
        <View style={styles.side}>
          {onSave ? (
            <IconButton icon={icons.save} label={saveLabel} onPress={onSave} disabled={busy} />
          ) : saved ? (
            <View style={styles.savedMark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Icon name={icons.saved} size={20} />
            </View>
          ) : null}
        </View>
      </View>
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: GUTTER,
    paddingRight: space[1],
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  // Exceptional / just dropped: the soft Drop Yellow row (paired with the "New" tag or strength text).
  highlight: { backgroundColor: tones.fresh.background },
  main: { flex: 1, flexDirection: 'row', gap: space[3], paddingVertical: space[3] },
  pressed: { opacity: 0.7 },
  fresh: { position: 'absolute', left: 6, top: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: tones.fresh.accent },
  freshText: { color: colors.text, fontSize: 10, textTransform: 'uppercase' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: type.body, lineHeight: 20 },
  priceLine: { marginTop: 2 },
  price: { color: colors.text, fontSize: type.price, fontVariant: ['tabular-nums'] },
  extra: { color: colors.textMuted, fontSize: type.footnote },
  upside: { color: colors.profitText, fontSize: type.subhead },
  muted: { color: colors.textMuted, fontSize: type.subhead },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space[1], marginTop: 2 },
  source: { color: colors.text, fontSize: type.footnote },
  metaText: { flexShrink: 1, color: colors.textMuted, fontSize: type.footnote },
  note: { flexShrink: 1, color: colors.warningText, fontSize: type.footnote },
  loss: { color: colors.lossText },
  side: { width: 44, paddingTop: space[1], alignItems: 'center' },
  savedMark: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
