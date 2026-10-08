import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError, type InventoryItem } from '@rein-drop/api-client';
import {
  buildSaleRequest,
  dayShortcuts,
  huntFormContext,
  SALE_COST_LABEL,
  saleFormDefaults,
  salePreview,
  SOLD_WHERE_OPTIONS,
  type HuntFormContext,
  type SaleForm,
  type SaleFormErrors,
} from '@rein-drop/client-core';
import { fontSize, radius, roles, space, tones } from '@rein-drop/design-tokens';
import { useSessionState } from '@/auth/SessionProvider';
import { CostRows } from '@/components/CostRows';
import { getApiClient } from '@/config/api';
import { Button, Card, ChoiceGroup, EmptyState, font, LoadingState, Metric, Screen, SystemBanner, TextInput } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; item: InventoryItem };

const messageOf = (err: unknown) => (err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : err instanceof Error ? err.message : String(err));

/**
 * Mark sold (screen 22): sale price, fees and costs, sale date, with a live preview of the
 * realized result. Defaults come from what's known; the price is never pre-filled from an estimate.
 */
export default function MarkSoldScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state: session } = useSessionState();
  const context = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null);
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
      <Stack.Screen options={{ title: ready?.sale ? 'Correct the sale' : 'Mark sold' }} />
      {load.status === 'loading' && <LoadingState label="Loading the item…" />}
      {load.status === 'error' && <SystemBanner tone="error" title="Couldn't load this item" message={load.message} />}
      {ready && !ready.holding && !ready.sale && (
        <Card>
          <EmptyState title="This item can't be marked sold" description="Only items you're holding can be sold." />
        </Card>
      )}
      {ready && (ready.holding || ready.sale) && <SellForm item={ready} context={context} />}
    </Screen>
  );
}

function SellForm({ item, context }: { item: InventoryItem; context: HuntFormContext }) {
  const router = useRouter();
  const [defaults] = useState(() => saleFormDefaults(item, context, new Date()));
  const [form, setForm] = useState<SaleForm>(defaults);
  const [errors, setErrors] = useState<SaleFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<SaleForm>) => setForm((f) => ({ ...f, ...patch }));
  const preview = salePreview(form, item, context);

  const submit = async () => {
    const built = buildSaleRequest(form, item, new Date());
    if (!built.ok) {
      setErrors(built.errors);
      setError('Check the highlighted fields.');
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
        label="What did it sell for?"
        kind="money"
        currency={form.currency}
        value={form.price}
        onChangeText={(price) => set({ price })}
        hint={defaults.estimateHint ?? 'The price your buyer paid, before fees.'}
        error={errors.price}
      />
      <TextInput label="Sold on" kind="date" value={form.day} onChangeText={(day) => set({ day })} error={errors.day} />
      <View style={styles.row}>
        {dayShortcuts(new Date()).map((s) => (
          <Button key={s.value} variant="text" onPress={() => set({ day: s.value })} accessibilityState={{ selected: form.day === s.value }}>
            {s.label}
          </Button>
        ))}
      </View>
      <ChoiceGroup legend="Where did it sell?" options={SOLD_WHERE_OPTIONS} value={form.where} onChange={(where) => set({ where })} />
      <CostRows
        legend="Fees and selling costs"
        hint="Leave a row empty if it doesn't apply."
        rows={form.costs}
        labels={SALE_COST_LABEL}
        currency={form.currency}
        errors={errors.costs}
        onChange={(costs) => set({ costs })}
      />

      <View style={styles.preview} accessibilityLiveRegion="polite">
        {preview.profit ? (
          <Metric label={preview.profit.label} value={preview.profit.value} tone={preview.profit.tone} caption="Realized once you save the sale." />
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

      {error && <SystemBanner tone="error" title="Couldn't save the sale" message={error} />}
      <Button loading={pending} onPress={submit} fullWidth>
        {defaults.correcting ? 'Save the sale' : 'Mark sold'}
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
