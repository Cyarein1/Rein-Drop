"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { InventoryItem } from "@rein-drop/api-client";
import {
  buildSaleRequest,
  dayShortcuts,
  SALE_COST_LABEL,
  saleFormDefaults,
  salePreview,
  SOLD_WHERE_OPTIONS,
  type HuntFormContext,
  type SaleForm,
  type SaleFormErrors,
} from "@rein-drop/client-core";
import { Button, ChoiceGroup, Metric, SystemBanner, TextInput } from "@/components/ui";
import { recordSale } from "../../actions";
import { CostRows } from "../../CostRows";
import styles from "../../inventory.module.css";

/**
 * Mark sold (screen 22): sale price, fees and costs, sale date, with a live preview of the
 * realized result. Defaults come from what's known (today, the source marketplace); every value
 * is editable, and the price is never pre-filled from an estimate.
 */
export function MarkSoldForm({ item, context, today }: { item: InventoryItem; context: HuntFormContext; today: string }) {
  const router = useRouter();
  const now = new Date(today);
  const [defaults] = useState(() => saleFormDefaults(item, context, now));
  const [form, setForm] = useState<SaleForm>(defaults);
  const [errors, setErrors] = useState<SaleFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<SaleForm>) => setForm((f) => ({ ...f, ...patch }));
  const preview = salePreview(form, item, context);

  return (
    <form
      className={styles.stack}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const built = buildSaleRequest(form, item, new Date());
        if (!built.ok) {
          setErrors(built.errors);
          setError("Check the highlighted fields.");
          return;
        }
        setErrors({});
        setError(null);
        startTransition(async () => {
          const result = await recordSale(item.id, built.request);
          if (!result.ok) {
            setError(result.message);
            return;
          }
          router.push(`/inventory/${item.id}/result`);
        });
      }}
    >
      <Link href={`/inventory/${item.id}`} className={styles.back}>
        ← {item.title}
      </Link>
      <h1 className={styles.title}>{defaults.correcting ? "Correct the sale" : "Mark sold"}</h1>
      <p className={styles.meta}>{item.title}</p>

      <TextInput
        label="What did it sell for?"
        kind="money"
        currency={form.currency}
        value={form.price}
        onChange={(e) => set({ price: e.target.value })}
        hint={defaults.estimateHint ?? "The price your buyer paid, before fees."}
        error={errors.price}
        autoFocus
      />

      <div>
        <TextInput label="Sold on" kind="date" value={form.day} onChange={(e) => set({ day: e.target.value })} error={errors.day} />
        <div className={styles.shortcuts}>
          {dayShortcuts(now).map((s) => (
            <Button key={s.value} variant="text" onClick={() => set({ day: s.value })} aria-pressed={form.day === s.value}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      <ChoiceGroup legend="Where did it sell?" options={SOLD_WHERE_OPTIONS} value={form.where} onChange={(where) => set({ where })} />

      <CostRows
        legend="Fees and selling costs"
        hint="Leave a row empty if it doesn't apply."
        rows={form.costs}
        labels={SALE_COST_LABEL}
        currency={form.currency}
        errors={errors.costs}
        disabled={pending}
        onChange={(costs) => set({ costs })}
      />

      <section className={styles.preview} aria-live="polite" aria-label="Result preview">
        {preview.profit ? (
          <Metric label={preview.profit.label} value={preview.profit.value} tone={preview.profit.tone} caption="Realized once you save the sale." />
        ) : (
          <p className={styles.small}>{preview.note}</p>
        )}
        {preview.lines.length > 0 && (
          <dl className={styles.rows}>
            {preview.lines.map(([label, value]) => (
              <div key={label} className={styles.row}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {error && <SystemBanner tone="error" title="Couldn't save the sale" message={error} />}
      <div className={styles.actions}>
        <Button type="submit" loading={pending}>
          {defaults.correcting ? "Save the sale" : "Mark sold"}
        </Button>
        <Link href={`/inventory/${item.id}`} className={styles.back}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
