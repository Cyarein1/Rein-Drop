"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import type { SellerSnapshot, UpdateSellerSnapshotRequest } from "@rein-drop/api-client";
import {
  SELLER_SNAPSHOT_COPY,
  SELLER_SNAPSHOT_QUESTION_COUNT,
  SNAPSHOT_GATE_COPY,
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
  snapshotSummary,
  type HuntFormContext,
  type PlainContext,
  withTranslator,
  type SnapshotDraft,
  type SnapshotQuestion,
  type SnapshotStep,
} from "@rein-drop/client-core";
import { mascotAssets } from "@/brand/assets";
import { Button, ButtonLink, ChoiceGroup, SystemBanner, TextInput } from "@/components/ui";
import { saveSnapshotStep } from "./actions";
import styles from "./onboarding.module.css";

interface SnapshotFlowProps {
  initial: SellerSnapshot;
  startAt: SnapshotStep;
  context: PlainContext;
}

const MASCOT_WIDTH = 140;

/** One step at a time; each answer is saved before moving on (Blueprint section 4). */
export function SnapshotFlow({ initial, startAt, context: plain }: SnapshotFlowProps) {
  const context = withTranslator(plain);
  const [snapshot, setSnapshot] = useState(initial);
  const [step, setStep] = useState<SnapshotStep>(startAt);
  const [draft, setDraft] = useState<SnapshotDraft>(() => snapshotDraft(initial));
  const [gateChoice, setGateChoice] = useState<"yes" | "no" | null>(
    initial.isReseller === null ? null : initial.isReseller ? "yes" : "no",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus to the new question so keyboard and screen-reader users start at the top.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  const go = (to: SnapshotStep) => {
    setError(null);
    setStep(to);
  };
  const set = <K extends keyof SnapshotDraft>(key: K, value: SnapshotDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError(null);
  };

  const save = (update: UpdateSellerSnapshotRequest, then: (saved: SellerSnapshot) => SnapshotStep) =>
    startSaving(async () => {
      const result = await saveSnapshotStep(update);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSnapshot(result.snapshot);
      go(then(result.snapshot));
    });

  const submitGate = () => {
    if (!gateChoice) return;
    save({ isReseller: gateChoice === "yes" }, (saved) => {
      if (!saved.isReseller) return "not_reseller";
      // A returning reseller continues where they left off.
      const resume = resumeStep(saved);
      return resume === "gate" || resume === "not_reseller" ? "categories" : resume;
    });
  };

  const submitQuestion = (question: SnapshotQuestion) => {
    const result = buildStepUpdate(question, draft, context);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    save(result.update, () => nextStep(question));
  };

  const title = (text: string) => (
    <h1 ref={heading} tabIndex={-1} className={styles.title}>
      {text}
    </h1>
  );
  const banner = error && <SystemBanner tone="error" title="Not saved yet" message={error} />;

  if (step === "gate") {
    return (
      <section className={styles.step}>
        <Mascot token="welcome" />
        {title(SNAPSHOT_GATE_COPY.question)}
        <p className={styles.lead}>Five quick taps set up Rein Drop around how you source.</p>
        <ChoiceGroup
          hideLegend
          legend={SNAPSHOT_GATE_COPY.question}
          options={[
            { value: "yes", label: SNAPSHOT_GATE_COPY.options.yes },
            { value: "no", label: SNAPSHOT_GATE_COPY.options.no },
          ]}
          value={gateChoice ?? ("" as "yes")}
          onChange={(v) => {
            setGateChoice(v);
            setError(null);
          }}
        />
        {banner}
        <div className={styles.actions}>
          <Button onClick={submitGate} disabled={!gateChoice} loading={saving} fullWidth>
            Continue
          </Button>
        </div>
      </section>
    );
  }

  if (step === "not_reseller") {
    return (
      <section className={styles.step}>
        {title(SNAPSHOT_GATE_COPY.comingSoon.title)}
        <p className={styles.lead}>{SNAPSHOT_GATE_COPY.comingSoon.body}</p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => go("gate")}>
            Change my answer
          </Button>
          <ButtonLink href="/home" variant="text">
            Go to Home
          </ButtonLink>
        </div>
      </section>
    );
  }

  if (step === "summary") {
    const summary = snapshotSummary(snapshot, context);
    return (
      <section className={styles.step}>
        <Mascot token="confirmed" />
        {title("You're set up")}
        <p>{summary.sentence}</p>
        <div>
          <p className={styles.progressLabel}>Rein Drop will prioritize</p>
          <ul className={styles.priorities}>
            {summary.priorities.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className={styles.actions}>
          <ButtonLink href="/hunts/new" fullWidth>
            Create my first Hunt
          </ButtonLink>
        </div>
        <div className={styles.actions}>
          <Button variant="text" onClick={() => go("categories")}>
            Edit my answers
          </Button>
          <ButtonLink href="/home" variant="text">
            Go to Home
          </ButtonLink>
        </div>
      </section>
    );
  }

  const number = questionNumber(step)!;
  const isLast = number === SELLER_SNAPSHOT_QUESTION_COUNT;
  const copy = SELLER_SNAPSHOT_COPY[step];

  return (
    <section className={styles.step}>
      <div className={styles.progress}>
        <p className={styles.progressLabel}>
          {number} of {SELLER_SNAPSHOT_QUESTION_COUNT}
        </p>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={SELLER_SNAPSHOT_QUESTION_COUNT}
          aria-valuenow={number}
        >
          <div className={styles.progressFill} style={{ width: `${(number / SELLER_SNAPSHOT_QUESTION_COUNT) * 100}%` }} />
        </div>
      </div>
      {title(copy.question)}
      <form
        className={styles.step}
        onSubmit={(e) => {
          e.preventDefault();
          submitQuestion(step);
        }}
      >
        <QuestionInput step={step} draft={draft} set={set} context={context} />
        {banner}
        <div className={styles.actions}>
          <Button type="submit" disabled={!hasAnswer(step, draft)} loading={saving} fullWidth>
            {isLast ? "See my summary" : "Next"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => go(previousStep(step))} disabled={saving}>
            Back
          </Button>
        </div>
      </form>
    </section>
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
    case "categories":
      return (
        <>
          <ChoiceGroup multiple hideLegend legend={legend} hint="Choose all that apply" options={questionOptions("categories")} value={draft.categories} onChange={(v) => set("categories", v)} />
          {draft.categories.includes("other") && (
            <TextInput label="What else? (optional)" value={draft.categoriesOther} maxLength={60} onChange={(e) => set("categoriesOther", e.target.value)} />
          )}
        </>
      );
    case "stage":
      return <ChoiceGroup hideLegend legend={legend} options={questionOptions("stage")} value={draft.stage ?? ("" as never)} onChange={(v) => set("stage", v)} />;
    case "sources":
      return (
        <>
          <ChoiceGroup multiple hideLegend legend={legend} hint="Choose all that apply" options={questionOptions("sources")} value={draft.sources} onChange={(v) => set("sources", v)} />
          {draft.sources.includes("other") && (
            <TextInput label="Where else? (optional)" value={draft.sourcesOther} maxLength={60} onChange={(e) => set("sourcesOther", e.target.value)} />
          )}
        </>
      );
    case "dealRule": {
      const field = dealTargetField(draft.dealCriterion, context);
      return (
        <>
          <ChoiceGroup
            hideLegend
            legend={legend}
            options={dealCriterionOptions(context)}
            value={draft.dealCriterion ?? ("" as never)}
            onChange={(v) => {
              set("dealCriterion", v);
              set("dealTarget", "");
            }}
          />
          {field && (
            <TextInput
              label={field.label}
              kind={field.kind === "money" ? "money" : "text"}
              currency={field.kind === "money" ? context.currency : undefined}
              inputMode={field.kind === "percent" ? "numeric" : undefined}
              hint="Used as a starting point for your Hunts. You can change it any time."
              value={draft.dealTarget}
              onChange={(e) => set("dealTarget", e.target.value)}
            />
          )}
        </>
      );
    }
    case "improvementGoal":
      return (
        <ChoiceGroup
          hideLegend
          legend={legend}
          options={questionOptions("improvementGoal")}
          value={draft.improvementGoal ?? ("" as never)}
          onChange={(v) => set("improvementGoal", v)}
        />
      );
  }
}

/** Decorative; the step text carries the meaning. Renders nothing without an approved asset. */
function Mascot({ token }: { token: "welcome" | "confirmed" }) {
  const asset = mascotAssets[token];
  if (!asset) return null;
  return (
    <Image
      src={asset}
      alt=""
      width={MASCOT_WIDTH}
      height={Math.round((asset.height / asset.width) * MASCOT_WIDTH)}
      className={styles.illustration}
      priority
    />
  );
}
