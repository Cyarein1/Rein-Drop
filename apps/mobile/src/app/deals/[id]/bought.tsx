import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, TextInput as RNTextInput, View } from 'react-native';
import { ApiError, type DealDetail } from '@rein-drop/api-client';
import { boughtFormDefaults, buildBoughtRequest, dealCardView, offlineMessage, type HuntFormContext } from '@rein-drop/client-core';
import { radius, space } from '@rein-drop/design-tokens';
import { getApiClient } from '@/config/api';
import { isOffline } from '@/data/useRefreshable';
import { useDisplayContext, useT } from '@/i18n/useT';
import { Button, colors, font, GUTTER, haptic, SheetHeader, SkeletonRows, SystemBanner, Thumb, type } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; deal: DealDetail };

/**
 * "I bought it" sheet (step 89 mock-up): what you paid (starts at the asking price) and shipping
 * to you, then Mark as bought - the purchase goes into Inventory. Closes back to the deal, which
 * reloads.
 */
export default function BoughtSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const context = useDisplayContext();
  const { t } = context;
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetchDeal = useCallback(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getApiClient().getDeal(id))
      .then(
        (deal) => !cancelled && setLoad({ status: 'ready', deal }),
        (err: unknown) => !cancelled && setLoad({ status: 'error', message: isOffline(err) ? offlineMessage(t) : err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, [id, t]);
  useEffect(fetchDeal, [fetchDeal]);

  return (
    <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
      <SheetHeader title={t('deals.iBoughtIt')} onCancel={() => router.back()} />
      {load.status === 'loading' && (
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('deals.loadingDeal')} style={styles.bleed}>
          <SkeletonRows count={1} thumb={48} />
        </View>
      )}
      {load.status === 'error' && (
        <SystemBanner
          tone="error"
          title={t('deals.loadFailedTitle')}
          message={load.message}
          action={
            <Button
              variant="secondary"
              size="small"
              onPress={() => {
                setLoad({ status: 'loading' });
                fetchDeal();
              }}
            >
              {t('common.tryAgain')}
            </Button>
          }
        />
      )}
      {load.status === 'ready' && <BoughtForm deal={load.deal} context={context} onDone={() => router.back()} />}
    </ScrollView>
  );
}

function BoughtForm({ deal, context, onDone }: { deal: DealDetail; context: HuntFormContext; onDone: () => void }) {
  const { t } = context;
  const view = dealCardView(deal, context);
  const defaults = boughtFormDefaults(deal, context);
  const [price, setPrice] = useState(defaults.price);
  const [shipping, setShipping] = useState(defaults.shipping);
  const [fieldError, setFieldError] = useState<{ field?: 'price' | 'shipping'; message: string } | undefined>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const built = buildBoughtRequest(price, defaults.currency, deal.price.asking, shipping, t);
    if (!built.ok) return setFieldError({ field: built.field, message: built.error });
    setFieldError(undefined);
    setPending(true);
    setError(null);
    try {
      await getApiClient().markDealBought(deal.id, built.request);
      haptic.success();
      AccessibilityInfo.announceForAccessibility(t('deals.doneBought'));
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <View style={styles.summary}>
        <Thumb uri={view.imageUrl} size={48} />
        <View style={styles.summaryText}>
          <Text style={[styles.summaryTitle, font('medium')]} numberOfLines={1}>
            {view.title}
          </Text>
          <Text style={[styles.muted, font('regular')]} numberOfLines={1}>
            {t('deals.listedAt', { price: view.price, source: view.sourceShort })}
          </Text>
        </View>
      </View>

      <View style={styles.group}>
        <MoneyRow
          label={t('deals.paidLabel')}
          hint={t(deal.price.asking ? 'deals.paidHintAsking' : 'deals.paidHintNoPrice')}
          currency={defaults.currency}
          value={price}
          onChange={setPrice}
          error={fieldError?.field !== 'shipping' ? fieldError?.message : undefined}
          autoFocus
        />
        <MoneyRow
          label={t('deals.shippingLabel')}
          hint={t(defaults.shipping ? 'deals.shippingHintListing' : 'deals.shippingHintEmpty')}
          currency={defaults.currency}
          value={shipping}
          onChange={setShipping}
          error={fieldError?.field === 'shipping' ? fieldError.message : undefined}
          onSubmit={() => void submit()}
          last
        />
      </View>
      <Text style={[styles.note, font('regular')]}>{t('deals.boughtNote')}</Text>
      {error && <SystemBanner tone="error" title={t('errors.actionFailed')} message={error} />}
      <Button size="large" loading={pending} onPress={() => void submit()}>
        {t('deals.markBought')}
      </Button>
    </>
  );
}

/** One row of the grouped form: label + hint on the left, the amount (with its currency) on the right. */
function MoneyRow({
  label,
  hint,
  currency,
  value,
  onChange,
  error,
  onSubmit,
  autoFocus,
  last,
}: {
  label: string;
  hint: string;
  currency: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  last?: boolean;
}) {
  const t = useT();
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.rowMain}>
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, font('regular')]}>{label}</Text>
          <Text style={[styles.hint, font('regular')]}>{hint}</Text>
        </View>
        <View style={[styles.amount, !!error && styles.amountInvalid]}>
          <Text style={[styles.currency, font('medium')]}>{currency}</Text>
          <RNTextInput
            value={value}
            onChangeText={onChange}
            keyboardType="decimal-pad"
            returnKeyType={onSubmit ? 'done' : 'next'}
            onSubmitEditing={onSubmit}
            autoFocus={autoFocus}
            accessibilityLabel={label}
            accessibilityHint={[error && t('common.inputError', { error }), hint].filter(Boolean).join('. ')}
            aria-invalid={!!error}
            style={[styles.input, font('semibold')]}
          />
        </View>
      </View>
      {error && (
        <Text accessibilityLiveRegion="polite" style={[styles.error, font('regular')]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: GUTTER, paddingTop: space[2], paddingBottom: space[8], gap: space[4] },
  bleed: { marginHorizontal: -GUTTER },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: 10, borderRadius: radius.md, backgroundColor: colors.grouped },
  summaryText: { flex: 1, minWidth: 0, gap: 2 },
  summaryTitle: { color: colors.text, fontSize: type.callout },
  muted: { color: colors.textMuted, fontSize: type.footnote },
  group: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md },
  row: { paddingHorizontal: 14, paddingVertical: space[2] },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { color: colors.text, fontSize: type.body },
  hint: { color: colors.textMuted, fontSize: type.footnote },
  amount: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 120, minHeight: 44, borderBottomWidth: 1.5, borderBottomColor: 'transparent' },
  amountInvalid: { borderBottomColor: colors.destructive },
  currency: { color: colors.textMuted, fontSize: type.subhead },
  input: { flex: 1, minHeight: 44, textAlign: 'right', color: colors.text, fontSize: type.headline, paddingVertical: 0 },
  error: { color: colors.lossText, fontSize: type.subhead, marginTop: 2 },
  note: { color: colors.textMuted, fontSize: type.footnote, lineHeight: 16 },
});
