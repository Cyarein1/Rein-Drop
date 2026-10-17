"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  addItemFormDefaults,
  buildCreateItemRequest,
  dayShortcuts,
  purchaseCostLabels,
  soldWhereOptions,
  withTranslator,
  type AddItemErrors,
  type AddItemForm as Form,
  type PlainContext,
} from "@rein-drop/client-core";
import { Button, ChoiceGroup, SystemBanner, TextInput } from "@/components/ui";
import { sellHref } from "@/sell/routes";
import { createItem } from "../actions";
import { CostRows } from "../CostRows";
import styles from "../items.module.css";

/** Add item: name, what you paid, when, where (optional), purchase costs and notes. */
export function AddItemForm({ context: plain, today }: { context: PlainContext; today: string }) {
  const context = withTranslator(plain);
  const { t } = context;
  const now = new Date(today);
  const [form, setForm] = useState<Form>(() => addItemFormDefaults(context, now));
  const [errors, setErrors] = useState<AddItemErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className={styles.stack}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const built = buildCreateItemRequest(form, new Date(), t);
        if (!built.ok) {
          setErrors(built.errors);
          setError(t("inventory.checkFields"));
          return;
        }
        setErrors({});
        setError(null);
        startTransition(async () => {
          // Redirects to the new item's page on success.
          const r = await createItem(built.request);
          if (!r.ok) setError(r.message);
        });
      }}
    >
      <Link href={sellHref("holding")} className={styles.back}>
        ← Sell
      </Link>
      <h1 className={styles.title}>{t("inventory.addItemTitle")}</h1>
      <p className={styles.meta}>{t("inventory.addItemHint")}</p>

      <TextInput label={t("inventory.formName")} value={form.title} maxLength={200} error={errors.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
      <TextInput label={t("inventory.formPaid")} kind="money" currency={form.currency} value={form.price} error={errors.price} onChange={(e) => set({ price: e.target.value })} />
      <div>
        <TextInput label={t("inventory.formBoughtOn")} kind="date" value={form.day} error={errors.day} onChange={(e) => set({ day: e.target.value })} />
        <div className={styles.shortcuts}>
          {dayShortcuts(now, t).map((s) => (
            <Button key={s.value} variant="text" onClick={() => set({ day: s.value })} aria-pressed={form.day === s.value}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      <ChoiceGroup
        legend={t("inventory.formWhereBought")}
        hint="Optional."
        options={soldWhereOptions(t)}
        value={form.where ?? ("" as never)}
        onChange={(where) => set({ where })}
      />
      {form.where === "other" && (
        <TextInput label={`${t("inventory.whereOther")} (optional)`} value={form.whereText} maxLength={100} placeholder={t("inventory.whereOtherPlaceholder")} onChange={(e) => set({ whereText: e.target.value })} />
      )}

      <CostRows
        legend={t("inventory.purchaseCosts")}
        hint={t("inventory.purchaseCostsHint")}
        rows={form.costs}
        labels={purchaseCostLabels(t)}
        currency={form.currency}
        errors={errors.costs}
        disabled={pending}
        onChange={(costs) => set({ costs })}
      />
      <label className={styles.select}>
        {t("inventory.formNotes")}
        <textarea value={form.notes} maxLength={1000} rows={3} onChange={(e) => set({ notes: e.target.value })} />
      </label>

      {error && <SystemBanner tone="error" title="Couldn't add the item" message={error} />}
      <div className={styles.actions}>
        <Button type="submit" loading={pending}>
          {t("inventory.addItemTitle")}
        </Button>
        <Link href={sellHref("holding")} className={styles.back}>
          {t("inventory.cancel")}
        </Link>
      </div>
    </form>
  );
}
