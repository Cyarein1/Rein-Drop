import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { ApiError, type InventoryItem, type ReplacePurchaseCostsRequest, type UpdateInventoryItemRequest } from '@rein-drop/api-client';
import {
  buildPurchaseUpdate,
  dayShortcuts,
  huntFormContext,
  inventoryDetailView,
  PURCHASE_COST_LABEL,
  purchaseFormDefaults,
  saleResultView,
  type HuntFormContext,
  type PurchaseForm,
  type PurchaseFormErrors,
} from '@rein-drop/client-core';
import { fontSize, roles, size, space } from '@rein-drop/design-tokens';
import { useSessionState } from '@/auth/SessionProvider';
import { CostRows } from '@/components/CostRows';
import { getApiClient } from '@/config/api';
import { Badge, Button, Card, font, LoadingState, Metric, Screen, SystemBanner, TextInput } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ready'; item: InventoryItem; version: number };

const messageOf = (err: unknown) => (err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : err instanceof Error ? err.message : String(err));

/** Inventory detail: the purchase (editable), holding state, what was expected, and the sale if any. */
export default function InventoryItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state: session } = useSessionState();
  const context = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null);
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
      <Stack.Screen options={{ title: 'Inventory item' }} />
      {load.status === 'loading' && <LoadingState label="Loading the item…" />}
      {load.status === 'error' && (
        <SystemBanner
          tone={load.notFound ? 'info' : 'error'}
          title={load.notFound ? 'Item not found' : "Couldn't load this item"}
          message={load.notFound ? 'It may belong to another account or no longer exist.' : load.message}
          action={
            load.notFound ? undefined : (
              <Button
                variant="secondary"
                onPress={() => {
                  setLoad({ status: 'loading' });
                  fetchItem();
                }}
              >
                Try again
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

  return (
    <>
      <View style={styles.badges}>
        <Badge tone={view.status.tone}>{view.status.label}</Badge>
        {view.source && <Badge tone="neutral">{view.source}</Badge>}
      </View>
      <Text style={[styles.heading, font('bold')]} accessibilityRole="header">
        {view.title}
      </Text>
      <Text style={[styles.muted, font('regular')]}>
        {view.purchasedOn} · {view.held}
      </Text>

      <View style={styles.actions}>
        {view.holding && <Button onPress={() => go('/inventory/[id]/sell')}>Mark sold</Button>}
        {view.holding && item.status === 'IN_STOCK' && (
          <Button variant="secondary" loading={pending} onPress={() => run(() => api.updateInventoryItem(item.id, { status: 'LISTED' }), 'Marked as listed for sale.')}>
            I&apos;ve listed it
          </Button>
        )}
        {view.holding && item.status === 'LISTED' && (
          <Button variant="secondary" loading={pending} onPress={() => run(() => api.updateInventoryItem(item.id, { status: 'IN_STOCK' }), 'Back to in stock.')}>
            Not listed any more
          </Button>
        )}
        {!view.holding && <Button onPress={() => go('/inventory/[id]/result')}>See sale result</Button>}
      </View>
      {error && <SystemBanner tone="error" title="That didn't work" message={error} />}
      {notice && (
        <Text style={[styles.muted, font('regular')]} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}

      {result && item.sale && (
        <Card title="Sale">
          <Metric label={result.headline} value={result.value} tone={result.tone} caption={result.summary ?? undefined} />
          <View style={styles.actions}>
            <Button variant="secondary" onPress={() => go('/inventory/[id]/sell')}>
              Correct the sale
            </Button>
            {!confirmUndo ? (
              <Button variant="text" onPress={() => setConfirmUndo(true)} disabled={pending}>
                Undo sale
              </Button>
            ) : (
              <>
                <Text style={[styles.muted, font('regular')]}>Back to your inventory, with no result?</Text>
                <Button variant="destructive" loading={pending} onPress={() => run(() => api.undoSale(item.id), 'Sale removed. The item is back in stock.')}>
                  Undo sale
                </Button>
                <Button variant="text" onPress={() => setConfirmUndo(false)} disabled={pending}>
                  Keep it
                </Button>
              </>
            )}
          </View>
        </Card>
      )}

      <Card
        title="Purchase"
        action={
          !editing ? (
            <Button variant="text" onPress={() => setEditing(true)}>
              Edit
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
              }, 'Purchase updated.')
            }
          />
        ) : (
          <>
            {view.purchaseLines.map(([label, value], i) => (
              <View key={`${label}-${i}`} style={[styles.row, label === 'Total cost' && styles.total]}>
                <Text style={[styles.body, font('regular')]}>{label}</Text>
                <Text style={[styles.body, font('semibold')]}>{value}</Text>
              </View>
            ))}
            {item.purchase.costs.length === 0 && (
              <Text style={[styles.muted, font('regular')]}>No extra costs yet. Add tax, shipping or repairs so your profit is accurate.</Text>
            )}
            {view.notes && <Text style={[styles.body, font('regular')]}>{view.notes}</Text>}
          </>
        )}
      </Card>

      <Card title="When you bought it">
        {view.expectedLines.length > 0 ? (
          <>
            {view.expectedLines.map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={[styles.body, font('regular')]}>{label}</Text>
                <Text style={[styles.body, font('semibold')]}>{value}</Text>
              </View>
            ))}
            <Text style={[styles.muted, font('regular')]}>Estimates are not profit. Your result comes only from the sale you record.</Text>
          </>
        ) : (
          <Text style={[styles.muted, font('regular')]}>Rein Drop didn&apos;t capture an estimate for this item.</Text>
        )}
        <View style={styles.actions}>
          {view.dealId && (
            <Button variant="text" onPress={() => router.push({ pathname: '/deals/[id]', params: { id: view.dealId! } })}>
              Open the deal
            </Button>
          )}
          {view.sourceUrl && (
            <Button variant="text" onPress={() => void Linking.openURL(view.sourceUrl!)}>
              Original listing ↗
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
  const [form, setForm] = useState<PurchaseForm>(() => purchaseFormDefaults(item));
  const [errors, setErrors] = useState<PurchaseFormErrors>({});
  const set = (patch: Partial<PurchaseForm>) => setForm((f) => ({ ...f, ...patch }));
  const currency = item.purchase.price.currency;
  const submit = () => {
    const built = buildPurchaseUpdate(form, item, new Date());
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    if (!built.update && !built.costs) return onCancel();
    onSave(built.update, built.costs);
  };

  return (
    <View style={styles.form}>
      <TextInput label="Name" value={form.title} maxLength={200} onChangeText={(title) => set({ title })} error={errors.title} />
      <TextInput label="What you paid" kind="money" currency={currency} value={form.price} onChangeText={(price) => set({ price })} error={errors.price} />
      <TextInput label="Bought on" kind="date" value={form.day} onChangeText={(day) => set({ day })} error={errors.day} />
      <View style={styles.actions}>
        {dayShortcuts(new Date()).map((s) => (
          <Button key={s.value} variant="text" onPress={() => set({ day: s.value })}>
            {s.label}
          </Button>
        ))}
      </View>
      <CostRows
        legend="Purchase costs"
        hint="Tax, shipping to you, repairs, cleaning - anything it cost to get it ready."
        rows={form.costs}
        labels={PURCHASE_COST_LABEL}
        currency={currency}
        errors={errors.costs}
        onChange={(costs) => set({ costs })}
      />
      <TextInput label="Notes (optional)" value={form.notes} maxLength={1000} multiline onChangeText={(notes) => set({ notes })} />
      <View style={styles.actions}>
        <Button loading={pending} onPress={submit}>
          Save purchase
        </Button>
        <Button variant="text" onPress={onCancel} disabled={pending}>
          Cancel
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
