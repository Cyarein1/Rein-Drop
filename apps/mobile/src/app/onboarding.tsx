import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AccessibilityInfo, Image, StyleSheet, Text, View } from 'react-native';
import { ApiError, type SellerSnapshot, type UpdateSellerSnapshotRequest } from '@rein-drop/api-client';
import {
  SELLER_SNAPSHOT_COPY,
  SELLER_SNAPSHOT_QUESTION_COUNT,
  SNAPSHOT_GATE_COPY,
  buildStepUpdate,
  dealCriterionOptions,
  dealTargetField,
  hasAnswer,
  huntFormContext,
  nextStep,
  previousStep,
  questionNumber,
  questionOptions,
  resumeStep,
  snapshotDraft,
  snapshotSummary,
  type HuntFormContext,
  type SnapshotDraft,
  type SnapshotQuestion,
  type SnapshotStep,
} from '@rein-drop/client-core';
import { colors, fontSize, radius, roles, space, wash } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { useSession } from '@/auth/SessionProvider';
import { mascotAssets } from '@/brand/assets';
import { getApiClient } from '@/config/api';
import { Button, ChoiceGroup, font, LoadingState, Screen, SystemBanner, TextInput } from '@/ui';

/**
 * Seller Snapshot onboarding (App Flow Blueprint section 4; Screenbook frames 03-08): the
 * "Are you a reseller?" gate, five questions one per screen, then the personalized summary.
 * Every answer is saved before moving on, so closing the app resumes where the user left off.
 * `?edit=1` (from Settings) re-opens the questions with the saved answers.
 */
export default function OnboardingScreen() {
  return (
    <SessionGate>
      <OnboardingLoader />
    </SessionGate>
  );
}

function OnboardingLoader() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const session = useSession();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; snapshot: SellerSnapshot }>({
    status: 'loading',
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getApiClient().getSellerSnapshot())
      .then(
        (snapshot) => !cancelled && setState({ status: 'ready', snapshot }),
        (err: unknown) => !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <LoadingState label="Loading your answers…" />
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <SystemBanner
          tone="error"
          title="Couldn't load your answers"
          message={state.message}
          action={
            <Button
              variant="secondary"
              onPress={() => {
                setState({ status: 'loading' });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        />
      </Screen>
    );
  }
  const { snapshot } = state;
  const startAt: SnapshotStep = edit === '1' ? (snapshot.isReseller ? 'categories' : 'gate') : resumeStep(snapshot);
  return <SnapshotFlow initial={snapshot} startAt={startAt} context={huntFormContext(session.user.locale)} />;
}

function SnapshotFlow({ initial, startAt, context }: { initial: SellerSnapshot; startAt: SnapshotStep; context: HuntFormContext }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [step, setStep] = useState<SnapshotStep>(startAt);
  const [draft, setDraft] = useState<SnapshotDraft>(() => snapshotDraft(initial));
  const [gateChoice, setGateChoice] = useState<'yes' | 'no' | null>(initial.isReseller === null ? null : initial.isReseller ? 'yes' : 'no');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const go = (to: SnapshotStep) => {
    setError(null);
    setStep(to);
    const n = questionNumber(to);
    if (n) AccessibilityInfo.announceForAccessibility(`Question ${n} of ${SELLER_SNAPSHOT_QUESTION_COUNT}`);
  };
  const set = <K extends keyof SnapshotDraft>(key: K, value: SnapshotDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError(null);
  };
  const leave = (to: '/' | '/hunts/new') => (to === '/' ? router.dismissTo('/') : router.replace('/hunts/new'));

  const save = async (update: UpdateSellerSnapshotRequest, then: (saved: SellerSnapshot) => SnapshotStep) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await getApiClient().updateSellerSnapshot(update);
      setSnapshot(saved);
      go(then(saved));
    } catch (err) {
      const detail = err instanceof ApiError ? err.details?.[0]?.message : undefined;
      setError(err instanceof Error ? (detail ? `${err.message}: ${detail}` : err.message) : "We couldn't save your answer.");
    } finally {
      setSaving(false);
    }
  };

  const banner = error && <SystemBanner tone="error" title="Not saved yet" message={error} />;

  if (step === 'gate') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Set up Rein Drop' }} />
        <Mascot token="welcome" />
        <Text accessibilityRole="header" style={[styles.title, font('extrabold')]}>
          {SNAPSHOT_GATE_COPY.question}
        </Text>
        <Text style={[styles.lead, font('regular')]}>Five quick taps set up Rein Drop around how you source.</Text>
        <ChoiceGroup
          hideLegend
          legend={SNAPSHOT_GATE_COPY.question}
          options={[
            { value: 'yes', label: SNAPSHOT_GATE_COPY.options.yes },
            { value: 'no', label: SNAPSHOT_GATE_COPY.options.no },
          ]}
          value={gateChoice ?? ('' as 'yes')}
          onChange={(v) => {
            setGateChoice(v);
            setError(null);
          }}
        />
        {banner}
        <Button
          onPress={() =>
            gateChoice &&
            save({ isReseller: gateChoice === 'yes' }, (saved) => {
              if (!saved.isReseller) return 'not_reseller';
              const resume = resumeStep(saved);
              return resume === 'gate' || resume === 'not_reseller' ? 'categories' : resume;
            })
          }
          disabled={!gateChoice}
          loading={saving}
          fullWidth
        >
          Continue
        </Button>
      </Screen>
    );
  }

  if (step === 'not_reseller') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Coming soon' }} />
        <Text accessibilityRole="header" style={[styles.title, font('extrabold')]}>
          {SNAPSHOT_GATE_COPY.comingSoon.title}
        </Text>
        <Text style={[styles.lead, font('regular')]}>{SNAPSHOT_GATE_COPY.comingSoon.body}</Text>
        <Button variant="secondary" onPress={() => go('gate')} fullWidth>
          Change my answer
        </Button>
        <Button variant="text" onPress={() => leave('/')}>
          Go to Home
        </Button>
      </Screen>
    );
  }

  if (step === 'summary') {
    const summary = snapshotSummary(snapshot, context);
    return (
      <Screen>
        <Stack.Screen options={{ title: "You're set up" }} />
        <Mascot token="confirmed" />
        <Text accessibilityRole="header" style={[styles.title, font('extrabold')]}>
          You&apos;re set up
        </Text>
        <Text style={[styles.body, font('regular')]}>{summary.sentence}</Text>
        <View style={styles.priorities}>
          <Text style={[styles.muted, font('semibold')]}>Rein Drop will prioritize</Text>
          {summary.priorities.map((p) => (
            <Text key={p} style={[styles.body, font('regular')]}>
              • {p}
            </Text>
          ))}
        </View>
        <Button onPress={() => leave('/hunts/new')} fullWidth>
          Create my first Hunt
        </Button>
        <Button variant="secondary" onPress={() => go('categories')} fullWidth>
          Edit my answers
        </Button>
        <Button variant="text" onPress={() => leave('/')}>
          Go to Home
        </Button>
      </Screen>
    );
  }

  const number = questionNumber(step)!;
  const isLast = number === SELLER_SNAPSHOT_QUESTION_COUNT;
  const submit = () => {
    const result = buildStepUpdate(step, draft, context);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    void save(result.update, () => nextStep(step));
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: `${number} of ${SELLER_SNAPSHOT_QUESTION_COUNT}` }} />
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Setup progress"
        accessibilityValue={{ min: 0, max: SELLER_SNAPSHOT_QUESTION_COUNT, now: number }}
      >
        <View style={[styles.fill, { width: `${(number / SELLER_SNAPSHOT_QUESTION_COUNT) * 100}%` }]} />
      </View>
      <Text accessibilityRole="header" style={[styles.title, font('extrabold')]}>
        {SELLER_SNAPSHOT_COPY[step].question}
      </Text>
      <QuestionInput step={step} draft={draft} set={set} context={context} />
      {banner}
      <Button onPress={submit} disabled={!hasAnswer(step, draft)} loading={saving} fullWidth>
        {isLast ? 'See my summary' : 'Next'}
      </Button>
      <Button variant="secondary" onPress={() => go(previousStep(step))} disabled={saving} fullWidth>
        Back
      </Button>
    </Screen>
  );
}

function QuestionInput({
  step,
  draft,
  set,
  context,
}: {
  step: SnapshotQuestion;
  draft: SnapshotDraft;
  set: <K extends keyof SnapshotDraft>(key: K, value: SnapshotDraft[K]) => void;
  context: HuntFormContext;
}) {
  const legend = SELLER_SNAPSHOT_COPY[step].question;
  switch (step) {
    case 'categories':
      return (
        <>
          <ChoiceGroup multiple hideLegend legend={legend} hint="Choose all that apply" options={questionOptions('categories')} value={draft.categories} onChange={(v) => set('categories', v)} />
          {draft.categories.includes('other') && (
            <TextInput label="What else? (optional)" value={draft.categoriesOther} maxLength={60} onChangeText={(t) => set('categoriesOther', t)} />
          )}
        </>
      );
    case 'stage':
      return <ChoiceGroup hideLegend legend={legend} options={questionOptions('stage')} value={draft.stage ?? ('' as never)} onChange={(v) => set('stage', v)} />;
    case 'sources':
      return (
        <>
          <ChoiceGroup multiple hideLegend legend={legend} hint="Choose all that apply" options={questionOptions('sources')} value={draft.sources} onChange={(v) => set('sources', v)} />
          {draft.sources.includes('other') && (
            <TextInput label="Where else? (optional)" value={draft.sourcesOther} maxLength={60} onChangeText={(t) => set('sourcesOther', t)} />
          )}
        </>
      );
    case 'dealRule': {
      const field = dealTargetField(draft.dealCriterion, context);
      return (
        <>
          <ChoiceGroup
            hideLegend
            legend={legend}
            options={dealCriterionOptions(context)}
            value={draft.dealCriterion ?? ('' as never)}
            onChange={(v) => {
              set('dealCriterion', v);
              set('dealTarget', '');
            }}
          />
          {field && (
            <TextInput
              label={field.label}
              kind={field.kind === 'money' ? 'money' : 'text'}
              currency={field.kind === 'money' ? context.currency : undefined}
              keyboardType={field.kind === 'percent' ? 'number-pad' : undefined}
              hint="Used as a starting point for your Hunts. You can change it any time."
              value={draft.dealTarget}
              onChangeText={(t) => set('dealTarget', t)}
            />
          )}
        </>
      );
    }
    case 'improvementGoal':
      return (
        <ChoiceGroup
          hideLegend
          legend={legend}
          options={questionOptions('improvementGoal')}
          value={draft.improvementGoal ?? ('' as never)}
          onChange={(v) => set('improvementGoal', v)}
        />
      );
  }
}

/** Decorative; the screen text carries the meaning. Nothing renders without an approved asset. */
function Mascot({ token }: { token: 'welcome' | 'confirmed' }) {
  const asset = mascotAssets[token];
  if (!asset) return null;
  return <Image source={asset} style={styles.mascot} resizeMode="contain" accessible={false} importantForAccessibility="no" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: roles.background },
  title: { color: roles.text, fontSize: fontSize['2xl'] },
  lead: { color: roles.textMuted, fontSize: fontSize.md },
  body: { color: roles.text, fontSize: fontSize.md },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
  priorities: { gap: space[2] },
  mascot: { width: 140, height: 140, alignSelf: 'center' },
  track: { height: 6, borderRadius: radius.full, backgroundColor: wash.sky, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.navy },
});
