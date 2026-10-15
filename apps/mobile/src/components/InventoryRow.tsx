import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { InventoryRowView } from '@rein-drop/client-core';
import { radius, space } from '@rein-drop/design-tokens';
import { MarketplaceMark } from '@/brand/MarketplaceMark';
import { useT } from '@/i18n/useT';
import { Badge, Button, colors, font, GUTTER, Icon, Thumb, type } from '@/ui';

const RESULT_COLOR = { profit: colors.profitText, loss: colors.lossText, neutral: colors.text } as const;
const TILE = 56;

/**
 * One inventory item as a dense list row (step 89, mock-up Main): photo (when there is one) or the
 * marketplace it came from, title, status and holding time, cost; sold items show the realized
 * result on the right. The row opens the item; the small button is its next step.
 */
export function InventoryRow({ view, photo }: { view: InventoryRowView; photo?: string | null }) {
  const router = useRouter();
  const t = useT();
  const open = () => router.push({ pathname: '/inventory/[id]', params: { id: view.id } });
  const act = () =>
    router.push({ pathname: view.action.kind === 'sell' ? '/inventory/[id]/sell' : '/inventory/[id]/result', params: { id: view.id } });
  const actionA11y = t('inventory.labelValue', { label: view.action.label, value: view.title });
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={[view.title, view.status.label, view.source, view.cost, view.held, view.result ? t('inventory.labelValue', { label: view.result.label, value: view.result.value }) : null, view.estimate]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint={t('inventory.openHint')}
      accessibilityActions={[{ name: 'act', label: view.action.label }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'act' && act()}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {photo ? (
        <Thumb uri={photo} size={TILE} />
      ) : (
        <View style={styles.tile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {view.marketplace ? <MarketplaceMark marketplace={view.marketplace} size={26} /> : <Icon name={{ ios: 'shippingbox', android: 'inventory_2' }} color={colors.textMuted} size={22} />}
        </View>
      )}
      <View style={styles.main}>
        <Text style={[styles.title, font('medium')]} numberOfLines={2}>
          {view.title}
        </Text>
        <View style={styles.meta}>
          <Badge tone={view.status.tone}>{view.status.label}</Badge>
          <Text style={[styles.muted, font('regular')]} numberOfLines={1}>
            {view.held}
          </Text>
        </View>
        <Text style={[styles.muted, font('regular')]} numberOfLines={1}>
          {view.cost}
        </Text>
        {view.estimate && (
          <Text style={[styles.estimate, font('regular')]} numberOfLines={1}>
            {view.estimate}
          </Text>
        )}
      </View>
      <View style={styles.side}>
        {view.result && (
          <View style={styles.result}>
            <Text style={[styles.resultValue, font('bold'), { color: RESULT_COLOR[view.result.tone] }]} numberOfLines={1}>
              {view.result.value}
            </Text>
            <Text style={[styles.resultLabel, font('regular')]} numberOfLines={2}>
              {view.result.label}
            </Text>
          </View>
        )}
        <Button size="small" variant={view.action.kind === 'sell' ? 'secondary' : 'text'} onPress={act} accessibilityLabel={actionA11y}>
          {view.action.label}
        </Button>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space[3],
    paddingHorizontal: GUTTER,
    paddingVertical: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    backgroundColor: colors.background,
  },
  pressed: { backgroundColor: colors.grouped },
  tile: { width: TILE, height: TILE, borderRadius: radius.sm, backgroundColor: colors.grouped, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 3, minWidth: 0 },
  title: { color: colors.text, fontSize: type.body, lineHeight: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  muted: { color: colors.textMuted, fontSize: type.subhead, flexShrink: 1 },
  estimate: { color: colors.textMuted, fontSize: type.footnote },
  side: { alignItems: 'flex-end', justifyContent: 'space-between', gap: space[2], maxWidth: '38%' },
  result: { alignItems: 'flex-end', gap: 1 },
  resultValue: { fontSize: type.price },
  resultLabel: { color: colors.textMuted, fontSize: type.caption, textAlign: 'right' },
});
