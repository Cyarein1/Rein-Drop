import { useState } from 'react';
import { useRouter } from 'expo-router';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { addItemFormDefaults, buildCreateItemRequest, dayShortcuts, purchaseCostLabels, soldWhereOptions, type AddItemErrors, type AddItemForm, type SoldWhere } from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { CostRows } from '@/components/CostRows';
import { FieldGroup, InlineField } from '@/components/FormRows';
import { getApiClient } from '@/config/api';
import { apiMessage } from '@/data/useInventoryItem';
import { useDisplayContext } from '@/i18n/useT';
import { ActionBar, Button, ChipBar, ChipButton, colors, font, haptic, Screen, SheetHeader, SystemBanner, type } from '@/ui';

/**
 * Add item (decision 0021) - a form sheet for something bought outside Rein Drop: name, what you
 * paid (in your currency), when, where (a marketplace or anywhere else), purchase costs and notes.
 * It then works like any other item; saving opens its page.
 */
export default function AddItemSheet() {
  const router = useRouter();
  const context = useDisplayContext();
  const { t } = context;
  const [form, setForm] = useState<AddItemForm>(() => addItemFormDefaults(context, new Date()));
  const [errors, setErrors] = useState<AddItemErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<AddItemForm>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    const built = buildCreateItemRequest(form, new Date(), t);
    if (!built.ok) {
      setErrors(built.errors);
      setError(t('inventory.checkFields'));
      return;
    }
    setErrors({});
    setError(null);
    setPending(true);
    try {
      const item = await getApiClient().createInventoryItem(built.request);
      haptic.success();
      AccessibilityInfo.announceForAccessibility(t('inventory.doneAdded'));
      router.replace({ pathname: '/inventory/[id]', params: { id: item.id } });
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen
      footer={
        <ActionBar stacked>
          {error && <SystemBanner tone="error" title={t('inventory.actionFailed')} message={error} />}
          <Button size="large" loading={pending} onPress={() => void submit()}>
            {t('inventory.addItemTitle')}
          </Button>
        </ActionBar>
      }
    >
      <SheetHeader title={t('inventory.addItemTitle')} onCancel={() => router.back()} />
      <Text style={[styles.intro, font('regular')]}>{t('inventory.addItemHint')}</Text>
      <View style={styles.block}>
        <FieldGroup>
          <InlineField label={t('inventory.formName')} value={form.title} maxLength={200} onChangeText={(title) => set({ title })} error={errors.title} />
          <InlineField label={t('inventory.formPaid')} kind="money" currency={form.currency} value={form.price} onChangeText={(price) => set({ price })} error={errors.price} />
          <InlineField label={t('inventory.formBoughtOn')} kind="date" value={form.day} onChangeText={(day) => set({ day })} error={errors.day} last />
        </FieldGroup>
        <View style={styles.inline}>
          {dayShortcuts(new Date(), t).map((s) => (
            <ChipButton key={s.value} label={s.label} role="radio" selected={form.day === s.value} onPress={() => set({ day: s.value })} />
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <Text style={[styles.label, font('semibold')]}>{t('inventory.formWhereBought')}</Text>
        <ChipBar<SoldWhere>
          label={t('inventory.formWhereBought')}
          chips={soldWhereOptions(t)}
          // Optional: nothing selected until the seller picks one.
          value={form.where ?? ('' as SoldWhere)}
          onChange={(where) => set({ where })}
        />
        {form.where === 'other' && (
          <FieldGroup>
            <InlineField
              label={t('inventory.whereOtherLabel')}
              value={form.whereText}
              maxLength={100}
              placeholder={t('inventory.whereOtherPlaceholder')}
              onChangeText={(whereText) => set({ whereText })}
              last
            />
          </FieldGroup>
        )}
      </View>

      <CostRows
        legend={t('inventory.purchaseCosts')}
        hint={t('inventory.purchaseCostsHint')}
        rows={form.costs}
        labels={purchaseCostLabels(t)}
        currency={form.currency}
        errors={errors.costs}
        onChange={(costs) => set({ costs })}
      />
      <FieldGroup>
        <InlineField label={t('inventory.formNotes')} value={form.notes} maxLength={1000} multiline onChangeText={(notes) => set({ notes })} last />
      </FieldGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.textMuted, fontSize: type.callout, lineHeight: 20 },
  label: { color: colors.text, fontSize: type.subhead },
  block: { gap: space[2] },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
