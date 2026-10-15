import { useMemo, useState } from 'react';
import type { Translator } from '@rein-drop/i18n';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
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
  priceSlider,
  priceSliderEnds,
  priceSliderPosition,
  priceSliderText,
  priceSliderValueText,
  radiusKmForMap,
  typeLocation,
  type HuntFormContext,
  type HuntFormErrors,
  type HuntFormField,
  type HuntFormValues,
  type PrefillNote,
} from '@rein-drop/client-core';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
import { MarketplaceMark } from '@/brand/MarketplaceMark';
import { getApiClient } from '@/config/api';
import { LocationField } from '@/geo/LocationField';
import { LocationMap } from '@/geo/LocationMap';
import { useLocationSupport } from '@/geo/useLocationSupport';
import { Button, Card, ChoiceGroup, Disclosure, font, Screen, Slider, SystemBanner, TextInput } from '@/ui';

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

export interface HuntFormFlowProps {
  values: HuntFormValues;
  context: HuntFormContext;
  prefilled: PrefillNote[];
  placeholder: string;
  /** Edit an existing hunt instead: same form and review, saved with PATCH (same id, history kept). */
  editing?: Hunt;
}

/**
 * Create Hunt -> Review -> Save as draft (App Flow Blueprint section 5). Monitoring is not started
 * here. Shared by the Create modal and Edit Hunt (edit mode added below).
 */
export function HuntFormFlow({ values: initialValues, context, prefilled, placeholder, editing }: HuntFormFlowProps) {
  const router = useRouter();
  const { t } = context;
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<HuntFormErrors>({});
  const [request, setRequest] = useState<CreateHuntRequest | null>(null);
  const [update, setUpdate] = useState<UpdateHuntRequest | null>(null);
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
  // Where the slider stays while the typed text isn't a valid amount yet.
  const [heldPosition, setHeldPosition] = useState(() => priceSliderPosition(slider, initialValues.maxPrice, context.currency) ?? slider.max);
  const sliderPosition = priceSliderPosition(slider, values.maxPrice, context.currency) ?? heldPosition;
  const sliderEnds = priceSliderEnds(slider, context.currency, context.localeTag, t);
  const setMaxPrice = (text: string) => {
    const position = priceSliderPosition(slider, text, context.currency);
    if (position !== null) setHeldPosition(position);
    set('maxPrice', text);
  };

  const goToReview = () => {
    const result = editing ? buildUpdateHuntRequest(editing, values, context) : buildCreateHuntRequest(values, context);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if ('review' in result) {
      setRequest(result.review);
      setUpdate(result.request);
    } else {
      setRequest(result.request);
    }
    setSaveError(null);
  };

  const save = async (next: 'list' | 'start') => {
    if (!request) return;
    setSaving(next);
    setSaveError(null);
    try {
      const hunt = await getApiClient().createHunt(request);
      if (next === 'start') {
        // Saved as a draft first, so nothing is lost if the user leaves the plan gate.
        router.replace({ pathname: '/hunts/[id]/start', params: { id: hunt.id } });
      } else {
        router.dismissTo({ pathname: '/hunts', params: { created: hunt.id } });
      }
    } catch (err) {
      const details = err instanceof ApiError ? (err.details ?? []) : [];
      if (details.length > 0) {
        setErrors(mapHuntErrors(details));
        setRequest(null);
      }
      setSaveError(err instanceof Error ? err.message : t('hunts.saveFailed'));
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
      router.back();
    } catch (err) {
      const details = err instanceof ApiError ? (err.details ?? []) : [];
      if (details.length > 0) {
        setErrors(mapHuntErrors(details));
        setRequest(null);
      }
      const blocked = err instanceof ApiError ? err.activationBlock?.reasons.map((r) => r.message).join(' ') : undefined;
      setSaveError(blocked || (err instanceof Error ? err.message : t('hunts.saveChangesFailed')));
    } finally {
      setSaving(null);
    }
  };

  if (request && editing) {
    const review = huntReview(request, context);
    return (
      <Screen description={t('hunts.reviewChangesDescription')}>
        <Stack.Screen options={{ title: t('hunts.reviewChanges') }} />
        <Card>
          <Text style={[styles.sentence, font('regular')]}>{review.sentence}</Text>
        </Card>
        <Card title={t('hunts.details')}>
          {review.items.map((item) => (
            <View key={item.label} style={styles.reviewRow} accessible accessibilityLabel={t('hunts.labelValue', { label: item.label, value: item.value })}>
              <Text style={[styles.reviewLabel, font('regular')]}>{item.label}</Text>
              <Text style={[styles.reviewValue, font('semibold')]}>{item.value}</Text>
            </View>
          ))}
        </Card>
        {review.warnings.map((w) => (
          <SystemBanner key={w} tone="warning" title={editing.status === 'LIVE' ? t('hunts.cantKeepWatching') : t('hunts.beforeStart')} message={w} />
        ))}
        {saveError && <SystemBanner tone="error" title={t('hunts.notSaved')} message={saveError} />}
        <Button onPress={saveChanges} loading={saving !== null} fullWidth>
          {t('hunts.saveChanges')}
        </Button>
        <Button variant="secondary" onPress={() => setRequest(null)} disabled={saving !== null} fullWidth>
          {t('hunts.backToEditing')}
        </Button>
      </Screen>
    );
  }

  if (request) {
    const review = huntReview(request, context);
    return (
      <Screen>
        <Stack.Screen options={{ title: t('hunts.reviewHunt') }} />
        <Card>
          <Text style={[styles.sentence, font('regular')]}>{review.sentence}</Text>
        </Card>
        <Card title={t('hunts.details')}>
          {review.items.map((item) => (
            <View key={item.label} style={styles.reviewRow} accessible accessibilityLabel={t('hunts.labelValue', { label: item.label, value: item.value })}>
              <Text style={[styles.reviewLabel, font('regular')]}>{item.label}</Text>
              <Text style={[styles.reviewValue, font('semibold')]}>{item.value}</Text>
            </View>
          ))}
        </Card>
        {review.warnings.map((w) => (
          <SystemBanner key={w} tone="warning" title={t('hunts.beforeStart')} message={w} />
        ))}
        {saveError && <SystemBanner tone="error" title={t('hunts.notSaved')} message={saveError} />}
        <View style={styles.startWatching}>
          <Button onPress={() => save('start')} loading={saving === 'start'} disabled={saving !== null} fullWidth>
            {t('hunts.actionStart')}
          </Button>
          <Text style={[styles.muted, font('regular')]}>{t('hunts.startNote')}</Text>
        </View>
        <Button
          variant="secondary"
          onPress={() => save('list')}
          loading={saving === 'list'}
          disabled={saving !== null}
          fullWidth
        >
          {t('hunts.saveDraft')}
        </Button>
        <Button variant="secondary" onPress={() => setRequest(null)} disabled={saving !== null} fullWidth>
          {t('hunts.actionEdit')}
        </Button>
      </Screen>
    );
  }

  const conditionChoices: ConditionChoice[] = values.conditions.length ? values.conditions : ['any'];
  const onConditions = (next: ConditionChoice[]) => {
    const added = next.find((c) => !conditionChoices.includes(c));
    set('conditions', added === 'any' ? [] : (next.filter((c) => c !== 'any') as HuntCondition[]));
  };

  return (
    <Screen description={editing ? t('hunts.editDescription') : t('hunts.createDescription')}>
      <Stack.Screen options={{ title: editing ? t('hunts.editTitle') : t('hunts.create') }} />
      {errors.form && <SystemBanner tone="error" title={t('hunts.errorCheckForm')} message={errors.form} />}
      {saveError && !errors.form && <SystemBanner tone="error" title={t('hunts.notSaved')} message={saveError} />}

      <TextInput
        label={t('hunts.formQuery')}
        hint={t('hunts.formQueryHint')}
        placeholder={placeholder}
        value={values.query}
        onChangeText={(text) => set('query', text)}
        error={errors.query}
        autoFocus
      />

      <ChoiceGroup
        legend={t('hunts.formWhere')}
        multiple
        options={MARKETPLACE_OPTIONS}
        value={values.marketplaces}
        onChange={(v) => set('marketplaces', v)}
        hint={hint('marketplaces')}
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
          {geo.provider !== 'none' && values.locationPoint && (
            <LocationMap
              point={values.locationPoint}
              radiusKm={mapRadiusKm}
              onMovePin={(point) => setLocation(movePin(values, point))}
              caption={mapCaption(values.locationText, mapRadiusKm, values.radius, context.distanceUnit, t)}
            />
          )}
          {!area && geo.suggestions && (
            <Text style={[styles.tip, font('regular')]}>{t('location.tipSaveArea')}</Text>
          )}
        </>
      )}

      <ChoiceGroup
        legend={t('hunts.reviewCondition')}
        multiple
        options={conditionOptions(t)}
        value={conditionChoices}
        onChange={onConditions}
        error={errors.conditions}
      />

      <View style={styles.price}>
        <TextInput
          label={t('hunts.reviewMaxPrice')}
          kind="money"
          currency={context.currency}
          placeholder="0.00"
          value={values.maxPrice}
          onChangeText={setMaxPrice}
          hint={hint('maxPrice', t('hunts.formMaxPriceHint'))}
          error={errors.maxPrice}
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
      </View>

      <ChoiceGroup
        legend={t('hunts.formTarget')}
        options={targetOptions(t)}
        value={values.targetKind}
        onChange={(v) => set('targetKind', v)}
      />
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

      <Disclosure summary={t('hunts.formMoreFilters')} defaultOpen={Boolean(values.exclusions || errors.exclusions)}>
        <TextInput
          label={t('hunts.formIgnore')}
          hint={t('hunts.formIgnoreHint')}
          value={values.exclusions}
          onChangeText={(text) => set('exclusions', text)}
          error={errors.exclusions}
        />
      </Disclosure>

      <Button onPress={goToReview} fullWidth>
        {editing ? t('hunts.reviewChanges') : t('hunts.reviewHunt')}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  price: { gap: space[1], alignSelf: 'stretch' },
  tip: { color: roles.textMuted, fontSize: fontSize.sm },
  sentence: { color: roles.text, fontSize: fontSize.lg, lineHeight: 26 },
  reviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space[2],
    paddingVertical: space[3],
    borderBottomWidth: 1,
    borderBottomColor: roles.border,
  },
  reviewLabel: { color: roles.textMuted, fontSize: fontSize.sm },
  reviewValue: { color: roles.text, fontSize: fontSize.md, flexShrink: 1, textAlign: 'right' },
  startWatching: { gap: space[2], paddingTop: space[2], borderTopWidth: 1, borderTopColor: roles.border },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
});
