import { useState, type ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import type { InventoryItem, WriteOffReason } from '@rein-drop/api-client';
import { buildWriteOffRequest, dayShortcuts, inventoryStatusLabel, writeOffFormDefaults, writeOffReasonOptions, type WriteOffForm } from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { FieldGroup, InlineField } from '@/components/FormRows';
import { getApiClient } from '@/config/api';
import { apiMessage, useInventoryItem } from '@/data/useInventoryItem';
import { useT } from '@/i18n/useT';
import { ActionBar, Button, ChipBar, ChipButton, colors, font, haptic, LoadingState, Screen, SheetHeader, SystemBanner, type } from '@/ui';

/**
 * Write off (decision 0021) - a form sheet: what happened (lost, broken, can't be sold, other), the
 * day and a note. What it cost becomes a realized loss and any live listings are ended; the sheet
 * says so first, and nothing changes until "Write off" is pressed.
 */
export default function WriteOffSheet() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const load = useInventoryItem(id);
  const header = <SheetHeader title={t('inventory.confirmWriteOffTitle')} onCancel={() => router.back()} />;
  if (load.status === 'ready' && load.item.actions.includes('write_off')) return <WriteOffFormView item={load.item} header={header} />;
  return (
    <Screen>
      {header}
      {load.status === 'loading' && <LoadingState label={t('inventory.loadingItem')} />}
      {load.status === 'error' && <SystemBanner tone="error" title={t('inventory.loadItemFailed')} message={load.message} />}
      {load.status === 'ready' && <SystemBanner tone="info" title={inventoryStatusLabel(load.item.status, t).label} />}
    </Screen>
  );
}

function WriteOffFormView({ item, header }: { item: InventoryItem; header: ReactNode }) {
  const router = useRouter();
  const t = useT();
  const [form, setForm] = useState<WriteOffForm>(() => writeOffFormDefaults(new Date()));
  const [dayError, setDayError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<WriteOffForm>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    const built = buildWriteOffRequest(form, item, new Date(), t);
    if (!built.ok) {
      setDayError(built.errors.day);
      setError(t('inventory.checkFields'));
      return;
    }
    setDayError(undefined);
    setError(null);
    setPending(true);
    try {
      await getApiClient().writeOffInventoryItem(item.id, built.request);
      haptic.success();
      AccessibilityInfo.announceForAccessibility(t('inventory.doneWrittenOff'));
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
            {t('inventory.actionWriteOff')}
          </Button>
        </ActionBar>
      }
    >
      {header}
      <Text style={[styles.intro, font('regular')]}>{t('inventory.confirmWriteOffBody')}</Text>
      <Text style={[styles.item, font('medium')]} numberOfLines={2}>
        {item.title}
      </Text>
      <View style={styles.block}>
        <Text style={[styles.label, font('semibold')]}>{t('inventory.formReason')}</Text>
        <ChipBar<WriteOffReason>
          label={t('inventory.formReason')}
          chips={writeOffReasonOptions(t)}
          // No reason chosen yet: nothing selected (the reason is optional).
          value={form.reason ?? ('' as WriteOffReason)}
          onChange={(reason) => set({ reason })}
        />
      </View>
      <View style={styles.block}>
        <FieldGroup>
          <InlineField label={t('inventory.formWrittenOffOn')} kind="date" value={form.day} onChangeText={(day) => set({ day })} error={dayError} last />
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
  label: { color: colors.text, fontSize: type.subhead },
  block: { gap: space[2] },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
