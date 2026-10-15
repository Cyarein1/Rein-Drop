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
import { radius, space } from '@rein-drop/design-tokens';
import { MarketplaceName } from '@/brand/MarketplaceMark';
import { CostRows } from '@/components/CostRows';
import { FactRow, FieldGroup, InlineField, LinkRow, Section } from '@/components/FormRows';
import { getApiClient } from '@/config/api';
import { useDisplayContext, useT } from '@/i18n/useT';
import { ActionBar, Badge, Button, ChipButton, colors, font, LoadingState, Metric, Screen, SystemBanner, type } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ready'; item: InventoryItem; version: number };

const messageOf = (err: unknown) => (err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : err instanceof Error ? err.message : String(err));

/**
 * Inventory detail (mock-up DealDetail): the item, the sale if any, the purchase (editable) and
 * what was expected; the next steps sit in a fixed bar at the bottom.
 */
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

  // A fresh copy (screen refocused) remounts the body with it.
  if (load.status === 'ready') return <ItemBody key={load.version} initial={load.item} context={context} />;
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

  // The next steps stay at the bottom (hidden while the purchase is being edited - it has its own Save).
  const footer = editing ? undefined : (
    <ActionBar>
      {view.holding ? (
        <>
          <Button variant="secondary" size="large" fullWidth onPress={() => go('/inventory/[id]/sell')}>
            {t('inventory.actionMarkSold')}
          </Button>
          {/* Opens this item's listing (created on first use): write it or Use AI, add photos, cross-list. */}
          <Button size="large" fullWidth loading={listing} onPress={() => void openListing()}>
            {item.status === 'LISTED' ? t('inventory.manageListing') : t('inventory.listForSale')}
          </Button>
        </>
      ) : (
        <Button size="large" fullWidth onPress={() => go('/inventory/[id]/result')}>
          {t('inventory.seeResult')}
        </Button>
      )}
    </ActionBar>
  );

  return (
    <Screen footer={footer}>
      <Stack.Screen options={{ title: t('inventory.itemTitle') }} />
      <View style={styles.head}>
        <View style={styles.badges}>
          <Badge tone={view.status.tone}>{view.status.label}</Badge>
          {view.marketplace && <MarketplaceName marketplace={view.marketplace} size={16} />}
        </View>
        <Text style={[styles.heading, font('semibold')]} accessibilityRole="header">
          {view.title}
        </Text>
        <Text style={[styles.muted, font('regular')]}>
          {view.purchasedOn} · {view.held}
        </Text>
        {view.holding && (
          <View style={styles.inline}>
            {item.status === 'IN_STOCK' ? (
              <Button variant="secondary" size="small" loading={pending} onPress={() => run(() => api.updateInventoryItem(item.id, { status: 'LISTED' }), t('inventory.doneListed'))}>
                {t('inventory.listedElsewhere')}
              </Button>
            ) : item.status === 'LISTED' ? (
              <Button variant="secondary" size="small" loading={pending} onPress={() => run(() => api.updateInventoryItem(item.id, { status: 'IN_STOCK' }), t('inventory.doneInStock'))}>
                {t('inventory.notListed')}
              </Button>
            ) : null}
          </View>
        )}
      </View>

      {error && <SystemBanner tone="error" title={t('inventory.actionFailed')} message={error} />}
      {notice && (
        <Text style={[styles.notice, font('medium')]} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}

      {result && item.sale && (
        <Section title={t('inventory.saleCard')}>
          <View style={styles.hero}>
            <Metric label={result.headline} value={result.value} tone={result.tone} caption={result.summary ?? undefined} />
          </View>
          <LinkRow label={t('inventory.correctSale')} onPress={() => go('/inventory/[id]/sell')} />
          {!confirmUndo ? (
            <LinkRow label={t('inventory.undoSale')} onPress={() => setConfirmUndo(true)} last />
          ) : (
            <View style={styles.confirm}>
              <Text style={[styles.body, font('regular')]}>{t('inventory.undoConfirm')}</Text>
              <View style={styles.inline}>
                <Button variant="destructive" size="small" loading={pending} onPress={() => run(() => api.undoSale(item.id), t('inventory.doneUndo'))}>
                  {t('inventory.undoSale')}
                </Button>
                <Button variant="text" size="small" onPress={() => setConfirmUndo(false)} disabled={pending}>
                  {t('inventory.keepIt')}
                </Button>
              </View>
            </View>
          )}
        </Section>
      )}

      <Section
        title={t('inventory.purchaseCard')}
        action={
          !editing ? (
            <Button variant="text" size="small" onPress={() => setEditing(true)} accessibilityLabel={t('inventory.labelValue', { label: t('inventory.edit'), value: t('inventory.purchaseCard') })}>
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
          <View>
            {view.purchaseLines.map(([label, value], i) => (
              <FactRow key={`${label}-${i}`} label={label} value={value} strong={label === t('inventory.totalCost')} last={i === view.purchaseLines.length - 1} />
            ))}
            {item.purchase.costs.length === 0 && <Text style={[styles.note, font('regular')]}>{t('inventory.noExtraCosts')}</Text>}
            {view.notes && <Text style={[styles.body, styles.notes, font('regular')]}>{view.notes}</Text>}
          </View>
        )}
      </Section>

      <Section title={t('inventory.whenBought')}>
        {view.expectedLines.length > 0 ? (
          <View>
            {view.expectedLines.map(([label, value], i) => (
              <FactRow key={label} label={label} value={value} last={i === view.expectedLines.length - 1} />
            ))}
            <Text style={[styles.note, font('regular')]}>{t('inventory.estimatesNotProfit')}</Text>
          </View>
        ) : (
          <Text style={[styles.note, font('regular')]}>{t('inventory.noEstimate')}</Text>
        )}
        {(view.dealId || view.sourceUrl) && (
          <View style={styles.links}>
            {view.dealId && <LinkRow label={t('inventory.openDeal')} onPress={() => router.push({ pathname: '/deals/[id]', params: { id: view.dealId! } })} last={!view.sourceUrl} />}
            {view.sourceUrl && <LinkRow external label={t('inventory.originalListing')} onPress={() => void Linking.openURL(view.sourceUrl!)} last />}
          </View>
        )}
      </Section>
    </Screen>
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
      <FieldGroup>
        <InlineField label={t('inventory.formName')} value={form.title} maxLength={200} onChangeText={(title) => set({ title })} error={errors.title} />
        <InlineField label={t('inventory.formPaid')} kind="money" currency={currency} value={form.price} onChangeText={(price) => set({ price })} error={errors.price} />
        <InlineField label={t('inventory.formBoughtOn')} kind="date" value={form.day} onChangeText={(day) => set({ day })} error={errors.day} last />
      </FieldGroup>
      <View style={styles.inline}>
        {dayShortcuts(new Date(), t).map((s) => (
          <ChipButton key={s.value} label={s.label} role="radio" selected={form.day === s.value} onPress={() => set({ day: s.value })} />
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
      <FieldGroup>
        <InlineField label={t('inventory.formNotes')} value={form.notes} maxLength={1000} multiline onChangeText={(notes) => set({ notes })} last />
      </FieldGroup>
      <View style={styles.inline}>
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
  head: { gap: space[2] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  heading: { color: colors.text, fontSize: type.title, lineHeight: 26 },
  body: { color: colors.text, fontSize: type.callout, lineHeight: 20, flexShrink: 1 },
  muted: { color: colors.textMuted, fontSize: type.subhead },
  note: { color: colors.textMuted, fontSize: type.footnote, paddingTop: space[2] },
  notes: { paddingTop: space[2] },
  notice: { color: colors.text, fontSize: type.callout },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  hero: { padding: 14, borderRadius: radius.md, backgroundColor: colors.grouped },
  confirm: { gap: space[2], paddingVertical: space[2] },
  links: { paddingTop: space[1] },
  form: { gap: space[4] },
});
