import { useCallback, useState, type ReactNode } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError, type InventoryItem } from '@rein-drop/api-client';
import {
  buildSaleRequest,
  dayShortcuts,
  inventoryRowView,
  saleCostLabels,
  saleFormDefaults,
  salePreview,
  soldWhereOptions,
  type HuntFormContext,
  type SaleForm,
  type SaleFormErrors,
} from '@rein-drop/client-core';
import { radius, space } from '@rein-drop/design-tokens';
import { MarketplaceMark } from '@/brand/MarketplaceMark';
import { CostRows } from '@/components/CostRows';
import { FactRow, FieldGroup, InlineField } from '@/components/FormRows';
import { getApiClient } from '@/config/api';
import { useDisplayContext } from '@/i18n/useT';
import { ActionBar, Button, ChipBar, ChipButton, colors, EmptyState, font, haptic, Icon, LoadingState, Metric, Screen, SheetHeader, SystemBanner, type } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; item: InventoryItem };

const messageOf = (err: unknown) => (err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : err instanceof Error ? err.message : String(err));

/**
 * Mark sold (screen 22) - a form sheet (mock-up BoughtSheet): sale price, date, where, fees and
 * costs, with a live preview of the realized result. Defaults come from what's known; the price is
 * never pre-filled from an estimate. Saving opens the sale result.
 */
export default function MarkSoldScreen() {
  const router = useRouter();
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
  const title = ready?.sale ? t('inventory.correctSale') : t('inventory.actionMarkSold');
  const header = <SheetHeader title={title} onCancel={() => router.back()} />;
  if (ready && (ready.holding || ready.sale)) return <SellForm item={ready} context={context} header={header} />;
  return (
    <Screen>
      {header}
      {load.status === 'loading' && <LoadingState label={t('inventory.loadingItem')} />}
      {load.status === 'error' && <SystemBanner tone="error" title={t('inventory.loadItemFailed')} message={load.message} />}
      {ready && <EmptyState title={t('inventory.cantSellTitle')} description={t('inventory.cantSellBody')} />}
    </Screen>
  );
}

function SellForm({ item, context, header }: { item: InventoryItem; context: HuntFormContext; header: ReactNode }) {
  const router = useRouter();
  const { t } = context;
  const [defaults] = useState(() => saleFormDefaults(item, context, new Date()));
  const [form, setForm] = useState<SaleForm>(defaults);
  const [errors, setErrors] = useState<SaleFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<SaleForm>) => setForm((f) => ({ ...f, ...patch }));
  const preview = salePreview(form, item, context);
  const row = inventoryRowView(item, context);

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
      haptic.success();
      router.replace({ pathname: '/inventory/[id]/result', params: { id: item.id } });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen
      footer={
        <ActionBar stacked>
          {error && <SystemBanner tone="error" title={t('inventory.saveSaleFailed')} message={error} />}
          <Button size="large" loading={pending} onPress={submit}>
            {defaults.correcting ? t('inventory.saveSale') : t('inventory.actionMarkSold')}
          </Button>
        </ActionBar>
      }
    >
      {header}
      <View style={styles.item} accessible accessibilityLabel={`${item.title}. ${row.cost}`}>
        <View style={styles.tile}>
          {row.marketplace ? <MarketplaceMark marketplace={row.marketplace} size={22} /> : <Icon name={{ ios: 'shippingbox', android: 'inventory_2' }} color={colors.textMuted} size={20} />}
        </View>
        <View style={styles.itemText}>
          <Text style={[styles.itemTitle, font('medium')]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.muted, font('regular')]} numberOfLines={1}>
            {row.cost}
          </Text>
        </View>
      </View>

      <View style={styles.block}>
        <FieldGroup>
          <InlineField
            label={t('inventory.formSoldFor')}
            kind="money"
            currency={form.currency}
            value={form.price}
            onChangeText={(price) => set({ price })}
            hint={defaults.estimateHint ?? t('inventory.formSoldForHint')}
            error={errors.price}
          />
          <InlineField label={t('inventory.formSoldOn')} kind="date" value={form.day} onChangeText={(day) => set({ day })} error={errors.day} last />
        </FieldGroup>
        <View style={styles.inline}>
          {dayShortcuts(new Date(), t).map((s) => (
            <ChipButton key={s.value} label={s.label} role="radio" selected={form.day === s.value} onPress={() => set({ day: s.value })} />
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <Text style={[styles.label, font('semibold')]}>{t('inventory.formWhere')}</Text>
        <ChipBar label={t('inventory.formWhere')} chips={soldWhereOptions(t)} value={form.where} onChange={(where) => set({ where })} />
      </View>

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
        {preview.lines.length > 0 && (
          <View>
            {preview.lines.map(([label, value], i) => (
              <FactRow key={label} label={label} value={value} last={i === preview.lines.length - 1} />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: 10, borderRadius: radius.md, backgroundColor: colors.grouped },
  tile: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, gap: 2, minWidth: 0 },
  itemTitle: { color: colors.text, fontSize: type.callout },
  muted: { color: colors.textMuted, fontSize: type.footnote },
  label: { color: colors.text, fontSize: type.subhead },
  block: { gap: space[2] },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  preview: { gap: space[2], padding: 14, borderRadius: radius.md, backgroundColor: colors.grouped },
});
