"use client";

import { useId } from "react";
import { newCostDraft, type CostDraft } from "@rein-drop/client-core";
import { Button, TextInput } from "@/components/ui";
import styles from "./inventory.module.css";

const MAX_ROWS = 10;

/** Editable cost lines (category, amount, optional note). Empty amounts are ignored on save. */
export function CostRows<C extends string>({
  legend,
  hint,
  rows,
  labels,
  currency,
  errors,
  disabled,
  onChange,
}: {
  legend: string;
  hint?: string;
  rows: CostDraft<C>[];
  labels: Record<C, string>;
  currency: string;
  errors?: Record<string, string>;
  disabled?: boolean;
  onChange: (rows: CostDraft<C>[]) => void;
}) {
  const id = useId();
  const categories = Object.keys(labels) as C[];
  const update = (key: string, patch: Partial<CostDraft<C>>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <fieldset className={styles.form} disabled={disabled}>
      <legend className={styles.cardTitle}>{legend}</legend>
      {hint && <p className={styles.small}>{hint}</p>}
      {rows.length === 0 && <p className={styles.muted}>None added.</p>}
      {rows.map((row, i) => (
        <div key={row.key} className={styles.costRow}>
          <div className={styles.costFields}>
            <label className={styles.select} htmlFor={`${id}-${row.key}-cat`}>
              Cost {i + 1}
              <select id={`${id}-${row.key}-cat`} value={row.category} onChange={(e) => update(row.key, { category: e.target.value as C })}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {labels[c]}
                  </option>
                ))}
              </select>
            </label>
            <TextInput
              label={`${labels[row.category]} amount`}
              kind="money"
              currency={currency}
              value={row.amount}
              onChange={(e) => update(row.key, { amount: e.target.value })}
              error={errors?.[row.key]}
              placeholder="0.00"
            />
            <TextInput label="Note (optional)" value={row.note} maxLength={200} onChange={(e) => update(row.key, { note: e.target.value })} />
          </div>
          <Button variant="text" onClick={() => onChange(rows.filter((r) => r.key !== row.key))}>
            Remove<span className="visually-hidden"> cost {i + 1}</span>
          </Button>
        </div>
      ))}
      {rows.length < MAX_ROWS && (
        <div>
          <Button variant="secondary" onClick={() => onChange([...rows, newCostDraft(categories[categories.length - 1]!)])}>
            Add a cost
          </Button>
        </div>
      )}
    </fieldset>
  );
}
