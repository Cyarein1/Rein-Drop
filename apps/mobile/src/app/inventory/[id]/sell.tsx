import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError, type InventoryItem } from '@rein-drop/api-client';
import {
  buildSaleRequest,
  dayShortcuts,
  saleCostLabels,
  saleFormDefaults,
  salePreview,
  soldWhereOptions,
  type HuntFormContext,
  type SaleForm,
  type SaleFormErrors,
} from '@rein-drop/client-core';
import { fontSize, radius, roles, space, tones } from '@rein-drop/design-tokens';
import { CostRows } from '@/components/CostRows';
import { getApiClient } from '@/config/api';
import { useDisplayContext } from '@/i18n/useT';
import { Button, Card, ChoiceGroup, EmptyState, font, LoadingState, Metric, Screen, SystemBanner, TextInput } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; item: InventoryItem };

const messageOf = (err: unknown) => (err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : err instanceof Error ? err.message : String(err));

/**
 * Mark sold (screen 22): sale price, fees and costs, sale date, with a live preview of the
 * realized result. Defaults come from what's known; the price is never pre-filled from an estimate.
 */
export default function MarkSoldScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const context = useDisplayContext();
  const { t } = context;
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetchItem = useCallback(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getApiClient().getInventoryItem(id))
      .then(
        (item) => !cancelled && setLoad({ status: 'ready', item }),
        (err: unknown) => !cancelled && setLoad({ status: 'error', message: messageOf(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, [id]);
  useFocusEffect(fetchItem);

  const ready = load.status === 'ready' ? load.item : null;
  return (
    <Screen>
      <Stack.Screen options={{ title: ready?.sale ? t('inventory.correctSale') : t('inventory.actionMarkSold') }} />
      {load.status === 'loading' && <LoadingState label={t('inventory.loadingItem')} />}
      {load.status === 'error' && <SystemBanner tone="error" title={t('inventory.loadItemFailed')} message={load.message} />}
      {ready && !ready.holding && !ready.sale && (
        <Card>
          <EmptyState title={t('inventory.cantSellTitle')} description={t('inventory.cantSellBody')} />
        </Card>
      )}
      {ready && (ready.holding || ready.sale) && <SellForm item={ready} context={context} />}
    </Screen>
  );
}

function SellForm({ item, context }: { item: InventoryItem; context: HuntFormContext }) {
  const router = useRouter();
  const { t } = context;
  const [defaults] = useState(() => saleFormDefaults(item, context, new Date()));
  const [form, setForm] = useState<SaleForm>(defaults);
  const [errors, setErrors] = useState<SaleFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<SaleForm>) => setForm((f) => ({ ...f, ...patch }));
  const preview = salePreview(form, item, context);

  const submit = async () => {
    const built = buildSaleRequest(form, item, new Date(), t);
    if (!built.ok) {
      setErrors(built.errors);
      setError(t('inventory.checkFields'));
      return;
    }
    setErrors({});
    setError(null);
    setPending(true);
    try {
      await getApiClient().recordSale(item.id, built.request);
      router.replace({ pathname: '/inventory/[id]/result', params: { id: item.id } });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Text style={[styles.muted, font('regular')]}>{item.title}</Text>
      <TextInput
        label={t('inventory.formSoldFor')}
        kind="money"
        currency={form.currency}
        value={form.price}
        onChangeText={(price) => set({ price })}
        hint={defaults.estimateHint ?? t('inventory.formSoldForHint')}
        error={errors.price}
      />
      <TextInput label={t('inventory.formSoldOn')} kind="date" value={form.day} onChangeText={(day) => set({ day })} error={errors.day} />
      <View style={styles.row}>
        {dayShortcuts(new Date(), t).map((s) => (
          <Button key={s.value} variant="text" onPress={() => set({ day: s.value })} accessibilityState={{ selected: form.day === s.value }}>
            {s.label}
          </Button>
        ))}
      </View>
      <ChoiceGroup legend={t('inventory.formWhere')} options={soldWhereOptions(t)} value={form.where} onChange={(where) => set({ where })} />
      <CostRows
        legend={t('inventory.saleCosts')}
        hint={t('inventory.saleCostsHint')}
        rows={form.costs}
        labels={saleCostLabels(t)}
        currency={form.currency}
        errors={errors.costs}
        onChange={(costs) => set({ costs })}
      />

      <View style={styles.preview} accessibilityLiveRegion="polite">
        {preview.profit ? (
          <Metric label={preview.profit.label} value={preview.profit.value} tone={preview.profit.tone} caption={t('inventory.realizedOnSave')} />
        ) : (
          <Text style={[styles.muted, font('regular')]}>{preview.note}</Text>
        )}
        {preview.lines.map(([label, value]) => (
          <View key={label} style={styles.line}>
            <Text style={[styles.body, font('regular')]}>{label}</Text>
            <Text style={[styles.body, font('semibold')]}>{value}</Text>
          </View>
        ))}
      </View>

      {error && <SystemBanner tone="error" title={t('inventory.saveSaleFailed')} message={error} />}
      <Button loading={pending} onPress={submit} fullWidth>
        {defaults.correcting ? t('inventory.saveSale') : t('inventory.actionMarkSold')}
      </Button>
    </>
  );
}

const styles = StyleSheet.create({
  body: { color: roles.text, fontSize: fontSize.md, flexShrink: 1 },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
  preview: { gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: tones.info.background },
});
