import { StyleSheet, Text, View } from 'react-native';
import { newCostDraft, type CostDraft } from '@rein-drop/client-core';
import { fontSize, radius, roles, size, space } from '@rein-drop/design-tokens';
import { Button, ChoiceGroup, font, TextInput } from '@/ui';

const MAX_ROWS = 10;

/** Editable cost lines (type, amount, optional note). Empty amounts are ignored on save. */
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
  const categories = Object.keys(labels) as C[];
  const options = categories.map((c) => ({ value: c, label: labels[c] }));
  const update = (key: string, patch: Partial<CostDraft<C>>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <View style={styles.group}>
      <Text style={[styles.legend, font('semibold')]} accessibilityRole="header">
        {legend}
      </Text>
      {hint && <Text style={[styles.muted, font('regular')]}>{hint}</Text>}
      {rows.length === 0 && <Text style={[styles.muted, font('regular')]}>None added.</Text>}
      {rows.map((row, i) => (
        <View key={row.key} style={styles.row}>
          <ChoiceGroup legend={`Cost ${i + 1}`} options={options} value={row.category} onChange={(category) => update(row.key, { category })} />
          <TextInput
            label={`${labels[row.category]} amount`}
            kind="money"
            currency={currency}
            value={row.amount}
            onChangeText={(amount) => update(row.key, { amount })}
            error={errors?.[row.key]}
            placeholder="0.00"
          />
          <TextInput label="Note (optional)" value={row.note} maxLength={200} onChangeText={(note) => update(row.key, { note })} />
          <View style={styles.remove}>
            <Button variant="text" onPress={() => onChange(rows.filter((r) => r.key !== row.key))} accessibilityLabel={`Remove cost ${i + 1}`}>
              Remove
            </Button>
          </View>
        </View>
      ))}
      {rows.length < MAX_ROWS && (
        <View style={styles.remove}>
          <Button variant="secondary" onPress={() => onChange([...rows, newCostDraft(categories[categories.length - 1]!)])}>
            Add a cost
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[3] },
  legend: { color: roles.text, fontSize: fontSize.lg },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
  row: { gap: space[2], padding: space[3], borderWidth: size.borderWidth, borderColor: roles.border, borderRadius: radius.md },
  remove: { alignSelf: 'flex-start' },
});
