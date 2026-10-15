import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AccessibilityInfo, Image, StyleSheet, Text, View } from 'react-native';
import { ApiError, type SellerSnapshot, type UpdateSellerSnapshotRequest } from '@rein-drop/api-client';
import {
  SELLER_SNAPSHOT_QUESTION_COUNT,
  buildStepUpdate,
  dealCriterionOptions,
  dealTargetField,
  hasAnswer,
  nextStep,
  previousStep,
  questionNumber,
  questionOptions,
  resumeStep,
  snapshotDraft,
  snapshotGateCopy,
  snapshotQuestionText,
  snapshotSummary,
  type HuntFormContext,
  type SnapshotDraft,
  type SnapshotQuestion,
  type SnapshotStep,
} from '@rein-drop/client-core';
import { colors, fontSize, radius, roles, space, wash } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { mascotAssets } from '@/brand/assets';
import { getApiClient } from '@/config/api';
import { useDisplayContext } from '@/i18n/useT';
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
  const context = useDisplayContext();
  const { t } = context;
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
        <LoadingState label={t('onboarding.loadingAnswers')} />
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <SystemBanner
          tone="error"
          title={t('onboarding.loadFailed')}
          message={state.message}
          action={
            <Button
              variant="secondary"
              onPress={() => {
                setState({ status: 'loading' });
                setAttempt((n) => n + 1);
              }}
            >
              {t('onboarding.tryAgain')}
            </Button>
          }
        />
      </Screen>
    );
  }
  const { snapshot } = state;
  const startAt: SnapshotStep = edit === '1' ? (snapshot.isReseller ? 'categories' : 'gate') : resumeStep(snapshot);
  return <SnapshotFlow initial={snapshot} startAt={startAt} context={context} />;
}

function SnapshotFlow({ initial, startAt, context }: { initial: SellerSnapshot; startAt: SnapshotStep; context: HuntFormContext }) {
  const router = useRouter();
  const { t } = context;
  const gateCopy = snapshotGateCopy(t);
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
    if (n) AccessibilityInfo.announceForAccessibility(t('onboarding.questionOf', { number: n, total: SELLER_SNAPSHOT_QUESTION_COUNT }));
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
      setError(err instanceof Error ? (detail ? `${err.message}: ${detail}` : err.message) : t('onboarding.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const banner = error && <SystemBanner tone="error" title={t('onboarding.notSavedYet')} message={error} />;

  if (step === 'gate') {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('onboarding.setupTitle') }} />
        <Mascot token="welcome" />
        <Text accessibilityRole="header" style={[styles.title, font('extrabold')]}>
          {gateCopy.question}
        </Text>
        <Text style={[styles.lead, font('regular')]}>{t('onboarding.gateLead')}</Text>
        <ChoiceGroup
          hideLegend
          legend={gateCopy.question}
          options={[
            { value: 'yes', label: gateCopy.options.yes },
            { value: 'no', label: gateCopy.options.no },
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
          {t('onboarding.continue')}
        </Button>
      </Screen>
    );
  }

  if (step === 'not_reseller') {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('onboarding.comingSoonTitle') }} />
        <Text accessibilityRole="header" style={[styles.title, font('extrabold')]}>
          {gateCopy.comingSoon.title}
        </Text>
        <Text style={[styles.lead, font('regular')]}>{gateCopy.comingSoon.body}</Text>
        <Button variant="secondary" onPress={() => go('gate')} fullWidth>
          {t('onboarding.changeAnswer')}
        </Button>
        <Button variant="text" onPress={() => leave('/')}>
          {t('onboarding.goHome')}
        </Button>
      </Screen>
    );
  }

  if (step === 'summary') {
    const summary = snapshotSummary(snapshot, context);
    return (
      <Screen>
        <Stack.Screen options={{ title: t('onboarding.setUpDone') }} />
        <Mascot token="confirmed" />
        <Text accessibilityRole="header" style={[styles.title, font('extrabold')]}>
          {t('onboarding.setUpDone')}
        </Text>
        <Text style={[styles.body, font('regular')]}>{summary.sentence}</Text>
        <View style={styles.priorities}>
          <Text style={[styles.muted, font('semibold')]}>{t('onboarding.willPrioritize')}</Text>
          {summary.priorities.map((p) => (
            <Text key={p} style={[styles.body, font('regular')]}>
              {t('onboarding.bullet', { text: p })}
            </Text>
          ))}
        </View>
        <Button onPress={() => leave('/hunts/new')} fullWidth>
          {t('onboarding.createFirstHunt')}
        </Button>
        <Button variant="secondary" onPress={() => go('categories')} fullWidth>
          {t('onboarding.editAnswers')}
        </Button>
        <Button variant="text" onPress={() => leave('/')}>
          {t('onboarding.goHome')}
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
      <Stack.Screen options={{ title: t('onboarding.stepOf', { number, total: SELLER_SNAPSHOT_QUESTION_COUNT }) }} />
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('onboarding.progress')}
        accessibilityValue={{ min: 0, max: SELLER_SNAPSHOT_QUESTION_COUNT, now: number }}
      >
        <View style={[styles.fill, { width: `${(number / SELLER_SNAPSHOT_QUESTION_COUNT) * 100}%` }]} />
      </View>
      <Text accessibilityRole="header" style={[styles.title, font('extrabold')]}>
        {snapshotQuestionText(step, t)}
      </Text>
      <QuestionInput step={step} draft={draft} set={set} context={context} />
      {banner}
      <Button onPress={submit} disabled={!hasAnswer(step, draft)} loading={saving} fullWidth>
        {isLast ? t('onboarding.seeSummary') : t('onboarding.next')}
      </Button>
      <Button variant="secondary" onPress={() => go(previousStep(step))} disabled={saving} fullWidth>
        {t('onboarding.back')}
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
  const { t } = context;
  const legend = snapshotQuestionText(step, t);
  switch (step) {
    case 'categories':
      return (
        <>
          <ChoiceGroup multiple hideLegend legend={legend} hint={t('onboarding.chooseAll')} options={questionOptions('categories', t)} value={draft.categories} onChange={(v) => set('categories', v)} />
          {draft.categories.includes('other') && (
            <TextInput label={t('onboarding.whatElse')} value={draft.categoriesOther} maxLength={60} onChangeText={(text) => set('categoriesOther', text)} />
          )}
        </>
      );
    case 'stage':
      return <ChoiceGroup hideLegend legend={legend} options={questionOptions('stage', t)} value={draft.stage ?? ('' as never)} onChange={(v) => set('stage', v)} />;
    case 'sources':
      return (
        <>
          <ChoiceGroup multiple hideLegend legend={legend} hint={t('onboarding.chooseAll')} options={questionOptions('sources', t)} value={draft.sources} onChange={(v) => set('sources', v)} />
          {draft.sources.includes('other') && (
            <TextInput label={t('onboarding.whereElse')} value={draft.sourcesOther} maxLength={60} onChangeText={(text) => set('sourcesOther', text)} />
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
              hint={t('onboarding.targetHint')}
              value={draft.dealTarget}
              onChangeText={(text) => set('dealTarget', text)}
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
          options={questionOptions('improvementGoal', t)}
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
