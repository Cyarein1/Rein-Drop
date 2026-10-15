import { Pressable, StyleSheet, Text, View } from 'react-native';
import { newCostDraft, type CostDraft } from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { ChipBar, colors, font, type } from '@/ui';
import { AddRow, FieldGroup, InlineField } from './FormRows';

const MAX_ROWS = 10;

/** Editable cost lines (type chips, amount, optional note). Empty amounts are ignored on save. */
export function CostRows<C extends string>({
  legend,
  hint,
  rows,
  labels,
  currency,
  errors,
  onChange,
}: {
  legend: string;
  hint?: string;
  rows: CostDraft<C>[];
  labels: Record<C, string>;
  currency: string;
  errors?: Record<string, string>;
  onChange: (rows: CostDraft<C>[]) => void;
}) {
  const t = useT();
  const categories = Object.keys(labels) as C[];
  const chips = categories.map((c) => ({ value: c, label: labels[c] }));
  const update = (key: string, patch: Partial<CostDraft<C>>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <View style={styles.group}>
      <Text style={[styles.legend, font('semibold')]} accessibilityRole="header">
        {legend}
      </Text>
      {hint && <Text style={[styles.muted, font('regular')]}>{hint}</Text>}
      {rows.length === 0 && <Text style={[styles.muted, font('regular')]}>{t('inventory.costNoneAdded')}</Text>}
      {rows.map((row, i) => (
        <View key={row.key} style={styles.cost}>
          <View style={styles.costHead}>
            <Text style={[styles.costTitle, font('semibold')]}>{t('inventory.costNumber', { number: i + 1 })}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('inventory.costRemoveA11y', { number: i + 1 })}
              onPress={() => onChange(rows.filter((r) => r.key !== row.key))}
              hitSlop={8}
              style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
            >
              <Text style={[styles.removeText, font('medium')]}>{t('inventory.costRemove')}</Text>
            </Pressable>
          </View>
          <ChipBar label={t('inventory.costNumber', { number: i + 1 })} chips={chips} value={row.category} onChange={(category) => update(row.key, { category })} />
          <FieldGroup>
            <InlineField
              label={t('inventory.costAmount', { label: labels[row.category] })}
              kind="money"
              currency={currency}
              value={row.amount}
              onChangeText={(amount) => update(row.key, { amount })}
              error={errors?.[row.key]}
            />
            <InlineField label={t('inventory.costNote')} value={row.note} maxLength={200} onChangeText={(note) => update(row.key, { note })} last />
          </FieldGroup>
        </View>
      ))}
      {rows.length < MAX_ROWS && (
        <AddRow label={rows.length === 0 ? t('inventory.costAdd') : t('inventory.costAddAnother')} onPress={() => onChange([...rows, newCostDraft(categories[categories.length - 1]!)])} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[2] },
  legend: { color: colors.text, fontSize: type.headline },
  muted: { color: colors.textMuted, fontSize: type.subhead },
  cost: { gap: space[2], paddingTop: space[1] },
  costHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  costTitle: { color: colors.textMuted, fontSize: type.subhead },
  remove: { minHeight: 32, justifyContent: 'center' },
  removeText: { color: colors.lossText, fontSize: type.subhead },
  pressed: { opacity: 0.6 },
});
