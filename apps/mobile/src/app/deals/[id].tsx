import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { ApiError, type DealDetail } from '@rein-drop/api-client';
import {
  boughtFormDefaults,
  buildBoughtRequest,
  buildIgnoreRequest,
  CONFIDENCE_LABEL,
  dealActions,
  dealDetailView,
  IGNORE_REASON_MAX,
  NEXT_STEP_LABEL,
  OFFLINE_MESSAGE,
  REASON_EFFECT_LABEL,
  RISK_LEVEL_LABEL,
  SEVERITY_TONE,
  STRENGTH_LABEL,
  huntFormContext,
  type HuntFormContext,
} from '@rein-drop/client-core';
import { fontSize, radius, roles, space, tones } from '@rein-drop/design-tokens';
import { useSessionState } from '@/auth/SessionProvider';
import { mascotAssets } from '@/brand/assets';
import { DealEconomics } from '@/components/DealEconomics';
import { getApiClient } from '@/config/api';
import { isOffline } from '@/data/useRefreshable';
import { Badge, Button, Card, Disclosure, font, LoadingState, Screen, SystemBanner, TextInput } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ready'; deal: DealDetail; version: number };

/** Deal Detail: why it was flagged, evidence, View source, Save / Ignore / Bought. */
export default function DealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state: session } = useSessionState();
  const context = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null);
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
            message: isOffline(err) ? OFFLINE_MESSAGE : err instanceof Error ? err.message : String(err),
            notFound: err instanceof ApiError && (err.status === 404 || err.code === 'VALIDATION_FAILED'),
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [id]);
  useFocusEffect(fetchDeal);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Deal' }} />
      {load.status === 'loading' && <LoadingState label="Loading the deal…" />}
      {load.status === 'error' && (
        <SystemBanner
          tone={load.notFound ? 'info' : 'error'}
          title={load.notFound ? 'Deal not found' : "Couldn't load this deal"}
          message={load.notFound ? 'It may belong to another account or no longer exist.' : load.message}
          action={
            load.notFound ? undefined : (
              <Button
                variant="secondary"
                onPress={() => {
                  setLoad({ status: 'loading' });
                  fetchDeal();
                }}
              >
                Try again
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
            <Text style={[styles.title, font('bold')]}>Exceptional deal</Text>
            <Text style={[styles.body, font('regular')]}>Rare: the estimate is well above your usual target. Still check the details before you buy.</Text>
          </View>
        </View>
      )}

      <View style={styles.badges}>
        {view.strength && <Badge tone={view.strength.tone}>{view.strength.label}</Badge>}
        {view.confidence && <Badge tone="neutral">{view.confidence}</Badge>}
        {view.justDropped && <Badge tone="fresh">Just dropped</Badge>}
        <Badge tone={view.status.tone}>{view.status.label}</Badge>
      </View>
      <Text style={[styles.heading, font('bold')]} accessibilityRole="header">
        {view.title}
      </Text>
      <Text style={[styles.muted, font('regular')]}>
        {view.source} · {view.freshness} · Hunt: {view.huntName}
      </Text>

      {view.sourceNote && (
        <SystemBanner
          tone={view.sourceNote.tone === 'loss' ? 'warning' : 'info'}
          title={view.sourceNote.text}
          message={deal.source.available ? 'The listing may have changed since Rein Drop last saw it.' : 'You can still keep it for reference.'}
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
            Open in Inventory
          </Button>
        </View>
      )}

      <View style={styles.actions}>
        <Button variant="secondary" onPress={() => void Linking.openURL(view.url)} accessibilityHint="Opens the listing in your browser">
          {`View on ${view.source} ↗`}
        </Button>
        {can.canBuy && form !== 'bought' && (
          <Button onPress={() => setForm('bought')} disabled={pending}>
            Bought
          </Button>
        )}
        {can.canSave && (
          <Button variant="secondary" loading={pending} onPress={() => run(() => api.saveDeal(deal.id), 'Saved. Find it under Saved.')}>
            Save
          </Button>
        )}
        {can.canUnsave && (
          <Button variant="secondary" loading={pending} onPress={() => run(() => api.unsaveDeal(deal.id), 'Removed from Saved.')}>
            Remove from Saved
          </Button>
        )}
        {can.canIgnore && form !== 'ignore' && (
          <Button variant="text" onPress={() => setForm('ignore')} disabled={pending}>
            Ignore
          </Button>
        )}
        {can.canUnignore && (
          <Button variant="text" loading={pending} onPress={() => run(() => api.unignoreDeal(deal.id), 'Back in your deals.')}>
            Undo ignore
          </Button>
        )}
      </View>

      {form === 'bought' && (
        <BoughtForm
          deal={deal}
          context={context}
          pending={pending}
          onCancel={() => setForm('none')}
          onSubmit={(request) => run(() => api.markDealBought(deal.id, request), "Marked as bought. It's in your Inventory.")}
        />
      )}
      {form === 'ignore' && (
        <IgnoreForm
          pending={pending}
          onCancel={() => setForm('none')}
          onSubmit={(request) => run(() => api.ignoreDeal(deal.id, request), "Ignored. It's under Ignored if you change your mind.")}
        />
      )}
      {error && <SystemBanner tone="error" title="That didn't work" message={error} />}
      {notice && (
        <Text style={[styles.muted, font('regular')]} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}

      <Card title="Why Rein Drop flagged it">
        {deal.assessment.status === 'pending' && <Text style={[styles.muted, font('regular')]}>Rein Drop is still analysing this listing. Check back shortly.</Text>}
        {deal.assessment.status === 'failed' && <Text style={[styles.muted, font('regular')]}>The analysis didn&apos;t finish. Rein Drop will retry automatically.</Text>}
        {deal.why && (
          <>
            <Badge tone={NEXT_STEP_LABEL[deal.why.nextStep].tone}>{NEXT_STEP_LABEL[deal.why.nextStep].label}</Badge>
            <Text style={[styles.body, font('semibold')]}>{deal.why.headline}</Text>
            <Text style={[styles.body, font('regular')]}>{deal.why.summary}</Text>
            <Bullets title="In its favour" items={deal.why.positives} />
            <Bullets title="Concerns" items={deal.why.concerns} />
          </>
        )}
      </Card>

      <DealEconomics view={view} />

      <Card title="Risk and condition">
        {deal.risk ? (
          <>
            <View style={styles.inline}>
              <Badge tone={RISK_LEVEL_LABEL[deal.risk.level].tone}>{RISK_LEVEL_LABEL[deal.risk.level].label}</Badge>
              <Text style={[styles.muted, font('regular')]}>Condition: {deal.risk.condition.replace('_', ' ')}</Text>
            </View>
            {deal.risk.factors.length > 0 ? (
              deal.risk.factors.map((f) => (
                <View key={`${f.code}-${f.note}`} style={styles.inline}>
                  <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity}</Badge>
                  <Text style={[styles.body, styles.flex, font('regular')]}>{f.note}</Text>
                </View>
              ))
            ) : (
              <Text style={[styles.muted, font('regular')]}>Nothing in the listing raises a concern.</Text>
            )}
            <Text style={[styles.muted, font('regular')]}>{deal.risk.seller.note}</Text>
          </>
        ) : (
          <Text style={[styles.muted, font('regular')]}>Not assessed yet.</Text>
        )}
        <Bullets title="Ask the seller" items={questions} />
      </Card>

      <Card title="From the listing">
        {view.conditionText && <Text style={[styles.body, font('regular')]}>Condition: {view.conditionText}</Text>}
        {view.locationText && <Text style={[styles.body, font('regular')]}>Location: {view.locationText}</Text>}
        <Text style={[view.description ? styles.body : styles.muted, font('regular')]}>{view.description ?? 'No description.'}</Text>
      </Card>

      <Disclosure summary="How Rein Drop scored it">
        <View style={styles.stack}>
          <View style={styles.inline}>
            {deal.assessment.strength && <Badge tone={STRENGTH_LABEL[deal.assessment.strength].tone}>{STRENGTH_LABEL[deal.assessment.strength].label}</Badge>}
            {deal.assessment.confidence && <Badge tone="neutral">{CONFIDENCE_LABEL[deal.assessment.confidence]}</Badge>}
          </View>
          {[...deal.strengthReasons, ...deal.confidenceReasons].map((r) => (
            <View key={`${r.code}-${r.detail}`} style={styles.inline}>
              <Badge tone={REASON_EFFECT_LABEL[r.effect].tone}>{REASON_EFFECT_LABEL[r.effect].label}</Badge>
              <Text style={[styles.body, styles.flex, font('regular')]}>{r.detail}</Text>
            </View>
          ))}
          <Text style={[styles.muted, font('semibold')]}>Your Hunt&apos;s checks</Text>
          {view.checks.map((c) => (
            <View key={c.label} style={styles.inline}>
              <Badge tone={c.outcome.tone}>{c.outcome.label}</Badge>
              <Text style={[styles.body, styles.flex, font('regular')]}>
                {c.label}: {c.detail}
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
  const defaults = boughtFormDefaults(deal, context);
  const [price, setPrice] = useState(defaults.price);
  const [shipping, setShipping] = useState(defaults.shipping);
  const [error, setError] = useState<{ field?: 'price' | 'shipping'; message: string } | undefined>();
  const submit = () => {
    const built = buildBoughtRequest(price, defaults.currency, deal.price.asking, shipping);
    if (!built.ok) return setError({ field: built.field, message: built.error });
    setError(undefined);
    onSubmit(built.request);
  };
  return (
    <View style={styles.form}>
      <TextInput
        label="What did you pay?"
        kind="money"
        currency={defaults.currency}
        value={price}
        onChangeText={setPrice}
        hint={deal.price.asking ? 'Starts at the asking price - change it if you paid less or more.' : 'This listing shows no price.'}
        error={error?.field !== 'shipping' ? error?.message : undefined}
        autoFocus
      />
      <TextInput
        label="Shipping to you (optional)"
        kind="money"
        currency={defaults.currency}
        value={shipping}
        onChangeText={setShipping}
        hint={defaults.shipping ? 'From the listing - change it if it was different.' : 'Leave empty if you collected it.'}
        error={error?.field === 'shipping' ? error.message : undefined}
        onSubmitEditing={submit}
      />
      <Text style={[styles.muted, font('regular')]}>It goes into your Inventory, where you can add tax or repairs and mark it sold later.</Text>
      <View style={styles.actions}>
        <Button loading={pending} onPress={submit}>
          Mark as bought
        </Button>
        <Button variant="text" onPress={onCancel} disabled={pending}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

function IgnoreForm({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (request: Parameters<ReturnType<typeof getApiClient>['ignoreDeal']>[1]) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const submit = () => {
    const built = buildIgnoreRequest(reason);
    if (!built.ok) return setError(built.error);
    setError(undefined);
    onSubmit(built.request);
  };
  return (
    <View style={styles.form}>
      <TextInput
        label="Why isn't it for you? (optional)"
        value={reason}
        onChangeText={setReason}
        maxLength={IGNORE_REASON_MAX}
        hint="e.g. too far, wrong model, price too high"
        error={error}
        onSubmitEditing={submit}
        autoFocus
      />
      <View style={styles.actions}>
        <Button variant="secondary" loading={pending} onPress={submit}>
          Ignore this deal
        </Button>
        <Button variant="text" onPress={onCancel} disabled={pending}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

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
