"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CreateHuntRequest, Hunt, HuntCondition, MarketplaceKey, UpdateHuntRequest } from "@rein-drop/api-client";
import {
  buildCreateHuntRequest,
  buildUpdateHuntRequest,
  huntReview,
  needsLocation,
  type HuntFormContext,
  type HuntFormErrors,
  type HuntFormField,
  type HuntFormValues,
  type HuntTargetKind,
  type PrefillNote,
} from "@rein-drop/client-core";
import {
  Button,
  Card,
  ChoiceGroup,
  Disclosure,
  Page,
  SystemBanner,
  TextInput,
} from "@/components/ui";
import { updateHuntAction } from "../[id]/actions";
import { saveHuntDraft } from "./actions";
import styles from "./CreateHuntFlow.module.css";

const MARKETPLACE_OPTIONS = [
  { value: "ebay", label: "eBay" },
  { value: "facebook", label: "Facebook Marketplace" },
] as const satisfies readonly { value: MarketplaceKey; label: string }[];

type ConditionChoice = HuntCondition | "any";
const CONDITION_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "new", label: "New" },
  { value: "used", label: "Used" },
  { value: "refurbished", label: "Refurbished" },
] as const satisfies readonly { value: ConditionChoice; label: string }[];

const TARGET_OPTIONS = [
  { value: "none", label: "No target" },
  { value: "profit", label: "Minimum profit" },
  { value: "margin", label: "Minimum margin" },
] as const satisfies readonly { value: HuntTargetKind; label: string }[];

export interface CreateHuntFlowProps {
  initialValues: HuntFormValues;
  context: HuntFormContext;
  prefilled: PrefillNote[];
  queryPlaceholder: string;
  /** Edit an existing hunt instead of creating one: same form and review, saved with PATCH. */
  editing?: Hunt;
}

/**
 * Create Hunt -> Review -> Save as draft (App Flow Blueprint section 5). Monitoring is not
 * started: "Start watching" arrives with plan selection. With , the same form edits a
 * hunt (same id, recorded in its history) and the review saves the changes.
 */
export function CreateHuntFlow({ initialValues, context, prefilled, queryPlaceholder, editing }: CreateHuntFlowProps) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<HuntFormErrors>({});
  const [request, setRequest] = useState<CreateHuntRequest | null>(null);
  const [update, setUpdate] = useState<UpdateHuntRequest | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const set = <K extends HuntFormField>(field: K, value: HuntFormValues[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));
  };
  const note = (field: HuntFormField) => prefilled.find((p) => p.field === field)?.note;
  const hint = (field: HuntFormField, text?: string) =>
    [note(field) && `${note(field)} - change it anytime`, text].filter(Boolean).join(". ") || undefined;

  const goToReview = () => {
    const result = editing ? buildUpdateHuntRequest(editing, values, context) : buildCreateHuntRequest(values, context);
    if (!result.ok) {
      setErrors(result.errors);
      // Move focus to the first problem so keyboard and screen-reader users land on it.
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    if ("review" in result) {
      setRequest(result.review);
      setUpdate(result.request);
    } else {
      setRequest(result.request);
    }
    setSaveError(null);
    window.scrollTo({ top: 0 });
  };

  /** Saves the draft; then either back to the list or on to the plan gate ("Start watching"). */
  const save = (next: "list" | "start") => {
    if (!request) return;
    startSaving(async () => {
      const result = await saveHuntDraft(request);
      if (result.ok) {
        router.push(next === "start" ? `/hunts/${result.huntId}/start` : `/hunts?created=${result.huntId}`);
        return;
      }
      if (Object.keys(result.errors).length > 0) {
        setErrors(result.errors);
        setRequest(null); // back to the form, where the field errors are shown
      }
      setSaveError(result.message);
    });
  };

  /** Edit mode: saves the changes, then back to the hunt. */
  const saveChanges = () => {
    if (!editing || !update) return;
    startSaving(async () => {
      const result = await updateHuntAction(editing.id, update);
      if (result.ok) {
        router.push(`/hunts/${editing.id}?saved=1`);
        return;
      }
      if (Object.keys(result.errors).length > 0) {
        setErrors(result.errors);
        setRequest(null);
      }
      setSaveError(result.message);
    });
  };

  if (request && editing) {
    const review = huntReview(request, context);
    return (
      <Page title="Review changes" description="This updates the same Hunt - its deals and history stay." width="narrow">
        <Card>
          <p className={styles.sentence}>{review.sentence}</p>
        </Card>
        <Card title="Details">
          <dl className={styles.review}>
            {review.items.map((item) => (
              <div key={item.label} className={styles.reviewRow}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {review.warnings.map((w) => (
          <SystemBanner key={w} tone="warning" title={editing.status === "LIVE" ? "This Hunt can't keep watching like this" : "Before this Hunt can start watching"} message={w} />
        ))}
        {saveError && <SystemBanner tone="error" title="Not saved" message={saveError} />}
        <div className={styles.actions}>
          <Button onClick={saveChanges} loading={saving} fullWidth>
            Save changes
          </Button>
          <Button variant="text" onClick={() => setRequest(null)} disabled={saving} fullWidth>
            Back to editing
          </Button>
        </div>
      </Page>
    );
  }

  if (request) {
    const review = huntReview(request, context);
    return (
      <Page title="Review your Hunt" description="Check what Rein Drop will watch before you save." width="narrow">
        <Card>
          <p className={styles.sentence}>{review.sentence}</p>
        </Card>
        <Card title="Details">
          <dl className={styles.review}>
            {review.items.map((item) => (
              <div key={item.label} className={styles.reviewRow}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {review.warnings.map((w) => (
          <SystemBanner key={w} tone="warning" title="Before this Hunt can start watching" message={w} />
        ))}
        {saveError && <SystemBanner tone="error" title="Not saved" message={saveError} />}
        <div className={styles.actions}>
          <Button onClick={() => save("start")} loading={saving} fullWidth aria-describedby="start-watching-note">
            Start watching
          </Button>
          <p id="start-watching-note" className={styles.muted}>
            Saves your Hunt, then you choose a plan.
          </p>
          <Button variant="secondary" onClick={() => save("list")} disabled={saving} fullWidth>
            Save as draft
          </Button>
          <Button variant="text" onClick={() => setRequest(null)} disabled={saving} fullWidth>
            Edit
          </Button>
        </div>
      </Page>
    );
  }

  const conditionChoices: ConditionChoice[] = values.conditions.length ? values.conditions : ["any"];
  const onConditions = (next: ConditionChoice[]) => {
    const added = next.find((c) => !conditionChoices.includes(c));
    const conditions = added === "any" ? [] : (next.filter((c) => c !== "any") as HuntCondition[]);
    set("conditions", conditions);
  };

  return (
    <Page
      title={editing ? "Edit Hunt" : "Create Hunt"}
      description={editing ? "Changes apply from the next check. Deals found so far stay." : "Tell Rein Drop what to watch for."}
      width="narrow"
    >
      {errors.form && <SystemBanner tone="error" title="Please check the form" message={errors.form} />}
      {saveError && !errors.form && <SystemBanner tone="error" title="Not saved" message={saveError} />}

      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          goToReview();
        }}
      >
        <TextInput
          label="What are you hunting for?"
          hint="A product, model or a short description"
          placeholder={queryPlaceholder}
          value={values.query}
          onChange={(e) => set("query", e.target.value)}
          error={errors.query}
          autoFocus
        />

        <ChoiceGroup
          legend="Where should Rein Drop look?"
          multiple
          options={MARKETPLACE_OPTIONS}
          value={values.marketplaces}
          onChange={(v) => set("marketplaces", v)}
          hint={hint("marketplaces")}
          error={errors.marketplaces}
        />

        {needsLocation(values) && (
          <div className={styles.row}>
            <TextInput
              label="Location"
              hint="Facebook Marketplace is local pickup - needed before this Hunt can start watching"
              placeholder="City, area or postal code"
              value={values.locationText}
              onChange={(e) => set("locationText", e.target.value)}
              error={errors.locationText}
              className={styles.grow}
            />
            <TextInput
              label={`Radius (${context.distanceUnit})`}
              inputMode="numeric"
              placeholder={context.distanceUnit === "mi" ? "25" : "40"}
              value={values.radius}
              onChange={(e) => set("radius", e.target.value)}
              error={errors.radius}
              className={styles.radius}
            />
          </div>
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
          onChange={(e) => set("maxPrice", e.target.value)}
          hint={hint("maxPrice", "The most you'd pay. Leave empty for no limit")}
          error={errors.maxPrice}
        />

        <ChoiceGroup
          legend="Target (optional)"
          options={TARGET_OPTIONS}
          value={values.targetKind}
          onChange={(v) => set("targetKind", v)}
        />
        {values.targetKind === "profit" && (
          <TextInput
            label="Minimum profit per deal"
            kind="money"
            currency={context.currency}
            value={values.targetProfit}
            onChange={(e) => set("targetProfit", e.target.value)}
            hint={hint("targetProfit")}
            error={errors.targetProfit}
          />
        )}
        {values.targetKind === "margin" && (
          <TextInput
            label="Minimum margin (%)"
            inputMode="numeric"
            value={values.targetMargin}
            onChange={(e) => set("targetMargin", e.target.value)}
            hint={hint("targetMargin")}
            error={errors.targetMargin}
          />
        )}

        <Disclosure summary="More filters" defaultOpen={Boolean(values.exclusions || errors.exclusions)}>
          <TextInput
            label="Words to ignore"
            hint="Separate with commas, e.g. broken, for parts, box only"
            value={values.exclusions}
            onChange={(e) => set("exclusions", e.target.value)}
            error={errors.exclusions}
          />
        </Disclosure>

        <Button type="submit" fullWidth>
          {editing ? "Review changes" : "Review Hunt"}
        </Button>
      </form>
    </Page>
  );
}
