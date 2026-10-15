import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { ApiError, type InventoryItem, type ReplacePurchaseCostsRequest, type UpdateInventoryItemRequest } from '@rein-drop/api-client';
import {
  buildPurchaseUpdate,
  dayShortcuts,
  inventoryDetailView,
  purchaseCostLabels,
  purchaseFormDefaults,
  saleResultView,
  type HuntFormContext,
  type PurchaseForm,
  type PurchaseFormErrors,
} from '@rein-drop/client-core';
import { fontSize, roles, size, space } from '@rein-drop/design-tokens';
import { MarketplaceName } from '@/brand/MarketplaceMark';
import { CostRows } from '@/components/CostRows';
import { getApiClient } from '@/config/api';
import { useDisplayContext, useT } from '@/i18n/useT';
import { Badge, Button, Card, font, LoadingState, Metric, Screen, SystemBanner, TextInput } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ready'; item: InventoryItem; version: number };

const messageOf = (err: unknown) => (err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : err instanceof Error ? err.message : String(err));

/** Inventory detail: the purchase (editable), holding state, what was expected, and the sale if any. */
export default function InventoryItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const context = useDisplayContext();
  const { t } = context;
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetchItem = useCallback(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getApiClient().getInventoryItem(id))
      .then(
        (item) => !cancelled && setLoad((prev) => ({ status: 'ready', item, version: prev.status === 'ready' ? prev.version + 1 : 0 })),
        (err: unknown) =>
          !cancelled &&
          setLoad({ status: 'error', message: messageOf(err), notFound: err instanceof ApiError && (err.status === 404 || err.code === 'VALIDATION_FAILED') }),
      );
    return () => {
      cancelled = true;
    };
  }, [id]);
  useFocusEffect(fetchItem);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('inventory.itemTitle') }} />
      {load.status === 'loading' && <LoadingState label={t('inventory.loadingItem')} />}
      {load.status === 'error' && (
        <SystemBanner
          tone={load.notFound ? 'info' : 'error'}
          title={load.notFound ? t('inventory.notFoundTitle') : t('inventory.loadItemFailed')}
          message={load.notFound ? t('inventory.notFoundBody') : load.message}
          action={
            load.notFound ? undefined : (
              <Button
                variant="secondary"
                onPress={() => {
                  setLoad({ status: 'loading' });
                  fetchItem();
                }}
              >
                {t('inventory.tryAgain')}
              </Button>
            )
          }
        />
      )}
      {/* A fresh copy (screen refocused) remounts the body with it. */}
      {load.status === 'ready' && <ItemBody key={load.version} initial={load.item} context={context} />}
    </Screen>
  );
}

function ItemBody({ initial, context }: { initial: InventoryItem; context: HuntFormContext }) {
  const router = useRouter();
  const { t } = context;
  const [item, setItem] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const view = inventoryDetailView(item, context);
  const result = saleResultView(item, context);
  const api = getApiClient();

  const run = async (action: () => Promise<InventoryItem>, done: string) => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      setItem(await action());
      setEditing(false);
      setConfirmUndo(false);
      setNotice(done);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  };
  const go = (pathname: '/inventory/[id]/sell' | '/inventory/[id]/result') => router.push({ pathname, params: { id: item.id } });
  const [listing, setListingBusy] = useState(false);
  const openListing = async () => {
    setListingBusy(true);
    setError(null);
    try {
      const sell = await api.startSellListing(item.id);
      router.push({ pathname: '/sell/[id]', params: { id: sell.id } });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setListingBusy(false);
    }
  };

  return (
    <>
      <View style={styles.badges}>
        <Badge tone={view.status.tone}>{view.status.label}</Badge>
        {view.marketplace && <MarketplaceName marketplace={view.marketplace} size={18} />}
      </View>
      <Text style={[styles.heading, font('bold')]} accessibilityRole="header">
        {view.title}
      </Text>
      <Text style={[styles.muted, font('regular')]}>
        {view.purchasedOn} · {view.held}
      </Text>

      <View style={styles.actions}>
        {view.holding && (
          // Opens this item's listing (created on first use): write it or Use AI, add photos, cross-list.
          <Button loading={listing} onPress={() => void openListing()}>
            {item.status === 'LISTED' ? t('inventory.manageListing') : t('inventory.listForSale')}
          </Button>
        )}
        {view.holding && (
          <Button variant="secondary" onPress={() => go('/inventory/[id]/sell')}>
            {t('inventory.actionMarkSold')}
          </Button>
        )}
        {view.holding && item.status === 'IN_STOCK' && (
          <Button variant="text" loading={pending} onPress={() => run(() => api.updateInventoryItem(item.id, { status: 'LISTED' }), t('inventory.doneListed'))}>
            {t('inventory.listedElsewhere')}
          </Button>
        )}
        {view.holding && item.status === 'LISTED' && (
          <Button variant="secondary" loading={pending} onPress={() => run(() => api.updateInventoryItem(item.id, { status: 'IN_STOCK' }), t('inventory.doneInStock'))}>
            {t('inventory.notListed')}
          </Button>
        )}
        {!view.holding && <Button onPress={() => go('/inventory/[id]/result')}>{t('inventory.seeResult')}</Button>}
      </View>
      {error && <SystemBanner tone="error" title={t('inventory.actionFailed')} message={error} />}
      {notice && (
        <Text style={[styles.muted, font('regular')]} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}

      {result && item.sale && (
        <Card title={t('inventory.saleCard')}>
          <Metric label={result.headline} value={result.value} tone={result.tone} caption={result.summary ?? undefined} />
          <View style={styles.actions}>
            <Button variant="secondary" onPress={() => go('/inventory/[id]/sell')}>
              {t('inventory.correctSale')}
            </Button>
            {!confirmUndo ? (
              <Button variant="text" onPress={() => setConfirmUndo(true)} disabled={pending}>
                {t('inventory.undoSale')}
              </Button>
            ) : (
              <>
                <Text style={[styles.muted, font('regular')]}>{t('inventory.undoConfirm')}</Text>
                <Button variant="destructive" loading={pending} onPress={() => run(() => api.undoSale(item.id), t('inventory.doneUndo'))}>
                  {t('inventory.undoSale')}
                </Button>
                <Button variant="text" onPress={() => setConfirmUndo(false)} disabled={pending}>
                  {t('inventory.keepIt')}
                </Button>
              </>
            )}
          </View>
        </Card>
      )}

      <Card
        title={t('inventory.purchaseCard')}
        action={
          !editing ? (
            <Button variant="text" onPress={() => setEditing(true)}>
              {t('inventory.edit')}
            </Button>
          ) : undefined
        }
      >
        {editing ? (
          <PurchaseEditor
            item={item}
            pending={pending}
            onCancel={() => setEditing(false)}
            onSave={(update, costs) =>
              run(async () => {
                let next = update ? await api.updateInventoryItem(item.id, update) : null;
                if (costs) next = await api.replacePurchaseCosts(item.id, costs);
                return next ?? api.getInventoryItem(item.id);
              }, t('inventory.donePurchase'))
            }
          />
        ) : (
          <>
            {view.purchaseLines.map(([label, value], i) => (
              <View key={`${label}-${i}`} style={[styles.row, label === t('inventory.totalCost') && styles.total]}>
                <Text style={[styles.body, font('regular')]}>{label}</Text>
                <Text style={[styles.body, font('semibold')]}>{value}</Text>
              </View>
            ))}
            {item.purchase.costs.length === 0 && (
              <Text style={[styles.muted, font('regular')]}>{t('inventory.noExtraCosts')}</Text>
            )}
            {view.notes && <Text style={[styles.body, font('regular')]}>{view.notes}</Text>}
          </>
        )}
      </Card>

      <Card title={t('inventory.whenBought')}>
        {view.expectedLines.length > 0 ? (
          <>
            {view.expectedLines.map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={[styles.body, font('regular')]}>{label}</Text>
                <Text style={[styles.body, font('semibold')]}>{value}</Text>
              </View>
            ))}
            <Text style={[styles.muted, font('regular')]}>{t('inventory.estimatesNotProfit')}</Text>
          </>
        ) : (
          <Text style={[styles.muted, font('regular')]}>{t('inventory.noEstimate')}</Text>
        )}
        <View style={styles.actions}>
          {view.dealId && (
            <Button variant="text" onPress={() => router.push({ pathname: '/deals/[id]', params: { id: view.dealId! } })}>
              {t('inventory.openDeal')}
            </Button>
          )}
          {view.sourceUrl && (
            <Button variant="text" onPress={() => void Linking.openURL(view.sourceUrl!)}>
              {t('inventory.originalListing')}
            </Button>
          )}
        </View>
      </Card>
    </>
  );
}

function PurchaseEditor({
  item,
  pending,
  onCancel,
  onSave,
}: {
  item: InventoryItem;
  pending: boolean;
  onCancel: () => void;
  onSave: (update: UpdateInventoryItemRequest | null, costs: ReplacePurchaseCostsRequest | null) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<PurchaseForm>(() => purchaseFormDefaults(item));
  const [errors, setErrors] = useState<PurchaseFormErrors>({});
  const set = (patch: Partial<PurchaseForm>) => setForm((f) => ({ ...f, ...patch }));
  const currency = item.purchase.price.currency;
  const submit = () => {
    const built = buildPurchaseUpdate(form, item, new Date(), t);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    if (!built.update && !built.costs) return onCancel();
    onSave(built.update, built.costs);
  };

  return (
    <View style={styles.form}>
      <TextInput label={t('inventory.formName')} value={form.title} maxLength={200} onChangeText={(title) => set({ title })} error={errors.title} />
      <TextInput label={t('inventory.formPaid')} kind="money" currency={currency} value={form.price} onChangeText={(price) => set({ price })} error={errors.price} />
      <TextInput label={t('inventory.formBoughtOn')} kind="date" value={form.day} onChangeText={(day) => set({ day })} error={errors.day} />
      <View style={styles.actions}>
        {dayShortcuts(new Date(), t).map((s) => (
          <Button key={s.value} variant="text" onPress={() => set({ day: s.value })}>
            {s.label}
          </Button>
        ))}
      </View>
      <CostRows
        legend={t('inventory.purchaseCosts')}
        hint={t('inventory.purchaseCostsHint')}
        rows={form.costs}
        labels={purchaseCostLabels(t)}
        currency={currency}
        errors={errors.costs}
        onChange={(costs) => set({ costs })}
      />
      <TextInput label={t('inventory.formNotes')} value={form.notes} maxLength={1000} multiline onChangeText={(notes) => set({ notes })} />
      <View style={styles.actions}>
        <Button loading={pending} onPress={submit}>
          {t('inventory.savePurchase')}
        </Button>
        <Button variant="text" onPress={onCancel} disabled={pending}>
          {t('inventory.cancel')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  heading: { color: roles.text, fontSize: fontSize.xl },
  body: { color: roles.text, fontSize: fontSize.md, flexShrink: 1 },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
  total: { borderTopWidth: size.borderWidth, borderTopColor: roles.border, paddingTop: space[2] },
  form: { gap: space[4] },
});
