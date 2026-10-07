import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError, type CreateHuntRequest, type HuntCondition } from '@rein-drop/api-client';
import {
  buildCreateHuntRequest,
  huntFormDefaults,
  huntReview,
  mapHuntErrors,
  needsLocation,
  queryPlaceholder,
  type HuntFormContext,
  type HuntFormErrors,
  type HuntFormField,
  type HuntFormValues,
  type PrefillNote,
} from '@rein-drop/client-core';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { useSession } from '@/auth/SessionProvider';
import { getApiClient } from '@/config/api';
import { Button, Card, ChoiceGroup, Disclosure, font, LoadingState, Screen, SystemBanner, TextInput } from '@/ui';

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

interface Prepared {
  values: HuntFormValues;
  context: HuntFormContext;
  prefilled: PrefillNote[];
  placeholder: string;
}

/**
 * Create Hunt -> Review -> Save as draft (App Flow Blueprint section 5), presented as a
 * native modal from the central Create tab. Monitoring is not started here.
 */
export default function CreateHuntScreen() {
  return (
    <SessionGate>
      <CreateHuntLoader />
    </SessionGate>
  );
}

/** Loads the Seller Snapshot so the form starts with sensible, visible defaults. */
function CreateHuntLoader() {
  const session = useSession();
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The snapshot only provides defaults - the form still works without it.
    Promise.resolve()
      .then(() => getApiClient().getSellerSnapshot())
      .catch(() => null)
      .then((snapshot) => {
        if (cancelled) return;
        const defaults = huntFormDefaults(snapshot, session.user.locale);
        setPrepared({ ...defaults, placeholder: queryPlaceholder(snapshot) });
      });
    return () => {
      cancelled = true;
    };
  }, [session.user.locale]);

  if (!prepared) {
    return (
      <View style={styles.center}>
        <LoadingState label="Preparing your Hunt…" />
      </View>
    );
  }
  return <CreateHuntFlow {...prepared} />;
}

function CreateHuntFlow({ values: initialValues, context, prefilled, placeholder }: Prepared) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<HuntFormErrors>({});
  const [request, setRequest] = useState<CreateHuntRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = <K extends HuntFormField>(field: K, value: HuntFormValues[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));
  };
  const note = (field: HuntFormField) => prefilled.find((p) => p.field === field)?.note;
  const hint = (field: HuntFormField, text?: string) =>
    [note(field) && `${note(field)} - change it anytime`, text].filter(Boolean).join('. ') || undefined;

  const goToReview = () => {
    const result = buildCreateHuntRequest(values, context);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setRequest(result.request);
    setSaveError(null);
  };

  const save = async () => {
    if (!request) return;
    setSaving(true);
    setSaveError(null);
    try {
      const hunt = await getApiClient().createHunt(request);
      router.dismissTo({ pathname: '/hunts', params: { created: hunt.id } });
    } catch (err) {
      const details = err instanceof ApiError ? (err.details ?? []) : [];
      if (details.length > 0) {
        setErrors(mapHuntErrors(details));
        setRequest(null);
      }
      setSaveError(err instanceof Error ? err.message : "We couldn't save your hunt. Please try again.");
    } finally {
      setSaving(false);
    }
  };

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
        <Button onPress={save} loading={saving} fullWidth>
          Save as draft
        </Button>
        <Button variant="secondary" onPress={() => setRequest(null)} disabled={saving} fullWidth>
          Edit
        </Button>
        <View style={styles.startWatching}>
          <Button variant="secondary" disabled fullWidth>
            Start watching
          </Button>
          <Text style={[styles.muted, font('regular')]}>
            Monitoring starts after you choose a plan - coming soon. Your Hunt is saved as a draft.
          </Text>
        </View>
      </Screen>
    );
  }

  const conditionChoices: ConditionChoice[] = values.conditions.length ? values.conditions : ['any'];
  const onConditions = (next: ConditionChoice[]) => {
    const added = next.find((c) => !conditionChoices.includes(c));
    set('conditions', added === 'any' ? [] : (next.filter((c) => c !== 'any') as HuntCondition[]));
  };

  return (
    <Screen description="Tell Rein Drop what to watch for.">
      <Stack.Screen options={{ title: 'Create Hunt' }} />
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
          <TextInput
            label="Location"
            hint="Facebook Marketplace is local pickup - needed before this Hunt can start watching"
            placeholder="City, area or postal code"
            value={values.locationText}
            onChangeText={(t) => set('locationText', t)}
            error={errors.locationText}
          />
          <TextInput
            label={`Radius (${context.distanceUnit})`}
            keyboardType="number-pad"
            placeholder={context.distanceUnit === 'mi' ? '25' : '40'}
            value={values.radius}
            onChangeText={(t) => set('radius', t)}
            error={errors.radius}
          />
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

      <TextInput
        label="Max price"
        kind="money"
        currency={context.currency}
        placeholder="0.00"
        value={values.maxPrice}
        onChangeText={(t) => set('maxPrice', t)}
        hint={hint('maxPrice', "The most you'd pay. Leave empty for no limit")}
        error={errors.maxPrice}
      />

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
        Review Hunt
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: roles.background },
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
