import { useMemo, useState } from 'react';
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
import { getApiClient } from '@/config/api';
import { LocationField } from '@/geo/LocationField';
import { LocationMap } from '@/geo/LocationMap';
import { useLocationSupport } from '@/geo/useLocationSupport';
import { Button, Card, ChoiceGroup, Disclosure, font, Screen, Slider, SystemBanner, TextInput } from '@/ui';

type ConditionChoice = HuntCondition | 'any';

const MARKETPLACE_OPTIONS = [
  { value: 'ebay', label: 'eBay' },
  { value: 'facebook', label: 'Facebook Marketplace' },
] as const;
const CONDITION_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'new', label: 'New' },
  { value: 'used', label: 'Used' },
  { value: 'refurbished', label: 'Refurbished' },
] as const;
const TARGET_OPTIONS = [
  { value: 'none', label: 'No target' },
  { value: 'profit', label: 'Minimum profit' },
  { value: 'margin', label: 'Minimum margin' },
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
    [note(field) && `${note(field)} - change it anytime`, text].filter(Boolean).join('. ') || undefined;

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
  const sliderEnds = priceSliderEnds(slider, context.currency, context.localeTag);
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
      setSaveError(err instanceof Error ? err.message : "We couldn't save your hunt. Please try again.");
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
      setSaveError(blocked || (err instanceof Error ? err.message : "We couldn't save your changes. Please try again."));
    } finally {
      setSaving(null);
    }
  };

  if (request && editing) {
    const review = huntReview(request, context);
    return (
      <Screen description="This updates the same Hunt - its deals and history stay.">
        <Stack.Screen options={{ title: 'Review changes' }} />
        <Card>
          <Text style={[styles.sentence, font('regular')]}>{review.sentence}</Text>
        </Card>
        <Card title="Details">
          {review.items.map((item) => (
            <View key={item.label} style={styles.reviewRow} accessible accessibilityLabel={`${item.label}: ${item.value}`}>
              <Text style={[styles.reviewLabel, font('regular')]}>{item.label}</Text>
              <Text style={[styles.reviewValue, font('semibold')]}>{item.value}</Text>
            </View>
          ))}
        </Card>
        {review.warnings.map((w) => (
          <SystemBanner key={w} tone="warning" title={editing.status === 'LIVE' ? "This Hunt can't keep watching like this" : 'Before this Hunt can start watching'} message={w} />
        ))}
        {saveError && <SystemBanner tone="error" title="Not saved" message={saveError} />}
        <Button onPress={saveChanges} loading={saving !== null} fullWidth>
          Save changes
        </Button>
        <Button variant="secondary" onPress={() => setRequest(null)} disabled={saving !== null} fullWidth>
          Back to editing
        </Button>
      </Screen>
    );
  }

  if (request) {
    const review = huntReview(request, context);
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Review Hunt' }} />
        <Card>
          <Text style={[styles.sentence, font('regular')]}>{review.sentence}</Text>
        </Card>
        <Card title="Details">
          {review.items.map((item) => (
            <View key={item.label} style={styles.reviewRow} accessible accessibilityLabel={`${item.label}: ${item.value}`}>
              <Text style={[styles.reviewLabel, font('regular')]}>{item.label}</Text>
              <Text style={[styles.reviewValue, font('semibold')]}>{item.value}</Text>
            </View>
          ))}
        </Card>
        {review.warnings.map((w) => (
          <SystemBanner key={w} tone="warning" title="Before this Hunt can start watching" message={w} />
        ))}
        {saveError && <SystemBanner tone="error" title="Not saved" message={saveError} />}
        <View style={styles.startWatching}>
          <Button onPress={() => save('start')} loading={saving === 'start'} disabled={saving !== null} fullWidth>
            Start watching
          </Button>
          <Text style={[styles.muted, font('regular')]}>Saves your Hunt, then starts watching within your current access.</Text>
        </View>
        <Button
          variant="secondary"
          onPress={() => save('list')}
          loading={saving === 'list'}
          disabled={saving !== null}
          fullWidth
        >
          Save as draft
        </Button>
        <Button variant="secondary" onPress={() => setRequest(null)} disabled={saving !== null} fullWidth>
          Edit
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
    <Screen description={editing ? 'Changes apply from the next check. Deals found so far stay.' : 'Tell Rein Drop what to watch for.'}>
      <Stack.Screen options={{ title: editing ? 'Edit Hunt' : 'Create Hunt' }} />
      {errors.form && <SystemBanner tone="error" title="Please check the form" message={errors.form} />}
      {saveError && !errors.form && <SystemBanner tone="error" title="Not saved" message={saveError} />}

      <TextInput
        label="What are you hunting for?"
        hint="A product, model or a short description"
        placeholder={placeholder}
        value={values.query}
        onChangeText={(t) => set('query', t)}
        error={errors.query}
        autoFocus
      />

      <ChoiceGroup
        legend="Where should Rein Drop look?"
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
            label="Location"
            hint="Facebook Marketplace is local pickup - needed before this Hunt can start watching"
            placeholder={geo.suggestions ? 'Start typing a suburb, town or postal code' : 'City, area or postal code'}
            value={values.locationText}
            onType={(text) => setLocation(typeLocation(values, text))}
            onPick={(place) => setLocation(pickPlace(values, place))}
            error={errors.locationText}
            suggestions={geo.suggestions}
            area={area}
            onUseArea={(a) => setLocation(applyArea(values, a))}
          />
          <TextInput
            label={`Radius (${context.distanceUnit})`}
            keyboardType="number-pad"
            placeholder={context.distanceUnit === 'mi' ? '25' : '40'}
            value={values.radius}
            onChangeText={(t) => set('radius', t)}
            error={errors.radius}
          />
          {geo.provider !== 'none' && values.locationPoint && (
            <LocationMap
              point={values.locationPoint}
              radiusKm={mapRadiusKm}
              onMovePin={(point) => setLocation(movePin(values, point))}
              caption={mapCaption(values.locationText, mapRadiusKm, values.radius, context.distanceUnit)}
            />
          )}
          {!area && geo.suggestions && (
            <Text style={[styles.tip, font('regular')]}>Tip: save your area in Settings to fill this in with one tap next time.</Text>
          )}
        </>
      )}

      <ChoiceGroup
        legend="Condition"
        multiple
        options={CONDITION_OPTIONS}
        value={conditionChoices}
        onChange={onConditions}
        error={errors.conditions}
      />

      <View style={styles.price}>
        <TextInput
          label="Max price"
          kind="money"
          currency={context.currency}
          placeholder="0.00"
          value={values.maxPrice}
          onChangeText={setMaxPrice}
          hint={hint('maxPrice', "The most you'd pay. Type an amount or use the slider; leave empty for no limit")}
          error={errors.maxPrice}
        />
        <Slider
          label="Adjust max price"
          value={sliderPosition}
          max={slider.max}
          onChange={(position) => setMaxPrice(priceSliderText(slider, position))}
          valueText={priceSliderValueText(slider, values.maxPrice, sliderPosition, context.currency, context.localeTag)}
          minLabel={sliderEnds.min}
          maxLabel={sliderEnds.max}
        />
      </View>

      <ChoiceGroup
        legend="Target (optional)"
        options={TARGET_OPTIONS}
        value={values.targetKind}
        onChange={(v) => set('targetKind', v)}
      />
      {values.targetKind === 'profit' && (
        <TextInput
          label="Minimum profit per deal"
          kind="money"
          currency={context.currency}
          value={values.targetProfit}
          onChangeText={(t) => set('targetProfit', t)}
          hint={hint('targetProfit')}
          error={errors.targetProfit}
        />
      )}
      {values.targetKind === 'margin' && (
        <TextInput
          label="Minimum margin (%)"
          keyboardType="number-pad"
          value={values.targetMargin}
          onChangeText={(t) => set('targetMargin', t)}
          hint={hint('targetMargin')}
          error={errors.targetMargin}
        />
      )}

      <Disclosure summary="More filters" defaultOpen={Boolean(values.exclusions || errors.exclusions)}>
        <TextInput
          label="Words to ignore"
          hint="Separate with commas, e.g. broken, for parts, box only"
          value={values.exclusions}
          onChangeText={(t) => set('exclusions', t)}
          error={errors.exclusions}
        />
      </Disclosure>

      <Button onPress={goToReview} fullWidth>
        {editing ? 'Review changes' : 'Review Hunt'}
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
