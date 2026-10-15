import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { AccessibilityInfo, Image, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, type DealDetail } from '@rein-drop/api-client';
import {
  confidenceLabel,
  dealActions,
  dealDetailView,
  nextStepLabel,
  offlineMessage,
  reasonEffectLabel,
  riskLevelLabel,
  SEVERITY_TONE,
  strengthLabel,
  type HuntFormContext,
} from '@rein-drop/client-core';
import { radius, space, tones } from '@rein-drop/design-tokens';
import { mascotAssets } from '@/brand/assets';
import { MarketplaceMark, MarketplaceName } from '@/brand/MarketplaceMark';
import { DealEconomics } from '@/components/DealEconomics';
import { getApiClient } from '@/config/api';
import { isOffline } from '@/data/useRefreshable';
import { useDisplayContext, useT } from '@/i18n/useT';
import { ActionBar, Badge, Button, colors, font, GUTTER, haptic, Icon, IconButton, icons, SkeletonRows, SystemBanner, type } from '@/ui';

type Load = { status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ready'; deal: DealDetail; version: number };

const PHOTO_HEIGHT = 300;

/**
 * Deal Detail (step 89 mock-up): swipeable photo header with floating back / share / save, the
 * price / resale / upside strip, why it was flagged, further details as expandable rows, and a
 * fixed bar - View on {marketplace} + I bought it. "I bought it" and "Not for me" open sheets
 * (`./bought`, `./dismiss`); this screen reloads when they close.
 */
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

  // A fresh copy (screen refocused, e.g. a sheet closed) remounts the body with it.
  if (load.status === 'ready') return <DealBody key={load.version} initial={load.deal} context={context} />;

  return (
    <View style={styles.screen}>
      <View style={[styles.photo, styles.photoEmpty, { height: PHOTO_HEIGHT }]} />
      <View style={styles.content}>
        {load.status === 'loading' && (
          <View accessible accessibilityRole="progressbar" accessibilityLabel={t('deals.loadingDeal')} style={styles.bleed}>
            <SkeletonRows count={2} thumb={0} />
          </View>
        )}
        {load.status === 'error' && (
          <SystemBanner
            tone={load.notFound ? 'info' : 'error'}
            title={t(load.notFound ? 'deals.notFoundTitle' : 'deals.loadFailedTitle')}
            message={load.notFound ? t('deals.notFoundBody') : load.message}
            action={
              load.notFound ? undefined : (
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
              )
            }
          />
        )}
      </View>
      <FloatingBar />
    </View>
  );
}

/** Back (+ optional share / save) floating over the photo, inside the safe area and the gutter. */
function FloatingBar({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  return (
    <View style={[styles.floating, { top: insets.top + space[2] }]} pointerEvents="box-none">
      <IconButton variant="floating" icon={icons.back} label={t('deals.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/deals'))} />
      <View style={styles.floatingRight} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

function DealBody({ initial, context }: { initial: DealDetail; context: HuntFormContext }) {
  const router = useRouter();
  const [deal, setDeal] = useState(initial);
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
      setNotice(done);
      haptic.success();
      AccessibilityInfo.announceForAccessibility(done);
    } catch (err) {
      setError(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };
  const api = getApiClient();
  const share = () =>
    void Share.share(Platform.OS === 'ios' ? { message: view.title, url: view.url } : { message: t('deals.shareMessage', { title: view.title, url: view.url }) }).catch(() => undefined);
  const openSheet = (sheet: 'bought' | 'dismiss') => router.push({ pathname: sheet === 'bought' ? '/deals/[id]/bought' : '/deals/[id]/dismiss', params: { id: deal.id } });

  const questions = [...new Set([...(deal.why?.questionsForSeller ?? []), ...(deal.risk?.missingInformation.map((m) => m.question) ?? [])])];
  const exceptionalArt = mascotAssets.exceptionalDeal;
  const meta = [view.conditionText, view.locationText, t('deals.huntLabel', { name: view.huntName })].filter(Boolean).join(' · ');

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <PhotoHeader urls={view.imageUrls} />
        <View style={styles.content}>
          {view.exceptional && (
            <View style={styles.exceptional} accessibilityRole="summary">
              {/* Only the approved "exceptional deal" mascot (surprised pose) may appear here. */}
              {exceptionalArt && <Image source={exceptionalArt} style={styles.art} accessibilityIgnoresInvertColors />}
              <View style={styles.flex}>
                <Text style={[styles.exceptionalTitle, font('bold')]}>{t('deals.exceptionalTitle')}</Text>
                <Text style={[styles.small, font('regular')]}>{t('deals.exceptionalBody')}</Text>
              </View>
            </View>
          )}

          <View style={styles.badges}>
            {view.strength && <Badge tone={view.strength.tone}>{view.strength.label}</Badge>}
            {view.confidence && <Badge tone="neutral">{view.confidence}</Badge>}
            {view.justDropped && <Badge tone="fresh">{t('deals.justDropped')}</Badge>}
            <Badge tone={view.status.tone}>{view.status.label}</Badge>
          </View>
          <Text style={[styles.heading, font('semibold')]} accessibilityRole="header">
            {view.title}
          </Text>
          <View style={styles.meta}>
            <MarketplaceName marketplace={view.marketplace} size={14} textStyle={styles.metaSource} />
            <Text style={[styles.metaText, font('regular')]}>· {view.freshness}</Text>
          </View>
          {meta ? <Text style={[styles.metaText, font('regular')]}>{meta}</Text> : null}

          {view.sourceNote && (
            <SystemBanner
              tone={view.sourceNote.tone === 'loss' ? 'warning' : 'info'}
              title={view.sourceNote.text}
              message={t(deal.source.available ? 'deals.sourceMayHaveChanged' : 'deals.sourceKeepForReference')}
            />
          )}
          {view.decisions.map((d) => (
            <Text key={d} style={[styles.small, font('regular')]}>
              {d}
            </Text>
          ))}
          {notice && (
            <Text style={[styles.notice, font('medium')]} accessibilityLiveRegion="polite">
              {notice}
            </Text>
          )}
          {error && <SystemBanner tone="error" title={t('errors.actionFailed')} message={error} />}

          <DealEconomics view={view} />

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, font('semibold')]} accessibilityRole="header">
              {t('deals.whyTitle')}
            </Text>
            {deal.assessment.status === 'pending' && <Text style={[styles.small, font('regular')]}>{t('deals.whyPending')}</Text>}
            {deal.assessment.status === 'failed' && <Text style={[styles.small, font('regular')]}>{t('deals.whyFailed')}</Text>}
            {deal.why && (
              <>
                <Badge tone={nextStepLabel(deal.why.nextStep, t).tone}>{nextStepLabel(deal.why.nextStep, t).label}</Badge>
                <Text style={[styles.body, font('semibold')]}>{deal.why.headline}</Text>
                <Text style={[styles.body, font('regular')]}>{deal.why.summary}</Text>
                <Checklist title={t('deals.inFavour')} items={deal.why.positives} kind="good" />
                <Checklist title={t('deals.concerns')} items={deal.why.concerns} kind="check" />
              </>
            )}
          </View>

          <View style={styles.rows}>
            <InfoRow title={t('deals.riskTitle')}>
              {deal.risk ? (
                <>
                  <View style={styles.inline}>
                    <Badge tone={riskLevelLabel(deal.risk.level, t).tone}>{riskLevelLabel(deal.risk.level, t).label}</Badge>
                    <Text style={[styles.small, font('regular')]}>{t('deals.riskCondition', { condition: deal.risk.condition })}</Text>
                  </View>
                  {deal.risk.factors.length > 0 ? (
                    deal.risk.factors.map((f) => (
                      <View key={`${f.code}-${f.note}`} style={styles.inline}>
                        <Badge tone={SEVERITY_TONE[f.severity]}>{t(SEVERITY_LABEL[f.severity])}</Badge>
                        <Text style={[styles.body, styles.flex, font('regular')]}>{f.note}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={[styles.small, font('regular')]}>{t('deals.noConcerns')}</Text>
                  )}
                  <Text style={[styles.small, font('regular')]}>{deal.risk.seller.note}</Text>
                </>
              ) : (
                <Text style={[styles.small, font('regular')]}>{t('deals.notAssessed')}</Text>
              )}
              <Checklist title={t('deals.askSeller')} items={questions} kind="ask" />
            </InfoRow>

            <InfoRow title={t('deals.fromListing')}>
              {view.conditionText && <Text style={[styles.body, font('regular')]}>{t('deals.listingCondition', { text: view.conditionText })}</Text>}
              {view.locationText && <Text style={[styles.body, font('regular')]}>{t('deals.listingLocation', { text: view.locationText })}</Text>}
              <Text style={[view.description ? styles.body : styles.small, font('regular')]}>{view.description ?? t('deals.noDescription')}</Text>
            </InfoRow>

            <InfoRow title={t('deals.scoredTitle')}>
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
              <Text style={[styles.small, font('semibold')]}>{t('deals.huntChecks')}</Text>
              {view.checks.map((c) => (
                <View key={c.label} style={styles.inline}>
                  <Badge tone={c.outcome.tone}>{c.outcome.label}</Badge>
                  <Text style={[styles.body, styles.flex, font('regular')]}>{t('deals.checkLine', { label: c.label, detail: c.detail })}</Text>
                </View>
              ))}
              {view.alertNote && <Text style={[styles.small, font('regular')]}>{view.alertNote}</Text>}
            </InfoRow>

            {can.canIgnore && <ActionRow icon={icons.dismiss} title={t('deals.notForMe')} onPress={() => openSheet('dismiss')} disabled={pending} />}
            {can.canUnignore && <ActionRow icon={icons.dismiss} title={t('deals.undoIgnore')} onPress={() => void run(() => api.unignoreDeal(deal.id), t('deals.doneUnignored'))} disabled={pending} />}
          </View>
        </View>
      </ScrollView>

      <FloatingBar>
        <IconButton variant="floating" icon={icons.share} label={t('deals.share')} onPress={share} />
        {can.canSave && <IconButton variant="floating" icon={icons.save} label={t('deals.save')} disabled={pending} onPress={() => void run(() => api.saveDeal(deal.id), t('deals.doneSaved'))} />}
        {can.canUnsave && (
          <IconButton variant="floating" icon={icons.saved} label={t('deals.removeFromSaved')} disabled={pending} onPress={() => void run(() => api.unsaveDeal(deal.id), t('deals.doneUnsaved'))} />
        )}
      </FloatingBar>

      <ActionBar>
        <Button
          variant="secondary"
          size="large"
          fullWidth
          icon={<MarketplaceMark marketplace={view.marketplace} size={16} />}
          onPress={() => void Linking.openURL(view.url)}
          accessibilityHint={t('deals.viewOnHint')}
        >
          {t('deals.viewOn', { source: view.sourceShort })}
        </Button>
        {can.canBuy ? (
          <Button size="large" fullWidth disabled={pending} onPress={() => openSheet('bought')}>
            {t('deals.iBoughtIt')}
          </Button>
        ) : deal.decision.inventoryItemId ? (
          <Button size="large" fullWidth onPress={() => router.push({ pathname: '/inventory/[id]', params: { id: deal.decision.inventoryItemId! } })}>
            {t('deals.openInInventory')}
          </Button>
        ) : null}
      </ActionBar>
    </View>
  );
}

/** Listing photos, swiped sideways (paged) with a "1 / N" counter; screen readers swipe up / down to change photo. */
function PhotoHeader({ urls }: { urls: string[] }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const ref = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const count = urls.length;
  if (count === 0) {
    return (
      <View style={[styles.photo, styles.photoEmpty]} accessible accessibilityRole="image" accessibilityLabel={t('deals.noPhoto')}>
        <Icon name={icons.photo} size={44} color={colors.textDisabled} />
      </View>
    );
  }
  const go = (next: number) => {
    const i = Math.max(0, Math.min(count - 1, next));
    ref.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
  };
  return (
    <View
      style={styles.photo}
      accessible
      accessibilityRole={count > 1 ? 'adjustable' : 'image'}
      accessibilityLabel={t('deals.photosA11y', { index: index + 1, count })}
      accessibilityActions={count > 1 ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
      onAccessibilityAction={(e) => go(index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
    >
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        scrollEnabled={count > 1}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {urls.map((uri) => (
          <ExpoImage key={uri} source={{ uri }} style={{ width, height: PHOTO_HEIGHT }} contentFit="contain" transition={150} recyclingKey={uri} />
        ))}
      </ScrollView>
      {count > 1 && (
        <View style={styles.counter}>
          <Text style={[styles.counterText, font('semibold')]}>{t('deals.photoCounter', { index: index + 1, count })}</Text>
        </View>
      )}
    </View>
  );
}

/** "In its favour" ticks / "Concerns" and seller questions with a caution mark. */
function Checklist({ title, items, kind }: { title: string; items: string[]; kind: 'good' | 'check' | 'ask' }) {
  if (items.length === 0) return null;
  const good = kind === 'good';
  return (
    <View style={styles.checklist} accessibilityLabel={title}>
      <Text style={[styles.small, font('semibold')]}>{title}</Text>
      {items.map((item) => (
        <View key={item} style={styles.checkRow}>
          <View style={styles.checkIcon}>
            <Icon name={good ? icons.check : kind === 'ask' ? icons.info : icons.warning} size={16} color={good ? colors.profitText : kind === 'ask' ? colors.textMuted : colors.warningText} />
          </View>
          <Text style={[styles.checkText, font('regular')]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** A row that opens to show more (risk, listing text, scoring). Collapsed by default. */
function InfoRow({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.rowHead, pressed && styles.pressed]}
      >
        <Text style={[styles.rowTitle, font('medium')]}>{title}</Text>
        <Icon name={open ? icons.chevronDown : icons.chevron} size={14} color={colors.textMuted} />
      </Pressable>
      {open && <View style={styles.rowBody}>{children}</View>}
    </View>
  );
}

function ActionRow({ icon, title, onPress, disabled }: { icon: (typeof icons)[keyof typeof icons]; title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, styles.rowHead, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={styles.actionRowLeft}>
        <Icon name={icon} size={18} color={colors.text} />
        <Text style={[styles.rowTitle, font('medium')]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const SEVERITY_LABEL = { low: 'deals.severityLow', medium: 'deals.severityMedium', high: 'deals.severityHigh' } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: space[6] },
  photo: { height: PHOTO_HEIGHT, backgroundColor: colors.grouped },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', right: 12, bottom: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(18,35,63,0.75)' },
  counterText: { color: colors.background, fontSize: type.footnote },
  floating: { position: 'absolute', left: GUTTER - 4, right: GUTTER - 4, flexDirection: 'row', justifyContent: 'space-between' },
  floatingRight: { flexDirection: 'row', gap: space[2] },
  content: { paddingHorizontal: GUTTER, paddingTop: space[4], gap: 14 },
  bleed: { marginHorizontal: -GUTTER },
  exceptional: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[3],
    borderWidth: 1.5,
    borderColor: tones.fresh.accent,
    borderRadius: radius.md,
    backgroundColor: tones.fresh.background,
  },
  art: { width: 52, height: 52, resizeMode: 'contain' },
  exceptionalTitle: { color: colors.text, fontSize: type.headline },
  flex: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heading: { color: colors.text, fontSize: type.title, lineHeight: 26 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space[1], flexWrap: 'wrap', marginTop: -8 },
  metaSource: { color: colors.text, fontSize: type.subhead },
  metaText: { color: colors.textMuted, fontSize: type.subhead, lineHeight: 18 },
  notice: { color: colors.profitText, fontSize: type.subhead },
  body: { color: colors.text, fontSize: type.callout, lineHeight: 20 },
  small: { color: colors.textMuted, fontSize: type.subhead, lineHeight: 18 },
  section: { gap: space[2], marginTop: space[2] },
  sectionTitle: { color: colors.text, fontSize: type.body },
  checklist: { gap: 2 },
  checkRow: { flexDirection: 'row', gap: 10, paddingVertical: 6 },
  checkIcon: { paddingTop: 2 },
  checkText: { flex: 1, color: colors.text, fontSize: type.callout, lineHeight: 20 },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  rows: { marginTop: space[1] },
  row: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingVertical: space[3] },
  rowTitle: { color: colors.text, fontSize: type.body },
  rowBody: { gap: space[2], paddingBottom: space[4] },
  actionRowLeft: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
});
