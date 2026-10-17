import { useCallback, useEffect, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AccessibilityInfo, ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ApiError,
  type InventoryAction,
  type InventoryEvent,
  type InventoryItem,
  type ReplacePurchaseCostsRequest,
  type UpdateInventoryItemRequest,
} from '@rein-drop/api-client';
import {
  buildPurchaseUpdate,
  cancelBlockedHint,
  closureView,
  dayShortcuts,
  inventoryDetailView,
  itemActionsView,
  purchaseCostLabels,
  purchaseFormDefaults,
  removeManuallyView,
  saleResultView,
  timelineView,
  type HuntFormContext,
  type ItemActionView,
  type PurchaseForm,
  type PurchaseFormErrors,
  type TimelineRow,
} from '@rein-drop/client-core';
import { radius, space } from '@rein-drop/design-tokens';
import { MarketplaceMark } from '@/brand/MarketplaceMark';
import { CostRows } from '@/components/CostRows';
import { FactRow, FieldGroup, InlineField, LinkRow, Section } from '@/components/FormRows';
import { getApiClient } from '@/config/api';
import { useDisplayContext, useT } from '@/i18n/useT';
import { ActionBar, Badge, Button, ChipButton, colors, font, haptic, Icon, icons, LoadingState, Metric, Screen, SystemBanner, type } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ready'; item: InventoryItem; version: number };

const messageOf = (err: unknown) => (err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : err instanceof Error ? err.message : String(err));

/** Actions with their own place on the page: the bottom bar (primary, List for sale) and the purchase card (Edit). */
const NOT_A_ROW: InventoryAction[] = ['edit_purchase', 'list_for_sale'];

/**
 * One item page (decision 0021): the item, its whole story as a timeline (bought → listed → sold,
 * returned or written off), costs and result, and only the actions the API allows now
 * (`item.actions`). The main next step sits in the bottom bar; the others are rows. Ending actions
 * ask first (native dialog); Return / Write off open their sheet. Nothing is ever deleted.
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

  // A fresh copy (screen refocused, e.g. a sheet closed) remounts the body with it.
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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [events, setEvents] = useState<InventoryEvent[] | 'loading' | 'error'>('loading');
  const view = inventoryDetailView(item, context);
  const result = saleResultView(item, context);
  const closure = closureView(item, context);
  const actions = itemActionsView(item, t);
  const blocked = cancelBlockedHint(item, t);
  const remove = item.sellListing ? removeManuallyView(item.sellListing.removeManually, t) : null;
  const api = getApiClient();

  // The timeline (oldest first from the API), reloaded after every change made here.
  const loadEvents = useCallback(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getApiClient().getInventoryEvents(initial.id))
      .then(
        (list) => !cancelled && setEvents(list.items),
        () => !cancelled && setEvents('error'),
      );
    return () => {
      cancelled = true;
    };
  }, [initial.id]);
  useEffect(loadEvents, [loadEvents]);

  const run = async (key: string, action: () => Promise<InventoryItem>, done: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setItem(await action());
      setEditing(false);
      setNotice(done);
      haptic.success();
      AccessibilityInfo.announceForAccessibility(done);
      loadEvents();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  };
  const go = (pathname: '/inventory/[id]/sell' | '/inventory/[id]/result' | '/inventory/[id]/return' | '/inventory/[id]/write-off') =>
    router.push({ pathname, params: { id: item.id } });

  const openListing = async () => {
    setBusy('list_for_sale');
    setError(null);
    try {
      const sell = await api.startSellListing(item.id);
      router.push({ pathname: '/sell/[id]', params: { id: sell.id } });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  };

  /** Ask first (native dialog) when the action ends the item's normal life or undoes something. */
  const confirmThen = (a: ItemActionView, then: () => void) => {
    if (!a.confirm) return then();
    Alert.alert(a.confirm.title, a.confirm.body, [
      { text: a.confirm.cancelLabel, style: 'cancel' },
      { text: a.confirm.confirmLabel, style: a.tone === 'danger' ? 'destructive' : 'default', onPress: then },
    ]);
  };

  const perform = (a: ItemActionView) => {
    switch (a.action) {
      case 'edit_purchase':
        return setEditing(true);
      case 'mark_listed':
        return void run(a.action, () => api.updateInventoryItem(item.id, { status: 'LISTED' }), t('inventory.doneListed'));
      case 'mark_unlisted':
        return void run(a.action, () => api.updateInventoryItem(item.id, { status: 'IN_STOCK' }), t('inventory.doneInStock'));
      case 'list_for_sale':
        return void openListing();
      case 'mark_sold':
      case 'correct_sale':
        return go('/inventory/[id]/sell');
      // Return / write off: the sheet explains what happens and asks for the refund / reason.
      case 'return':
        return go('/inventory/[id]/return');
      case 'write_off':
        return go('/inventory/[id]/write-off');
      case 'undo_sale':
        return confirmThen(a, () => void run(a.action, () => api.undoSale(item.id), t('inventory.doneUndo')));
      case 'cancel':
        return confirmThen(a, () => void run(a.action, () => api.cancelInventoryItem(item.id), t('inventory.doneCancelled')));
      case 'reopen':
        return confirmThen(a, () => void run(a.action, () => api.reopenInventoryItem(item.id), t('inventory.doneReopened')));
    }
  };

  /** "I've removed it": confirms every marketplace Rein Drop couldn't take it down on. */
  const confirmRemoved = () =>
    void run(
      'removed',
      async () => {
        const listing = item.sellListing!;
        for (const m of listing.removeManually) await api.endSellChannel(listing.id, m);
        return api.getInventoryItem(item.id);
      },
      t('inventory.doneRemoved'),
    );

  const primary = actions.find((a) => a.tone === 'primary');
  const listForSale = actions.find((a) => a.action === 'list_for_sale');
  const rows = actions.filter((a) => a !== primary && !NOT_A_ROW.includes(a.action));
  const canEdit = item.actions.includes('edit_purchase');

  // The next steps stay at the bottom (hidden while the purchase is being edited - it has its own Save).
  const hasBar = !editing && (primary || listForSale || item.sale);
  const footer = hasBar ? (
    <ActionBar>
      {item.sale && (
        <Button variant="secondary" size="large" fullWidth onPress={() => go('/inventory/[id]/result')}>
          {t('inventory.seeResult')}
        </Button>
      )}
      {listForSale && (
        <Button variant={primary ? 'secondary' : 'primary'} size="large" fullWidth loading={busy === 'list_for_sale'} onPress={() => perform(listForSale)}>
          {item.sellListing && item.sellListing.status !== 'DISCARDED' ? t('inventory.manageListing') : listForSale.label}
        </Button>
      )}
      {primary && (
        <Button size="large" fullWidth loading={busy === primary.action} disabled={busy !== null && busy !== primary.action} onPress={() => perform(primary)}>
          {primary.label}
        </Button>
      )}
    </ActionBar>
  ) : undefined;

  return (
    <Screen footer={footer}>
      <Stack.Screen options={{ title: t('inventory.itemTitle') }} />
      <View style={styles.head}>
        <View style={styles.tile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {view.marketplace ? <MarketplaceMark marketplace={view.marketplace} size={30} /> : <Icon name={{ ios: 'shippingbox', android: 'inventory_2' }} color={colors.textMuted} size={26} />}
        </View>
        <View style={styles.headText}>
          <Text style={[styles.heading, font('semibold')]} accessibilityRole="header">
            {view.title}
          </Text>
          <View style={styles.badges}>
            <Badge tone={view.status.tone}>{view.status.label}</Badge>
            <Text style={[styles.muted, font('regular')]}>{view.held}</Text>
          </View>
          <Text style={[styles.muted, font('regular')]}>
            {view.purchasedOn} · {view.cost}
          </Text>
          {view.result && (
            <Text style={[styles.result, font('bold'), { color: view.result.tone === 'profit' ? colors.profitText : view.result.tone === 'loss' ? colors.lossText : colors.text }]}>
              {t('inventory.labelValue', { label: view.result.label, value: view.result.value })}
            </Text>
          )}
        </View>
      </View>

      {error && <SystemBanner tone="error" title={t('inventory.actionFailed')} message={error} />}
      {notice && (
        <Text style={[styles.notice, font('medium')]} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}
      {remove && (
        <SystemBanner
          tone="warning"
          title={remove.title}
          message={remove.body}
          action={
            <Button variant="secondary" size="small" loading={busy === 'removed'} disabled={busy !== null && busy !== 'removed'} onPress={confirmRemoved}>
              {remove.doneLabel}
            </Button>
          }
        />
      )}
      {blocked && <SystemBanner tone="info" title={blocked} />}

      {closure && (
        <Section title={closure.headline}>
          {closure.lines.map(([label, value], i) => (
            <FactRow key={label} label={label} value={value} last={i === closure.lines.length - 1 && !closure.result} />
          ))}
          {closure.result && <FactRow label={closure.result.label} value={closure.result.value} tone={closure.result.tone} strong last />}
          {closure.note && <Text style={[styles.body, styles.notes, font('regular')]}>{closure.note}</Text>}
          <Text style={[styles.note, font('regular')]}>{closure.explanation}</Text>
        </Section>
      )}

      {result && item.sale && (
        <Section title={t('inventory.saleCard')}>
          <View style={styles.hero}>
            <Metric label={result.headline} value={result.value} tone={result.tone} caption={result.summary ?? undefined} />
          </View>
        </Section>
      )}

      {rows.length > 0 && (
        <View>
          {rows.map((a, i) => (
            <ActionRow key={a.action} action={a} busy={busy === a.action} disabled={busy !== null} onPress={() => perform(a)} last={i === rows.length - 1} />
          ))}
        </View>
      )}

      <Section
        title={t('inventory.purchaseCard')}
        action={
          !editing && canEdit ? (
            <Button variant="text" size="small" onPress={() => setEditing(true)} accessibilityLabel={t('inventory.labelValue', { label: t('inventory.edit'), value: t('inventory.purchaseCard') })}>
              {t('inventory.edit')}
            </Button>
          ) : undefined
        }
      >
        {editing ? (
          <PurchaseEditor
            item={item}
            pending={busy === 'edit_purchase'}
            onCancel={() => setEditing(false)}
            onSave={(update, costs) =>
              run(
                'edit_purchase',
                async () => {
                  let next = update ? await api.updateInventoryItem(item.id, update) : null;
                  if (costs) next = await api.replacePurchaseCosts(item.id, costs);
                  return next ?? api.getInventoryItem(item.id);
                },
                t('inventory.donePurchase'),
              )
            }
          />
        ) : (
          <View>
            {view.purchaseLines.map(([label, value], i) => (
              <FactRow key={`${label}-${i}`} label={label} value={value} strong={label === t('inventory.totalCost')} last={i === view.purchaseLines.length - 1} />
            ))}
            {item.purchase.costs.length === 0 && canEdit && <Text style={[styles.note, font('regular')]}>{t('inventory.noExtraCosts')}</Text>}
            {view.notes && <Text style={[styles.body, styles.notes, font('regular')]}>{view.notes}</Text>}
          </View>
        )}
      </Section>

      <Section title={t('inventory.timelineTitle')}>
        {events === 'loading' && <LoadingState label={t('common.loading')} />}
        {events === 'error' && (
          <SystemBanner
            tone="error"
            title={t('inventory.historyLoadFailed')}
            action={
              <Button variant="secondary" size="small" onPress={() => (setEvents('loading'), loadEvents())}>
                {t('inventory.tryAgain')}
              </Button>
            }
          />
        )}
        {Array.isArray(events) && <Timeline rows={timelineView(events, context)} />}
      </Section>

      {(view.expectedLines.length > 0 || view.dealId || view.sourceUrl) && (
        <Section title={t('inventory.whenBought')}>
          {view.expectedLines.length > 0 && (
            <View>
              {view.expectedLines.map(([label, value], i) => (
                <FactRow key={label} label={label} value={value} last={i === view.expectedLines.length - 1} />
              ))}
              <Text style={[styles.note, font('regular')]}>{t('inventory.estimatesNotProfit')}</Text>
            </View>
          )}
          {(view.dealId || view.sourceUrl) && (
            <View style={styles.links}>
              {view.dealId && <LinkRow label={t('inventory.openDeal')} onPress={() => router.push({ pathname: '/deals/[id]', params: { id: view.dealId! } })} last={!view.sourceUrl} />}
              {view.sourceUrl && <LinkRow external label={t('inventory.originalListing')} onPress={() => void Linking.openURL(view.sourceUrl!)} last />}
            </View>
          )}
        </Section>
      )}
    </Screen>
  );
}

/** One allowed action as a full-width row; ending actions (cancel, return, write off, undo sale) in red. */
function ActionRow({ action, busy, disabled, onPress, last }: { action: ItemActionView; busy: boolean; disabled: boolean; onPress: () => void; last: boolean }) {
  const danger = action.tone === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityHint={action.confirm?.body}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, !last && styles.hairline, pressed && styles.pressed, disabled && !busy && styles.disabled]}
    >
      <Text style={[styles.actionText, font(danger ? 'semibold' : 'medium'), danger && styles.danger]}>{action.label}</Text>
      {busy ? <ActivityIndicator color={colors.text} /> : <Icon name={icons.chevron} color={colors.textMuted} size={14} />}
    </Pressable>
  );
}

const DOT = { profit: colors.profitText, loss: colors.lossText, info: colors.text, neutral: colors.textMuted } as const;

/** The item's history, newest first: what happened, the facts in words, when and where. */
function Timeline({ rows }: { rows: TimelineRow[] }) {
  return (
    <View>
      {rows.map((r, i) => (
        <View key={r.id} style={styles.event} accessible accessibilityLabel={[r.title, ...r.details, r.when].join('. ')}>
          <View style={styles.rail}>
            <View style={[styles.dot, { backgroundColor: DOT[r.tone] }]} />
            {i < rows.length - 1 && <View style={styles.line} />}
          </View>
          <View style={styles.eventText}>
            <Text style={[styles.body, font('semibold')]}>{r.title}</Text>
            {r.details.map((d) => (
              <Text key={d} style={[styles.small, font('regular')]}>
                {d}
              </Text>
            ))}
            <Text style={[styles.when, font('regular')]}>{r.when}</Text>
          </View>
        </View>
      ))}
    </View>
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
  head: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  tile: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.grouped, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, gap: space[1], minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  heading: { color: colors.text, fontSize: type.title, lineHeight: 26 },
  result: { fontSize: type.headline },
  body: { color: colors.text, fontSize: type.callout, lineHeight: 20, flexShrink: 1 },
  small: { color: colors.textMuted, fontSize: type.subhead, lineHeight: 18 },
  when: { color: colors.textMuted, fontSize: type.footnote },
  muted: { color: colors.textMuted, fontSize: type.subhead },
  note: { color: colors.textMuted, fontSize: type.footnote, paddingTop: space[2] },
  notes: { paddingTop: space[2] },
  notice: { color: colors.text, fontSize: type.callout },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  hero: { padding: 14, borderRadius: radius.md, backgroundColor: colors.grouped },
  links: { paddingTop: space[1] },
  form: { gap: space[4] },
  hairline: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], minHeight: 48, paddingVertical: space[2] },
  actionText: { flex: 1, color: colors.text, fontSize: type.body },
  danger: { color: colors.lossText },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.5 },
  event: { flexDirection: 'row', gap: space[3] },
  rail: { width: 12, alignItems: 'center', paddingTop: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { flex: 1, width: StyleSheet.hairlineWidth * 2, backgroundColor: colors.separator, marginTop: 2 },
  eventText: { flex: 1, gap: 2, paddingBottom: space[4], minWidth: 0 },
});
