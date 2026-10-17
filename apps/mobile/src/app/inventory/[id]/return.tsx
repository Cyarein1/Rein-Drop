import { useState, type ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import type { InventoryItem } from '@rein-drop/api-client';
import { buildReturnRequest, dayShortcuts, inventoryStatusLabel, returnFormDefaults, type ReturnForm } from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { FieldGroup, InlineField } from '@/components/FormRows';
import { getApiClient } from '@/config/api';
import { apiMessage, useInventoryItem } from '@/data/useInventoryItem';
import { useT } from '@/i18n/useT';
import { ActionBar, Button, ChipButton, colors, font, haptic, LoadingState, Screen, SheetHeader, SystemBanner, type } from '@/ui';

/**
 * Returned it (decision 0021) - a form sheet: the refund (prefilled with the price paid), the day
 * and a note. Saving sets the refund against what it cost, ends any live listings and goes back to
 * the item page. The sheet explains this first; nothing changes until "Returned it" is pressed.
 */
export default function ReturnSheet() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const load = useInventoryItem(id);
  const header = <SheetHeader title={t('inventory.confirmReturnTitle')} onCancel={() => router.back()} />;
  if (load.status === 'ready' && load.item.actions.includes('return')) return <ReturnFormView item={load.item} header={header} />;
  return (
    <Screen>
      {header}
      {load.status === 'loading' && <LoadingState label={t('inventory.loadingItem')} />}
      {load.status === 'error' && <SystemBanner tone="error" title={t('inventory.loadItemFailed')} message={load.message} />}
      {load.status === 'ready' && <SystemBanner tone="info" title={inventoryStatusLabel(load.item.status, t).label} />}
    </Screen>
  );
}

function ReturnFormView({ item, header }: { item: InventoryItem; header: ReactNode }) {
  const router = useRouter();
  const t = useT();
  const [form, setForm] = useState<ReturnForm>(() => returnFormDefaults(item, new Date()));
  const [errors, setErrors] = useState<Partial<Record<'refund' | 'day', string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<ReturnForm>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    const built = buildReturnRequest(form, item, new Date(), t);
    if (!built.ok) {
      setErrors(built.errors);
      setError(t('inventory.checkFields'));
      return;
    }
    setErrors({});
    setError(null);
    setPending(true);
    try {
      await getApiClient().returnInventoryItem(item.id, built.request);
      haptic.success();
      AccessibilityInfo.announceForAccessibility(t('inventory.doneReturned'));
      router.back();
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
          <Button size="large" variant="destructive" loading={pending} onPress={() => void submit()}>
            {t('inventory.actionReturn')}
          </Button>
        </ActionBar>
      }
    >
      {header}
      <Text style={[styles.intro, font('regular')]}>{t('inventory.confirmReturnBody')}</Text>
      <Text style={[styles.item, font('medium')]} numberOfLines={2}>
        {item.title}
      </Text>
      <View style={styles.block}>
        <FieldGroup>
          <InlineField
            label={t('inventory.formRefund')}
            kind="money"
            currency={item.purchase.price.currency}
            value={form.refund}
            onChangeText={(refund) => set({ refund })}
            hint={t('inventory.formRefundHint')}
            error={errors.refund}
          />
          <InlineField label={t('inventory.formReturnedOn')} kind="date" value={form.day} onChangeText={(day) => set({ day })} error={errors.day} last />
        </FieldGroup>
        <View style={styles.inline}>
          {dayShortcuts(new Date(), t).map((s) => (
            <ChipButton key={s.value} label={s.label} role="radio" selected={form.day === s.value} onPress={() => set({ day: s.value })} />
          ))}
        </View>
      </View>
      <FieldGroup>
        <InlineField label={t('inventory.formCloseNote')} value={form.note} maxLength={500} multiline onChangeText={(note) => set({ note })} last />
      </FieldGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.textMuted, fontSize: type.callout, lineHeight: 20 },
  item: { color: colors.text, fontSize: type.body },
  block: { gap: space[2] },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
