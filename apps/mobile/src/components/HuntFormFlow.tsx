import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Translator } from '@rein-drop/i18n';
import { useRouter } from 'expo-router';
import {
  AccessibilityInfo,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, type CreateHuntRequest, type Hunt, type HuntCondition, type UpdateHuntRequest } from '@rein-drop/api-client';
import {
  buildCreateHuntRequest,
  buildUpdateHuntRequest,
  huntReview,
  mapHuntErrors,
  applyArea,
  mapCaption,
  movePin,
  needsLocation,
  pickPlace,
  priceQuickPicks,
  priceSlider,
  priceSliderEnds,
  priceSliderPosition,
  priceSliderText,
  priceSliderValueText,
  radiusKmForMap,
  radiusQuickPicks,
  typeLocation,
  type HuntFormContext,
  type HuntFormErrors,
  type HuntFormField,
  type HuntFormValues,
  type PrefillNote,
} from '@rein-drop/client-core';
import { radius, space } from '@rein-drop/design-tokens';
import { MarketplaceMark } from '@/brand/MarketplaceMark';
import { getApiClient } from '@/config/api';
import { LocationField } from '@/geo/LocationField';
import { LocationMap } from '@/geo/LocationMap';
import { useLocationSupport } from '@/geo/useLocationSupport';
import { ActionBar, Button, ChoiceGroup, colors, font, GUTTER, haptic, Icon, IconButton, icons, ListSection, Slider, SystemBanner, TextInput, type } from '@/ui';

type ConditionChoice = HuntCondition | 'any';

const MARKETPLACE_OPTIONS = [
  { value: 'ebay', label: 'eBay', icon: <MarketplaceMark marketplace="ebay" size={18} /> },
  { value: 'facebook', label: 'Facebook Marketplace', icon: <MarketplaceMark marketplace="facebook" size={18} /> },
] as const;
const conditionOptions = (t: Translator) =>
  [
    { value: 'any', label: t('hunts.formConditionAny') },
    { value: 'new', label: t('hunts.formConditionNew') },
    { value: 'used', label: t('hunts.formConditionUsed') },
    { value: 'refurbished', label: t('hunts.formConditionRefurbished') },
  ] as const;
const targetOptions = (t: Translator) =>
  [
    { value: 'none', label: t('hunts.formTargetNone') },
    { value: 'profit', label: t('hunts.formTargetProfit') },
    { value: 'margin', label: t('hunts.formTargetMargin') },
  ] as const;

/** One question per screen (owner-approved mock-up), then the review. */
type StepId = 'query' | 'price' | 'where' | 'condition' | 'target';
const STEPS: readonly StepId[] = ['query', 'price', 'where', 'condition', 'target'];
const STEP_FIELDS: Record<StepId, readonly HuntFormField[]> = {
  query: ['query'],
  price: ['maxPrice'],
  where: ['marketplaces', 'locationText', 'radius'],
  condition: ['conditions', 'exclusions'],
  target: ['targetKind', 'targetProfit', 'targetMargin'],
};
/** Steps that can be skipped (they have a sensible "no answer"). */
const OPTIONAL: ReadonlySet<StepId> = new Set(['price', 'condition', 'target']);
const REVIEW = STEPS.length;
/** Sentinel chip values (not amounts). */
const NO_LIMIT = 'none';
const CUSTOM = 'custom';

/** First step with an error in it (null = only a form-level error, or none). */
function stepWithError(errors: HuntFormErrors): number | null {
  const i = STEPS.findIndex((s) => STEP_FIELDS[s].some((f) => errors[f]));
  return i === -1 ? null : i;
}

export interface HuntFormFlowProps {
  values: HuntFormValues;
  context: HuntFormContext;
  prefilled: PrefillNote[];
  placeholder: string;
  /** Edit an existing hunt instead: same steps and review, saved with PATCH (same id, history kept). */
  editing?: Hunt;
}

/**
 * Create Hunt -> Review -> Save as draft (App Flow Blueprint section 5), one question per screen.
 * Monitoring is not started here. Shared by the Create modal and Edit Hunt: editing opens on the
 * review (tap a line to change it) when the saved Hunt is valid.
 */
export function HuntFormFlow({ values: initialValues, context, prefilled, placeholder, editing }: HuntFormFlowProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = context;
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<HuntFormErrors>({});
  // Edit mode starts on the review when the saved Hunt builds cleanly.
  const [initial] = useState(() => {
    if (!editing) return null;
    const built = buildUpdateHuntRequest(editing, initialValues, context);
    return built.ok ? built : null;
  });
  const [request, setRequest] = useState<CreateHuntRequest | null>(initial?.review ?? null);
  const [update, setUpdate] = useState<UpdateHuntRequest | null>(initial?.request ?? null);
  const [step, setStep] = useState(initial ? REVIEW : 0);
  /** Reached this step by tapping a review line: Continue goes straight back to the review. */
  const [fromReview, setFromReview] = useState(false);
  const [saving, setSaving] = useState<'list' | 'start' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = <K extends HuntFormField>(field: K, value: HuntFormValues[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));
  };
  const note = (field: HuntFormField) => prefilled.find((p) => p.field === field)?.note;
  const hint = (field: HuntFormField, text?: string) =>
    [note(field) && t('hunts.prefillHint', { note: note(field)! }), text].filter(Boolean).join('. ') || undefined;

  // Location: text + point move together (decision 0017); suggestions / map / area from the API.
  const { geo, area } = useLocationSupport();
  const setLocation = (next: HuntFormValues) => {
    setValues((v) => ({ ...v, locationText: next.locationText, locationPoint: next.locationPoint }));
    setErrors((e) => ({ ...e, locationText: undefined, form: undefined }));
  };
  const mapRadiusKm = radiusKmForMap(values.radius, context.distanceUnit);

  // Max-price slider, synced with the typed field (the field stays the source of truth).
  const slider = useMemo(() => priceSlider(context.currency), [context.currency]);
  const picks = useMemo(() => priceQuickPicks(slider, context.currency, context.localeTag), [slider, context.currency, context.localeTag]);
  // Where the slider stays while the typed text isn't a valid amount yet.
  const [heldPosition, setHeldPosition] = useState(() => priceSliderPosition(slider, initialValues.maxPrice, context.currency) ?? slider.max);
  const sliderPosition = priceSliderPosition(slider, values.maxPrice, context.currency) ?? heldPosition;
  const sliderEnds = priceSliderEnds(slider, context.currency, context.localeTag, t);
  const setMaxPrice = (text: string) => {
    const position = priceSliderPosition(slider, text, context.currency);
    if (position !== null) setHeldPosition(position);
    set('maxPrice', text);
  };

  const build = () => (editing ? buildUpdateHuntRequest(editing, values, context) : buildCreateHuntRequest(values, context));
  const announceError = (errs: HuntFormErrors) => {
    const first = Object.values(errs).find(Boolean);
    if (first) AccessibilityInfo.announceForAccessibility(t('common.inputError', { error: first }));
  };
  /** Back to the question that has a problem (after a failed review or save). */
  const showErrors = (errs: HuntFormErrors) => {
    setErrors(errs);
    const at = stepWithError(errs);
    if (at !== null) {
      setStep(at);
      setFromReview(true);
    }
    announceError(errs);
  };

  const goToReview = () => {
    const result = build();
    if (!result.ok) {
      showErrors(result.errors);
      return;
    }
    if ('review' in result) {
      setRequest(result.review);
      setUpdate(result.request);
    } else {
      setRequest(result.request);
    }
    setSaveError(null);
    setFromReview(false);
    setStep(REVIEW);
  };

  /** Continue: checks only this question (the rest is checked when its turn comes, and on review). */
  const next = () => {
    const id = STEPS[step]!;
    const result = build();
    if (!result.ok) {
      const mine = Object.fromEntries(STEP_FIELDS[id].filter((f) => result.errors[f]).map((f) => [f, result.errors[f]])) as HuntFormErrors;
      if (Object.keys(mine).length > 0) {
        setErrors((e) => ({ ...e, ...mine }));
        announceError(mine);
        return;
      }
    }
    haptic.select();
    if (fromReview || step === REVIEW - 1) goToReview();
    else setStep(step + 1);
  };
  const skip = () => (step === REVIEW - 1 ? goToReview() : setStep(step + 1));
  const openStep = (index: number) => {
    setRequest(null);
    setFromReview(true);
    setStep(index);
  };

  // Back: previous question (or the review it came from); the first screen closes the flow.
  const canGoBack = step === REVIEW ? !editing || !initial : step > 0 || fromReview;
  const back = () => {
    if (saving) return;
    if (step === REVIEW) {
      setRequest(null);
      setStep(REVIEW - 1);
    } else if (fromReview) goToReview();
    else if (step > 0) setStep(step - 1);
  };
  const backRef = useRef({ canGoBack, back });
  useEffect(() => {
    backRef.current = { canGoBack, back };
  });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!backRef.current.canGoBack) return false;
      backRef.current.back();
      return true;
    });
    return () => sub.remove();
  }, []);

  // Say where we are when the question changes ("Step 2 of 5: What's the most you'd pay?").
  const firstRender = useRef(true);
  const question = step === REVIEW ? (editing ? t('hunts.reviewChanges') : t('hunts.reviewHunt')) : stepQuestion(STEPS[step]!, t);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    AccessibilityInfo.announceForAccessibility(step === REVIEW ? question : t('hunts.stepAnnounce', { step: step + 1, total: REVIEW, question }));
  }, [step, question, t]);

  const save = async (nextStep: 'list' | 'start') => {
    if (!request) return;
    setSaving(nextStep);
    setSaveError(null);
    try {
      const hunt = await getApiClient().createHunt(request);
      haptic.success();
      if (nextStep === 'start') {
        // Saved as a draft first, so nothing is lost if the user leaves the plan gate.
        router.replace({ pathname: '/hunts/[id]/start', params: { id: hunt.id } });
      } else {
        router.dismissTo({ pathname: '/hunts', params: { created: hunt.id } });
      }
    } catch (err) {
      const details = err instanceof ApiError ? (err.details ?? []) : [];
      setSaveError(err instanceof Error ? err.message : t('hunts.saveFailed'));
      if (details.length > 0) {
        const mapped = mapHuntErrors(details);
        // A field problem: back to its question. A form-level one stays on the review, in the banner.
        if (stepWithError(mapped) !== null) {
          setRequest(null);
          showErrors(mapped);
        } else setErrors(mapped);
      }
    } finally {
      setSaving(null);
    }
  };

  /** Edit mode: saves the changes and goes back to the hunt (which reloads on focus). */
  const saveChanges = async () => {
    if (!editing || !update) return;
    setSaving('list');
    setSaveError(null);
    try {
      await getApiClient().updateHunt(editing.id, update);
      haptic.success();
      router.back();
    } catch (err) {
      const details = err instanceof ApiError ? (err.details ?? []) : [];
      const blocked = err instanceof ApiError ? err.activationBlock?.reasons.map((r) => r.message).join(' ') : undefined;
      setSaveError(blocked || (err instanceof Error ? err.message : t('hunts.saveChangesFailed')));
      if (details.length > 0) {
        const mapped = mapHuntErrors(details);
        // A field problem: back to its question. A form-level one stays on the review, in the banner.
        if (stepWithError(mapped) !== null) {
          setRequest(null);
          showErrors(mapped);
        } else setErrors(mapped);
      }
    } finally {
      setSaving(null);
    }
  };

  // iOS shows the Create modal as a sheet below the status bar; elsewhere the screen starts at the top edge.
  const topInset = !editing && Platform.OS === 'ios' ? space[2] : insets.top;
  const onReview = step === REVIEW && request;
  const id = STEPS[step];

  const banners = (
    <>
      {errors.form && <SystemBanner tone="error" title={t('hunts.errorCheckForm')} message={errors.form} />}
      {saveError && !errors.form && <SystemBanner tone="error" title={t('hunts.notSaved')} message={saveError} />}
    </>
  );

  let body: ReactNode = null;
  let footer: ReactNode = null;
  let helper: string | undefined;

  if (onReview) {
    const review = huntReview(request, context);
    // Which question each review line comes from (tap = change it).
    const stepFor: Record<string, number> = {
      [t('hunts.reviewHuntingFor')]: STEPS.indexOf('query'),
      [t('hunts.reviewMarketplaces')]: STEPS.indexOf('where'),
      [t('hunts.reviewLocation')]: STEPS.indexOf('where'),
      [t('hunts.reviewCondition')]: STEPS.indexOf('condition'),
      [t('hunts.reviewMaxPrice')]: STEPS.indexOf('price'),
      [t('hunts.reviewTarget')]: STEPS.indexOf('target'),
      [t('hunts.reviewIgnoring')]: STEPS.indexOf('condition'),
    };
    helper = t('hunts.reviewHelp');
    body = (
      <>
        <Text style={[styles.sentence, font('regular')]}>{review.sentence}</Text>
        <ListSection title={t('hunts.details')} footer={editing ? t('hunts.editDescription') : undefined}>
          {review.items.map((item, i) => (
            <ReviewRow
              key={item.label}
              label={item.label}
              value={item.value}
              a11y={t('hunts.labelValue', { label: item.label, value: item.value })}
              hint={t('hunts.reviewRowHint')}
              onPress={saving ? undefined : () => openStep(stepFor[item.label] ?? 0)}
              last={i === review.items.length - 1}
            />
          ))}
        </ListSection>
        {review.warnings.map((w) => (
          <SystemBanner key={w} tone="warning" title={editing?.status === 'LIVE' ? t('hunts.cantKeepWatching') : t('hunts.beforeStart')} message={w} />
        ))}
        {!editing && <Text style={[styles.note, font('regular')]}>{t('hunts.startNote')}</Text>}
      </>
    );
    footer = editing ? (
      <ActionBar>
        <Button size="large" onPress={saveChanges} loading={saving !== null} fullWidth>
          {t('hunts.saveChanges')}
        </Button>
      </ActionBar>
    ) : (
      <ActionBar stacked>
        <Button size="large" onPress={() => save('start')} loading={saving === 'start'} disabled={saving !== null} fullWidth>
          {t('hunts.actionStart')}
        </Button>
        <Button size="large" variant="secondary" onPress={() => save('list')} loading={saving === 'list'} disabled={saving !== null} fullWidth>
          {t('hunts.saveDraft')}
        </Button>
      </ActionBar>
    );
  } else if (id) {
    footer = (
      <ActionBar stacked>
        <Button size="large" onPress={next} fullWidth>
          {fromReview ? t('hunts.backToReview') : t('hunts.continue')}
        </Button>
        {OPTIONAL.has(id) && !fromReview && (
          <Button variant="text" onPress={skip}>
            {t('hunts.skip')}
          </Button>
        )}
      </ActionBar>
    );
    if (id === 'query') {
      helper = t('hunts.formQueryHint');
      body = (
        <BigInput
          label={t('hunts.formQuery')}
          placeholder={placeholder}
          value={values.query}
          onChangeText={(text) => set('query', text)}
          error={errors.query}
          autoFocus={!editing}
          returnKeyType="next"
          onSubmitEditing={next}
          t={t}
        />
      );
    } else if (id === 'price') {
      const query = values.query.trim();
      helper = [query ? t('hunts.stepPriceHelp', { query }) : t('hunts.stepPriceHelpPlain'), note('maxPrice') && t('hunts.prefillHint', { note: note('maxPrice')! })].filter(Boolean).join(' ');
      const typed = values.maxPrice.trim();
      const chip = typed === '' ? NO_LIMIT : (picks.find((p) => Number(p.text) === Number(typed))?.text ?? CUSTOM);
      body = (
        <>
          <BigInput
            label={t('hunts.reviewMaxPrice')}
            hint={t('hunts.formMaxPriceHint')}
            prefix={currencySymbol(context.currency, context.localeTag)}
            placeholder="0"
            keyboardType="decimal-pad"
            value={values.maxPrice}
            onChangeText={setMaxPrice}
            error={errors.maxPrice}
            money
            t={t}
          />
          <Slider
            label={t('hunts.formAdjustMaxPrice')}
            value={sliderPosition}
            max={slider.max}
            onChange={(position) => setMaxPrice(priceSliderText(slider, position))}
            valueText={priceSliderValueText(slider, values.maxPrice, sliderPosition, context.currency, context.localeTag, t)}
            minLabel={sliderEnds.min}
            maxLabel={sliderEnds.max}
          />
          <ChoiceGroup
            legend={t('hunts.priceChipsLabel')}
            hideLegend
            options={[...picks.map((p) => ({ value: p.text, label: p.label })), { value: NO_LIMIT, label: t('common.noLimit') }]}
            value={chip}
            onChange={(v) => setMaxPrice(v === NO_LIMIT ? '' : v)}
          />
        </>
      );
    } else if (id === 'where') {
      helper = [t('hunts.stepWhereHelp'), note('marketplaces') && t('hunts.prefillHint', { note: note('marketplaces')! })].filter(Boolean).join(' ');
      const radiusChoice = radiusQuickPicks(context.distanceUnit).map(String).includes(values.radius.trim()) ? values.radius.trim() : CUSTOM;
      body = (
        <>
          <ChoiceGroup
            legend={t('hunts.formWhere')}
            hideLegend
            multiple
            options={MARKETPLACE_OPTIONS}
            value={values.marketplaces}
            onChange={(v) => set('marketplaces', v)}
            error={errors.marketplaces}
          />
          {needsLocation(values) && (
            <>
              <LocationField
                label={t('hunts.reviewLocation')}
                hint={t('hunts.formLocationHint')}
                placeholder={geo.suggestions ? t('hunts.formLocationSuggest') : t('hunts.formLocationPlain')}
                value={values.locationText}
                onType={(text) => setLocation(typeLocation(values, text))}
                onPick={(place) => setLocation(pickPlace(values, place))}
                error={errors.locationText}
                suggestions={geo.suggestions}
                area={area}
                onUseArea={(a) => setLocation(applyArea(values, a))}
              />
              <TextInput
                label={t('hunts.formRadius', { unit: context.distanceUnit })}
                keyboardType="number-pad"
                placeholder={context.distanceUnit === 'mi' ? '25' : '40'}
                value={values.radius}
                onChangeText={(text) => set('radius', text)}
                error={errors.radius}
              />
              <ChoiceGroup
                legend={t('hunts.radiusChipsLabel')}
                hideLegend
                options={radiusQuickPicks(context.distanceUnit).map((r) => ({ value: String(r), label: t('hunts.radiusChip', { radius: r, unit: context.distanceUnit }) }))}
                value={radiusChoice}
                onChange={(v) => set('radius', v)}
              />
              {geo.provider !== 'none' && values.locationPoint && (
                <LocationMap
                  point={values.locationPoint}
                  radiusKm={mapRadiusKm}
                  onMovePin={(point) => setLocation(movePin(values, point))}
                  caption={mapCaption(values.locationText, mapRadiusKm, values.radius, context.distanceUnit, t)}
                />
              )}
              {!area && geo.suggestions && <Text style={[styles.note, font('regular')]}>{t('location.tipSaveArea')}</Text>}
            </>
          )}
        </>
      );
    } else if (id === 'condition') {
      helper = t('hunts.stepConditionHelp');
      const conditionChoices: ConditionChoice[] = values.conditions.length ? values.conditions : ['any'];
      const onConditions = (nextChoices: ConditionChoice[]) => {
        const added = nextChoices.find((c) => !conditionChoices.includes(c));
        set('conditions', added === 'any' ? [] : (nextChoices.filter((c) => c !== 'any') as HuntCondition[]));
      };
      body = (
        <>
          <ChoiceGroup
            legend={t('hunts.reviewCondition')}
            hideLegend
            multiple
            options={conditionOptions(t)}
            value={conditionChoices}
            onChange={onConditions}
            error={errors.conditions}
          />
          <TextInput
            label={t('hunts.formIgnore')}
            hint={t('hunts.formIgnoreHint')}
            value={values.exclusions}
            onChangeText={(text) => set('exclusions', text)}
            error={errors.exclusions}
          />
        </>
      );
    } else {
      helper = t('hunts.stepTargetHelp');
      body = (
        <>
          <ChoiceGroup legend={t('hunts.formTarget')} hideLegend options={targetOptions(t)} value={values.targetKind} onChange={(v) => set('targetKind', v)} />
          {values.targetKind === 'profit' && (
            <TextInput
              label={t('hunts.formMinProfit')}
              kind="money"
              currency={context.currency}
              value={values.targetProfit}
              onChangeText={(text) => set('targetProfit', text)}
              hint={hint('targetProfit')}
              error={errors.targetProfit}
            />
          )}
          {values.targetKind === 'margin' && (
            <TextInput
              label={t('hunts.formMinMargin')}
              keyboardType="number-pad"
              value={values.targetMargin}
              onChangeText={(text) => set('targetMargin', text)}
              hint={hint('targetMargin')}
              error={errors.targetMargin}
            />
          )}
        </>
      );
    }
  }

  const progressNow = Math.min(step + 1, REVIEW);
  return (
    <View style={[styles.fill, { backgroundColor: onReview ? colors.grouped : colors.background }]}>
      <View style={[styles.topBar, { paddingTop: topInset }]}>
        <View style={styles.side}>{canGoBack && <IconButton icon={icons.back} label={t('hunts.back')} onPress={back} disabled={saving !== null} />}</View>
        <Text accessibilityRole="header" style={[styles.topTitle, font('semibold')]} numberOfLines={1}>
          {editing ? t('hunts.editTitle') : t('hunts.newHuntTitle')}
        </Text>
        <View style={[styles.side, styles.sideRight]}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} disabled={saving !== null} hitSlop={8} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Text style={[styles.closeText, font('medium')]}>{t('hunts.close')}</Text>
          </Pressable>
        </View>
      </View>
      <View
        style={styles.progress}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={onReview ? question : t('hunts.stepProgress', { step: progressNow, total: REVIEW })}
        accessibilityValue={{ min: 1, max: REVIEW, now: progressNow }}
      >
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.segment, (onReview || i <= step) && styles.segmentOn]} />
        ))}
      </View>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <View style={styles.intro}>
            {!onReview && (
              <Text style={[styles.stepLabel, font('semibold')]} importantForAccessibility="no" accessibilityElementsHidden>
                {t('hunts.stepProgress', { step: progressNow, total: REVIEW })}
              </Text>
            )}
            <Text accessibilityRole="header" style={[styles.question, font('bold')]}>
              {question}
            </Text>
            {helper ? <Text style={[styles.helper, font('regular')]}>{helper}</Text> : null}
          </View>
          {banners}
          {body}
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>
    </View>
  );
}

function stepQuestion(id: StepId, t: Translator): string {
  switch (id) {
    case 'query':
      return t('hunts.formQuery');
    case 'price':
      return t('hunts.stepPriceTitle');
    case 'where':
      return t('hunts.formWhere');
    case 'condition':
      return t('hunts.stepConditionTitle');
    case 'target':
      return t('hunts.stepTargetTitle');
  }
}

/** "$" / "R" / "€" for the big price field; the ISO code when the platform can't tell. */
function currencySymbol(currency: string, localeTag: string): string {
  try {
    const part = new Intl.NumberFormat(localeTag, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** The step's main answer: a large field (mock-up), labelled for screen readers by the question. */
function BigInput({
  label,
  hint,
  prefix,
  placeholder,
  value,
  onChangeText,
  error,
  keyboardType,
  autoFocus,
  returnKeyType,
  onSubmitEditing,
  money = false,
  t,
}: {
  label: string;
  hint?: string;
  prefix?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
  money?: boolean;
  t: Translator;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.bigWrap}>
      <View style={[styles.big, focused && styles.bigFocused, !!error && styles.bigInvalid]}>
        {prefix ? (
          <Text style={[money ? styles.bigPrefix : styles.bigPrefixSmall, font('bold')]} importantForAccessibility="no" accessibilityElementsHidden>
            {prefix}
          </Text>
        ) : null}
        <RNTextInput
          accessibilityLabel={label}
          accessibilityHint={[error && t('common.inputError', { error }), hint].filter(Boolean).join('. ') || undefined}
          aria-invalid={!!error}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textDisabled}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          submitBehavior={onSubmitEditing ? 'submit' : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[money ? styles.bigMoney : styles.bigText, font(money ? 'bold' : 'semibold')]}
        />
      </View>
      {error && (
        <Text accessibilityLiveRegion="polite" style={[styles.error, font('regular')]}>
          {error}
        </Text>
      )}
    </View>
  );
}

/** A review line: what it is above, the answer below; tap to change that question. */
function ReviewRow({ label, value, a11y, hint, onPress, last }: { label: string; value: string; a11y: string; hint: string; onPress?: () => void; last: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.reviewRow, pressed && styles.pressed]}
    >
      <View style={[styles.reviewMain, !last && styles.separator]}>
        <View style={styles.reviewText}>
          <Text style={[styles.reviewLabel, font('regular')]}>{label}</Text>
          <Text style={[styles.reviewValue, font('medium')]}>{value}</Text>
        </View>
        <Icon name={icons.chevron} color={colors.textMuted} size={14} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: space[2], backgroundColor: colors.background },
  side: { width: 88, flexDirection: 'row' },
  sideRight: { justifyContent: 'flex-end' },
  topTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: type.body },
  close: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: space[2] },
  closeText: { color: colors.textMuted, fontSize: type.body },
  pressed: { opacity: 0.6 },
  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: GUTTER, paddingBottom: space[1], backgroundColor: colors.background },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  segmentOn: { backgroundColor: colors.action },
  content: { paddingHorizontal: GUTTER, paddingTop: space[6], paddingBottom: space[8], gap: space[5] },
  intro: { gap: 6 },
  stepLabel: { color: colors.textMuted, fontSize: type.subhead, textTransform: 'uppercase', letterSpacing: 0.3 },
  question: { color: colors.text, fontSize: type.question, lineHeight: 32, letterSpacing: -0.3 },
  helper: { color: colors.textMuted, fontSize: type.body, lineHeight: 21 },
  bigWrap: { gap: 6 },
  big: { flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[4], minHeight: 64, borderWidth: 2, borderColor: colors.border, borderRadius: 12 },
  bigFocused: { borderColor: colors.text },
  bigInvalid: { borderColor: colors.destructive },
  bigPrefix: { color: colors.textMuted, fontSize: 30 },
  bigPrefixSmall: { color: colors.textMuted, fontSize: type.title },
  bigMoney: { flex: 1, minHeight: 64, color: colors.text, fontSize: 36 },
  bigText: { flex: 1, minHeight: 60, color: colors.text, fontSize: type.title },
  error: { color: colors.text, fontSize: type.subhead, paddingLeft: space[2], borderLeftWidth: 3, borderLeftColor: colors.destructive },
  sentence: { color: colors.text, fontSize: type.headline, lineHeight: 23, padding: 14, borderRadius: radius.md, backgroundColor: colors.background },
  note: { color: colors.textMuted, fontSize: type.subhead, lineHeight: 18 },
  reviewRow: { paddingLeft: 14, backgroundColor: colors.background },
  reviewMain: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 56, paddingVertical: 10, paddingRight: 14 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  reviewText: { flex: 1, gap: 2 },
  reviewLabel: { color: colors.textMuted, fontSize: type.subhead },
  reviewValue: { color: colors.text, fontSize: type.body },
});
