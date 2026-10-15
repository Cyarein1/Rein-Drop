import { useEffect, useState, type ReactNode } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AccessibilityInfo, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { space } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { mascotAssets } from '@/brand/assets';
import { getApiClient } from '@/config/api';
import { useDisplayContext, useT } from '@/i18n/useT';
import { ActionBar, Button, ChoiceGroup, colors, font, GUTTER, Icon, IconButton, icons, LoadingState, Screen, SystemBanner, TextInput, type } from '@/ui';

/**
 * Seller Snapshot onboarding (App Flow Blueprint section 4; Screenbook frames 03-08; mock-up
 * CreateHunt): the "Are you a reseller?" gate, five questions one per screen - progress bar, big
 * question, chips, a fixed Continue - then the personalized summary. Every answer is saved before
 * moving on, so closing the app resumes where the user left off. `?edit=1` (from Account) re-opens
 * the questions with the saved answers.
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
      <Frame>
        <View style={styles.center}>
          <LoadingState label={t('onboarding.loadingAnswers')} />
        </View>
      </Frame>
    );
  }
  if (state.status === 'error') {
    return (
      <Frame>
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
      </Frame>
    );
  }
  const { snapshot } = state;
  const startAt: SnapshotStep = edit === '1' ? (snapshot.isReseller ? 'categories' : 'gate') : resumeStep(snapshot);
  return <SnapshotFlow initial={snapshot} startAt={startAt} context={context} />;
}

/**
 * The flow's own top bar (the modal's navigation header is hidden): Back on the left when there's
 * a previous question, the title, Close on the right - then the progress bar on question screens.
 */
function Frame({ onBack, backDisabled, progress, children }: { onBack?: () => void; backDisabled?: boolean; progress?: number; children: ReactNode }) {
  const router = useRouter();
  const t = useT();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={styles.frame}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={styles.bar}>
        <View style={styles.barRow}>
          <View style={styles.barSide}>{onBack && <IconButton icon={icons.back} label={t('onboarding.back')} onPress={onBack} disabled={backDisabled} />}</View>
          <Text style={[styles.barTitle, font('semibold')]} numberOfLines={1} accessibilityRole="header">
            {t('onboarding.setupTitle')}
          </Text>
          <View style={[styles.barSide, styles.barRight]}>
            <Pressable accessibilityRole="button" onPress={close} hitSlop={8} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
              <Text style={[styles.closeText, font('medium')]}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </View>
        {progress !== undefined && (
          <View
            style={styles.segments}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('onboarding.progress')}
            accessibilityValue={{ min: 0, max: SELLER_SNAPSHOT_QUESTION_COUNT, now: progress }}
          >
            {Array.from({ length: SELLER_SNAPSHOT_QUESTION_COUNT }, (_, i) => (
              <View key={i} style={[styles.segment, i < progress && styles.segmentOn]} />
            ))}
          </View>
        )}
      </SafeAreaView>
      {children}
    </View>
  );
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
      <Frame>
        <Screen
          footer={
            <ActionBar stacked>
              {banner}
              <Button
                size="large"
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
              >
                {t('onboarding.continue')}
              </Button>
            </ActionBar>
          }
        >
          <Mascot token="welcome" />
          <Question text={gateCopy.question} lead={t('onboarding.gateLead')} />
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
        </Screen>
      </Frame>
    );
  }

  if (step === 'not_reseller') {
    return (
      <Frame onBack={() => go('gate')}>
        <Screen
          footer={
            <ActionBar stacked>
              <Button size="large" variant="secondary" onPress={() => go('gate')}>
                {t('onboarding.changeAnswer')}
              </Button>
              <Button variant="text" onPress={() => leave('/')}>
                {t('onboarding.goHome')}
              </Button>
            </ActionBar>
          }
        >
          <Question text={gateCopy.comingSoon.title} lead={gateCopy.comingSoon.body} />
        </Screen>
      </Frame>
    );
  }

  if (step === 'summary') {
    const summary = snapshotSummary(snapshot, context);
    return (
      <Frame>
        <Screen
          footer={
            <ActionBar stacked>
              <Button size="large" onPress={() => leave('/hunts/new')}>
                {t('onboarding.createFirstHunt')}
              </Button>
              <View style={styles.row}>
                <Button variant="secondary" fullWidth onPress={() => go('categories')}>
                  {t('onboarding.editAnswers')}
                </Button>
                <Button variant="text" fullWidth onPress={() => leave('/')}>
                  {t('onboarding.goHome')}
                </Button>
              </View>
            </ActionBar>
          }
        >
          <Mascot token="confirmed" />
          <Question text={t('onboarding.setUpDone')} lead={summary.sentence} />
          <View style={styles.priorities}>
            <Text style={[styles.kicker, font('semibold')]}>{t('onboarding.willPrioritize')}</Text>
            {summary.priorities.map((p, i) => (
              <View key={p} style={[styles.priority, i < summary.priorities.length - 1 && styles.hairline]}>
                <Icon name={icons.check} color={colors.profitText} size={16} />
                <Text style={[styles.priorityText, font('regular')]}>{p}</Text>
              </View>
            ))}
          </View>
        </Screen>
      </Frame>
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
    <Frame onBack={() => go(previousStep(step))} backDisabled={saving} progress={number}>
      <Screen
        footer={
          <ActionBar stacked>
            {banner}
            <Button size="large" onPress={submit} disabled={!hasAnswer(step, draft)} loading={saving}>
              {isLast ? t('onboarding.seeSummary') : t('onboarding.continue')}
            </Button>
          </ActionBar>
        }
      >
        <Question kicker={t('onboarding.questionOf', { number, total: SELLER_SNAPSHOT_QUESTION_COUNT })} text={snapshotQuestionText(step, t)} />
        <QuestionInput step={step} draft={draft} set={set} context={context} />
      </Screen>
    </Frame>
  );
}

/** "QUESTION 2 OF 5", the question in large type, an optional lead line (mock-up CreateHunt). */
function Question({ kicker, text, lead }: { kicker?: string; text: string; lead?: string }) {
  return (
    <View style={styles.question}>
      {kicker && <Text style={[styles.kicker, font('semibold')]}>{kicker}</Text>}
      <Text accessibilityRole="header" style={[styles.title, font('bold')]}>
        {text}
      </Text>
      {lead && <Text style={[styles.lead, font('regular')]}>{lead}</Text>}
    </View>
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
  frame: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center' },
  bar: { backgroundColor: colors.background, paddingBottom: space[2], gap: space[2] },
  barRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: space[2] },
  barSide: { width: 88, flexDirection: 'row', alignItems: 'center' },
  barRight: { justifyContent: 'flex-end', paddingRight: GUTTER - space[2] },
  barTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: type.body },
  close: { minHeight: 44, justifyContent: 'center' },
  closeText: { color: colors.textMuted, fontSize: type.body },
  pressed: { opacity: 0.6 },
  segments: { flexDirection: 'row', gap: 4, paddingHorizontal: GUTTER },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  segmentOn: { backgroundColor: colors.action },
  question: { gap: 6, paddingTop: space[3] },
  // Uppercase is display-only: screen readers get the text as written.
  kicker: { color: colors.textMuted, fontSize: type.subhead, letterSpacing: 0.3, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: type.question, lineHeight: 32, letterSpacing: -0.3 },
  lead: { color: colors.textMuted, fontSize: type.body, lineHeight: 21 },
  priorities: { gap: 0 },
  priority: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[3] },
  priorityText: { flex: 1, color: colors.text, fontSize: type.body, lineHeight: 21 },
  hairline: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  row: { flexDirection: 'row', gap: space[2] },
  mascot: { width: 112, height: 112, alignSelf: 'center' },
});
