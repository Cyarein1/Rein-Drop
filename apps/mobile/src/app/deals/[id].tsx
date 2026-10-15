import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { ApiError, type DealDetail } from '@rein-drop/api-client';
import {
  boughtFormDefaults,
  buildBoughtRequest,
  buildIgnoreRequest,
  confidenceLabel,
  dealActions,
  dealDetailView,
  IGNORE_REASON_MAX,
  nextStepLabel,
  offlineMessage,
  reasonEffectLabel,
  riskLevelLabel,
  SEVERITY_TONE,
  strengthLabel,
  type HuntFormContext,
} from '@rein-drop/client-core';
import { fontSize, radius, roles, space, tones } from '@rein-drop/design-tokens';
import { mascotAssets } from '@/brand/assets';
import { MarketplaceMark, MarketplaceName } from '@/brand/MarketplaceMark';
import { DealEconomics } from '@/components/DealEconomics';
import { getApiClient } from '@/config/api';
import { isOffline } from '@/data/useRefreshable';
import { useDisplayContext } from '@/i18n/useT';
import { Badge, Button, Card, Disclosure, font, LoadingState, Screen, SystemBanner, TextInput } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ready'; deal: DealDetail; version: number };

/** Deal Detail: why it was flagged, evidence, View source, Save / Ignore / Bought. */
export default function DealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const context = useDisplayContext();
  const { t } = context;
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetchDeal = useCallback(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getApiClient().getDeal(id))
      .then(
        (deal) => !cancelled && setLoad((prev) => ({ status: 'ready', deal, version: prev.status === 'ready' ? prev.version + 1 : 0 })),
        (err: unknown) =>
          !cancelled &&
          setLoad({
            status: 'error',
            message: isOffline(err) ? offlineMessage(t) : err instanceof Error ? err.message : String(err),
            notFound: err instanceof ApiError && (err.status === 404 || err.code === 'VALIDATION_FAILED'),
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [id, t]);
  useFocusEffect(fetchDeal);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('nav.titleDeal') }} />
      {load.status === 'loading' && <LoadingState label={t('deals.loadingDeal')} />}
      {load.status === 'error' && (
        <SystemBanner
          tone={load.notFound ? 'info' : 'error'}
          title={t(load.notFound ? 'deals.notFoundTitle' : 'deals.loadFailedTitle')}
          message={load.notFound ? t('deals.notFoundBody') : load.message}
          action={
            load.notFound ? undefined : (
              <Button
                variant="secondary"
                onPress={() => {
                  setLoad({ status: 'loading' });
                  fetchDeal();
                }}
              >
                {t('common.tryAgain')}
              </Button>
            )
          }
        />
      )}
      {/* A fresh copy (screen refocused) remounts the body with it. */}
      {load.status === 'ready' && <DealBody key={load.version} initial={load.deal} context={context} />}
    </Screen>
  );
}

type Form = 'none' | 'bought' | 'ignore';

function DealBody({ initial, context }: { initial: DealDetail; context: HuntFormContext }) {
  const router = useRouter();
  const [deal, setDeal] = useState(initial);
  const [form, setForm] = useState<Form>('none');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { t } = context;
  const view = dealDetailView(deal, context);
  const can = dealActions(deal);

  // Opening the deal marks it seen (best effort).
  const markedSeen = useRef(false);
  useEffect(() => {
    if (markedSeen.current || initial.matchStatus !== 'NEW') return;
    markedSeen.current = true;
    getApiClient().markDealSeen(initial.id).then(setDeal, () => undefined);
  }, [initial.id, initial.matchStatus]);

  const run = async (action: () => Promise<DealDetail>, done: string) => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      setDeal(await action());
      setForm('none');
      setNotice(done);
    } catch (err) {
      setError(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };
  const api = getApiClient();
  const questions = [...new Set([...(deal.why?.questionsForSeller ?? []), ...(deal.risk?.missingInformation.map((m) => m.question) ?? [])])];
  const exceptionalArt = mascotAssets.exceptionalDeal;

  return (
    <>
      {view.exceptional && (
        <View style={styles.exceptional} accessibilityRole="summary">
          {/* Only the approved "exceptional deal" mascot (surprised pose) may appear here. */}
          {exceptionalArt && <Image source={exceptionalArt} style={styles.art} accessibilityIgnoresInvertColors />}
          <View style={styles.flex}>
            <Text style={[styles.title, font('bold')]}>{t('deals.exceptionalTitle')}</Text>
            <Text style={[styles.body, font('regular')]}>{t('deals.exceptionalBody')}</Text>
          </View>
        </View>
      )}

      <View style={styles.badges}>
        {view.strength && <Badge tone={view.strength.tone}>{view.strength.label}</Badge>}
        {view.confidence && <Badge tone="neutral">{view.confidence}</Badge>}
        {view.justDropped && <Badge tone="fresh">{t('deals.justDropped')}</Badge>}
        <Badge tone={view.status.tone}>{view.status.label}</Badge>
      </View>
      <Text style={[styles.heading, font('bold')]} accessibilityRole="header">
        {view.title}
      </Text>
      <View style={styles.inline}>
        <MarketplaceName marketplace={view.marketplace} size={18} />
        <Text style={[styles.muted, styles.flex, font('regular')]}>
          · {view.freshness} · {t('deals.huntLabel', { name: view.huntName })}
        </Text>
      </View>

      {view.sourceNote && (
        <SystemBanner
          tone={view.sourceNote.tone === 'loss' ? 'warning' : 'info'}
          title={view.sourceNote.text}
          message={t(deal.source.available ? 'deals.sourceMayHaveChanged' : 'deals.sourceKeepForReference')}
        />
      )}
      {view.decisions.map((d) => (
        <Text key={d} style={[styles.muted, font('regular')]}>
          {d}
        </Text>
      ))}
      {deal.decision.inventoryItemId && (
        <View style={styles.actions}>
          <Button variant="secondary" onPress={() => router.push({ pathname: '/inventory/[id]', params: { id: deal.decision.inventoryItemId! } })}>
            {t('deals.openInInventory')}
          </Button>
        </View>
      )}

      <View style={styles.actions}>
        <Button variant="secondary" icon={<MarketplaceMark marketplace={view.marketplace} size={16} />} onPress={() => void Linking.openURL(view.url)} accessibilityHint={t('deals.viewOnHint')}>
          {t('deals.viewOn', { source: view.source })}
        </Button>
        {can.canBuy && form !== 'bought' && (
          <Button onPress={() => setForm('bought')} disabled={pending}>
            {t('deals.actionBought')}
          </Button>
        )}
        {can.canSave && (
          <Button variant="secondary" loading={pending} onPress={() => run(() => api.saveDeal(deal.id), t('deals.doneSaved'))}>
            {t('deals.save')}
          </Button>
        )}
        {can.canUnsave && (
          <Button variant="secondary" loading={pending} onPress={() => run(() => api.unsaveDeal(deal.id), t('deals.doneUnsaved'))}>
            {t('deals.removeFromSaved')}
          </Button>
        )}
        {can.canIgnore && form !== 'ignore' && (
          <Button variant="text" onPress={() => setForm('ignore')} disabled={pending}>
            {t('deals.actionIgnore')}
          </Button>
        )}
        {can.canUnignore && (
          <Button variant="text" loading={pending} onPress={() => run(() => api.unignoreDeal(deal.id), t('deals.doneUnignored'))}>
            {t('deals.undoIgnore')}
          </Button>
        )}
      </View>

      {form === 'bought' && (
        <BoughtForm
          deal={deal}
          context={context}
          pending={pending}
          onCancel={() => setForm('none')}
          onSubmit={(request) => run(() => api.markDealBought(deal.id, request), t('deals.doneBought'))}
        />
      )}
      {form === 'ignore' && (
        <IgnoreForm
          context={context}
          pending={pending}
          onCancel={() => setForm('none')}
          onSubmit={(request) => run(() => api.ignoreDeal(deal.id, request), t('deals.doneIgnored'))}
        />
      )}
      {error && <SystemBanner tone="error" title={t('errors.actionFailed')} message={error} />}
      {notice && (
        <Text style={[styles.muted, font('regular')]} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}

      <Card title={t('deals.whyTitle')}>
        {deal.assessment.status === 'pending' && <Text style={[styles.muted, font('regular')]}>{t('deals.whyPending')}</Text>}
        {deal.assessment.status === 'failed' && <Text style={[styles.muted, font('regular')]}>{t('deals.whyFailed')}</Text>}
        {deal.why && (
          <>
            <Badge tone={nextStepLabel(deal.why.nextStep, t).tone}>{nextStepLabel(deal.why.nextStep, t).label}</Badge>
            <Text style={[styles.body, font('semibold')]}>{deal.why.headline}</Text>
            <Text style={[styles.body, font('regular')]}>{deal.why.summary}</Text>
            <Bullets title={t('deals.inFavour')} items={deal.why.positives} />
            <Bullets title={t('deals.concerns')} items={deal.why.concerns} />
          </>
        )}
      </Card>

      <DealEconomics view={view} />

      <Card title={t('deals.riskTitle')}>
        {deal.risk ? (
          <>
            <View style={styles.inline}>
              <Badge tone={riskLevelLabel(deal.risk.level, t).tone}>{riskLevelLabel(deal.risk.level, t).label}</Badge>
              <Text style={[styles.muted, font('regular')]}>{t('deals.riskCondition', { condition: deal.risk.condition })}</Text>
            </View>
            {deal.risk.factors.length > 0 ? (
              deal.risk.factors.map((f) => (
                <View key={`${f.code}-${f.note}`} style={styles.inline}>
                  <Badge tone={SEVERITY_TONE[f.severity]}>{t(SEVERITY_LABEL[f.severity])}</Badge>
                  <Text style={[styles.body, styles.flex, font('regular')]}>{f.note}</Text>
                </View>
              ))
            ) : (
              <Text style={[styles.muted, font('regular')]}>{t('deals.noConcerns')}</Text>
            )}
            <Text style={[styles.muted, font('regular')]}>{deal.risk.seller.note}</Text>
          </>
        ) : (
          <Text style={[styles.muted, font('regular')]}>{t('deals.notAssessed')}</Text>
        )}
        <Bullets title={t('deals.askSeller')} items={questions} />
      </Card>

      <Card title={t('deals.fromListing')}>
        {view.conditionText && <Text style={[styles.body, font('regular')]}>{t('deals.listingCondition', { text: view.conditionText })}</Text>}
        {view.locationText && <Text style={[styles.body, font('regular')]}>{t('deals.listingLocation', { text: view.locationText })}</Text>}
        <Text style={[view.description ? styles.body : styles.muted, font('regular')]}>{view.description ?? t('deals.noDescription')}</Text>
      </Card>

      <Disclosure summary={t('deals.scoredTitle')}>
        <View style={styles.stack}>
          <View style={styles.inline}>
            {deal.assessment.strength && <Badge tone={strengthLabel(deal.assessment.strength, t).tone}>{strengthLabel(deal.assessment.strength, t).label}</Badge>}
            {deal.assessment.confidence && <Badge tone="neutral">{confidenceLabel(deal.assessment.confidence, t)}</Badge>}
          </View>
          {[...deal.strengthReasons, ...deal.confidenceReasons].map((r) => (
            <View key={`${r.code}-${r.detail}`} style={styles.inline}>
              <Badge tone={reasonEffectLabel(r.effect, t).tone}>{reasonEffectLabel(r.effect, t).label}</Badge>
              <Text style={[styles.body, styles.flex, font('regular')]}>{r.detail}</Text>
            </View>
          ))}
          <Text style={[styles.muted, font('semibold')]}>{t('deals.huntChecks')}</Text>
          {view.checks.map((c) => (
            <View key={c.label} style={styles.inline}>
              <Badge tone={c.outcome.tone}>{c.outcome.label}</Badge>
              <Text style={[styles.body, styles.flex, font('regular')]}>
                {t('deals.checkLine', { label: c.label, detail: c.detail })}
              </Text>
            </View>
          ))}
          {view.alertNote && <Text style={[styles.muted, font('regular')]}>{view.alertNote}</Text>}
        </View>
      </Disclosure>
    </>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.stack} accessibilityLabel={title}>
      <Text style={[styles.muted, font('semibold')]}>{title}</Text>
      {items.map((item) => (
        <Text key={item} style={[styles.body, font('regular')]}>
          • {item}
        </Text>
      ))}
    </View>
  );
}

function BoughtForm({
  deal,
  context,
  pending,
  onCancel,
  onSubmit,
}: {
  deal: DealDetail;
  context: HuntFormContext;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (request: Parameters<ReturnType<typeof getApiClient>['markDealBought']>[1]) => void;
}) {
  const { t } = context;
  const defaults = boughtFormDefaults(deal, context);
  const [price, setPrice] = useState(defaults.price);
  const [shipping, setShipping] = useState(defaults.shipping);
  const [error, setError] = useState<{ field?: 'price' | 'shipping'; message: string } | undefined>();
  const submit = () => {
    const built = buildBoughtRequest(price, defaults.currency, deal.price.asking, shipping, t);
    if (!built.ok) return setError({ field: built.field, message: built.error });
    setError(undefined);
    onSubmit(built.request);
  };
  return (
    <View style={styles.form}>
      <TextInput
        label={t('deals.paidLabel')}
        kind="money"
        currency={defaults.currency}
        value={price}
        onChangeText={setPrice}
        hint={t(deal.price.asking ? 'deals.paidHintAsking' : 'deals.paidHintNoPrice')}
        error={error?.field !== 'shipping' ? error?.message : undefined}
        autoFocus
      />
      <TextInput
        label={t('deals.shippingLabel')}
        kind="money"
        currency={defaults.currency}
        value={shipping}
        onChangeText={setShipping}
        hint={t(defaults.shipping ? 'deals.shippingHintListing' : 'deals.shippingHintEmpty')}
        error={error?.field === 'shipping' ? error.message : undefined}
        onSubmitEditing={submit}
      />
      <Text style={[styles.muted, font('regular')]}>{t('deals.boughtNote')}</Text>
      <View style={styles.actions}>
        <Button loading={pending} onPress={submit}>
          {t('deals.markBought')}
        </Button>
        <Button variant="text" onPress={onCancel} disabled={pending}>
          {t('common.cancel')}
        </Button>
      </View>
    </View>
  );
}

function IgnoreForm({
  context,
  pending,
  onCancel,
  onSubmit,
}: {
  context: HuntFormContext;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (request: Parameters<ReturnType<typeof getApiClient>['ignoreDeal']>[1]) => void;
}) {
  const { t } = context;
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const submit = () => {
    const built = buildIgnoreRequest(reason, t);
    if (!built.ok) return setError(built.error);
    setError(undefined);
    onSubmit(built.request);
  };
  return (
    <View style={styles.form}>
      <TextInput
        label={t('deals.ignoreLabel')}
        value={reason}
        onChangeText={setReason}
        maxLength={IGNORE_REASON_MAX}
        hint={t('deals.ignoreHint')}
        error={error}
        onSubmitEditing={submit}
        autoFocus
      />
      <View style={styles.actions}>
        <Button variant="secondary" loading={pending} onPress={submit}>
          {t('deals.ignoreSubmit')}
        </Button>
        <Button variant="text" onPress={onCancel} disabled={pending}>
          {t('common.cancel')}
        </Button>
      </View>
    </View>
  );
}

const SEVERITY_LABEL = { low: 'deals.severityLow', medium: 'deals.severityMedium', high: 'deals.severityHigh' } as const;

const styles = StyleSheet.create({
  exceptional: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    borderWidth: 2,
    borderColor: tones.fresh.accent,
    borderRadius: radius.md,
    backgroundColor: tones.fresh.background,
  },
  art: { width: 64, height: 64, resizeMode: 'contain' },
  flex: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  heading: { color: roles.text, fontSize: fontSize['2xl'] },
  title: { color: roles.text, fontSize: fontSize.lg },
  body: { color: roles.text, fontSize: fontSize.md },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  stack: { gap: space[2] },
  form: { gap: space[3], padding: space[4], borderWidth: 1, borderColor: roles.border, borderRadius: radius.md, backgroundColor: roles.surfaceSecondary },
});
