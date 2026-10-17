import { useCallback, useState, type ReactNode } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import type { SellListing } from '@rein-drop/api-client';
import {
  buildListingSoldRequest,
  dayShortcuts,
  listingSoldDoneText,
  listingSoldFormDefaults,
  listingSoldWhereOptions,
  saleCostLabels,
  type ListingSoldErrors,
  type ListingSoldForm,
  type SoldWhere,
} from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { CostRows } from '@/components/CostRows';
import { FieldGroup, InlineField } from '@/components/FormRows';
import { getApiClient } from '@/config/api';
import { apiMessage } from '@/data/useInventoryItem';
import { useT } from '@/i18n/useT';
import { ActionBar, Button, ChipBar, ChipButton, colors, EmptyState, font, haptic, LoadingState, Screen, SheetHeader, SystemBanner, type } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; listing: SellListing; purchasedAt?: string };

/**
 * Sold on… (decision 0021) - a form sheet from the listing editor: where it sold (one of the
 * listing's marketplaces or somewhere else), for how much, when, and the fees. Saving records the
 * sale and ends every other live listing; then the sale result opens (or the item page, when a
 * listing has to be taken down by hand).
 */
export default function ListingSoldSheet() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const api = getApiClient();
      api.getSellListing(id).then(
        async (listing) => {
          // The purchase date (sale can't be before it) - best effort, the API checks it anyway.
          const purchasedAt = await api.getInventoryItem(listing.inventoryItemId).then(
            (item) => item.purchase.purchasedAt,
            () => undefined,
          );
          if (!cancelled) setLoad({ status: 'ready', listing, purchasedAt });
        },
        (err: unknown) => !cancelled && setLoad({ status: 'error', message: apiMessage(err) }),
      );
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  const header = <SheetHeader title={t('sell.markSold')} onCancel={() => router.back()} />;
  if (load.status === 'ready' && load.listing.canSell) return <SoldForm listing={load.listing} purchasedAt={load.purchasedAt} header={header} />;
  return (
    <Screen>
      {header}
      {load.status === 'loading' && <LoadingState label={t('sell.loading')} />}
      {load.status === 'error' && <SystemBanner tone="error" title={t('sell.loadFailed')} message={load.message} />}
      {load.status === 'ready' && <EmptyState title={t('inventory.cantSellTitle')} description={t('inventory.cantSellBody')} />}
    </Screen>
  );
}

function SoldForm({ listing, purchasedAt, header }: { listing: SellListing; purchasedAt?: string; header: ReactNode }) {
  const router = useRouter();
  const t = useT();
  const [form, setForm] = useState<ListingSoldForm>(() => listingSoldFormDefaults(listing, new Date()));
  const [errors, setErrors] = useState<ListingSoldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<ListingSoldForm>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    const built = buildListingSoldRequest(form, listing, new Date(), t, purchasedAt);
    if (!built.ok) {
      setErrors(built.errors);
      setError(t('inventory.checkFields'));
      return;
    }
    setErrors({});
    setError(null);
    setPending(true);
    try {
      const sold = await getApiClient().markSellListingSold(listing.id, built.request);
      // Listings that were live elsewhere and are now ended by the sale.
      const endedOthers = listing.channels.filter((c) => (c.status === 'PUBLISHED' || c.status === 'AWAITING_CONFIRMATION') && c.marketplace !== built.request.marketplace).length;
      haptic.success();
      AccessibilityInfo.announceForAccessibility(listingSoldDoneText(endedOthers, t));
      // A listing to take down by hand: the item page shows the reminder; otherwise the result.
      router.replace({ pathname: sold.removeManually.length > 0 ? '/inventory/[id]' : '/inventory/[id]/result', params: { id: sold.item.id } });
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
          {error && <SystemBanner tone="error" title={t('inventory.saveSaleFailed')} message={error} />}
          <Button size="large" loading={pending} onPress={() => void submit()}>
            {t('sell.markSold')}
          </Button>
        </ActionBar>
      }
    >
      {header}
      <Text style={[styles.item, font('medium')]} numberOfLines={2}>
        {listing.title || t('sell.untitled')}
      </Text>
      <View style={styles.block}>
        <Text style={[styles.label, font('semibold')]}>{t('sell.soldWhere')}</Text>
        <ChipBar<SoldWhere> label={t('sell.soldWhere')} chips={listingSoldWhereOptions(listing, t)} value={form.where ?? ('' as SoldWhere)} onChange={(where) => set({ where })} />
        {errors.where && (
          <Text style={[styles.error, font('regular')]} accessibilityLiveRegion="polite">
            {errors.where}
          </Text>
        )}
      </View>
      <View style={styles.block}>
        <FieldGroup>
          <InlineField
            label={t('inventory.formSoldFor')}
            kind="money"
            currency={form.currency}
            value={form.price}
            onChangeText={(price) => set({ price })}
            hint={t('inventory.formSoldForHint')}
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
      <CostRows
        legend={t('inventory.saleCosts')}
        hint={t('inventory.saleCostsHint')}
        rows={form.costs}
        labels={saleCostLabels(t)}
        currency={form.currency}
        errors={errors.costs}
        onChange={(costs) => set({ costs })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { color: colors.text, fontSize: type.body },
  label: { color: colors.text, fontSize: type.subhead },
  error: { color: colors.lossText, fontSize: type.footnote },
  block: { gap: space[2] },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
