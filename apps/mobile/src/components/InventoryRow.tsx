import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { InventoryRowView } from '@rein-drop/client-core';
import { brand, fontSize, radius, roles, size, space } from '@rein-drop/design-tokens';
import { MarketplaceName } from '@/brand/MarketplaceMark';
import { useT } from '@/i18n/useT';
import { Badge, Button, font } from '@/ui';

const RESULT_COLOR = { profit: brand.green, loss: brand.lossRed, neutral: roles.text } as const;

/** One inventory item: cost, holding time (or realized result) and the next step. */
export function InventoryRow({ view }: { view: InventoryRowView }) {
  const router = useRouter();
  const t = useT();
  const open = () => router.push({ pathname: '/inventory/[id]', params: { id: view.id } });
  const act = () =>
    router.push({ pathname: view.action.kind === 'sell' ? '/inventory/[id]/sell' : '/inventory/[id]/result', params: { id: view.id } });
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={[view.title, view.status.label, view.cost, view.held, view.result ? t('inventory.labelValue', { label: view.result.label, value: view.result.value }) : null]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint={t('inventory.openHint')}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.head}>
        <Text style={[styles.title, font('semibold')]}>{view.title}</Text>
        <Badge tone={view.status.tone}>{view.status.label}</Badge>
      </View>
      <View style={styles.meta}>
        {view.marketplace && <MarketplaceName marketplace={view.marketplace} />}
        <Text style={[styles.muted, styles.metaText, font('regular')]}>{`${view.marketplace ? '· ' : ''}${view.cost} · ${view.held}`}</Text>
      </View>
      {view.result && (
        <Text style={[styles.body, font('regular')]}>
          {view.result.label}: <Text style={[font('bold'), { color: RESULT_COLOR[view.result.tone] }]}>{view.result.value}</Text>
        </Text>
      )}
      {view.estimate && <Text style={[styles.muted, font('regular')]}>{view.estimate}</Text>}
      <View style={styles.action}>
        <Button variant={view.action.kind === 'sell' ? 'primary' : 'secondary'} onPress={act} accessibilityLabel={t('inventory.labelValue', { label: view.action.label, value: view.title })}>
          {view.action.label}
        </Button>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[2], padding: space[4], borderWidth: size.borderWidth, borderColor: roles.border, borderRadius: radius.md, backgroundColor: roles.surface },
  pressed: { opacity: 0.85 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[3] },
  title: { color: roles.text, fontSize: fontSize.lg, flexShrink: 1 },
  body: { color: roles.text, fontSize: fontSize.md },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[1] },
  metaText: { flexShrink: 1 },
  action: { alignSelf: 'flex-start' },
});
