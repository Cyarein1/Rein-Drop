"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { InventoryItem, ReplacePurchaseCostsRequest, UpdateInventoryItemRequest } from "@rein-drop/api-client";
import {
  buildPurchaseUpdate,
  inventoryDetailView,
  PURCHASE_COST_LABEL,
  purchaseFormDefaults,
  saleResultView,
  type HuntFormContext,
  type PurchaseForm,
  type PurchaseFormErrors,
} from "@rein-drop/client-core";
import { Badge, Button, ButtonLink, Card, Metric, SystemBanner, TextInput } from "@/components/ui";
import { savePurchase, setHoldingStatus, undoSale, type InventoryActionResult } from "../actions";
import { CostRows } from "../CostRows";
import styles from "../inventory.module.css";

/** Inventory detail: the purchase (editable), holding state, what was expected, and the sale if any. */
export function InventoryDetail({ initial, context }: { initial: InventoryItem; context: HuntFormContext }) {
  const [item, setItem] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const view = inventoryDetailView(item, context);
  const result = saleResultView(item, context);

  const run = (action: () => Promise<InventoryActionResult>, done: string) =>
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const r = await action();
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setItem(r.item);
      setEditing(false);
      setConfirmUndo(false);
      setNotice(done);
    });

  return (
    <div className={styles.stack}>
      <Link href={item.holding ? "/inventory" : "/inventory?status=sold"} className={styles.back}>
        ← Inventory
      </Link>
      <div className={styles.badges}>
        <Badge tone={view.status.tone}>{view.status.label}</Badge>
        {view.source && <Badge tone="neutral">{view.source}</Badge>}
      </div>
      <h1 className={styles.title}>{view.title}</h1>
      <p className={styles.meta}>
        {view.purchasedOn} · {view.held}
      </p>

      <div className={styles.actions}>
        {view.holding && <ButtonLink href={`/inventory/${item.id}/sell`}>Mark sold</ButtonLink>}
        {view.holding && item.status === "IN_STOCK" && (
          <Button variant="secondary" loading={pending} onClick={() => run(() => setHoldingStatus(item.id, "LISTED"), "Marked as listed for sale.")}>
            I&apos;ve listed it
          </Button>
        )}
        {view.holding && item.status === "LISTED" && (
          <Button variant="secondary" loading={pending} onClick={() => run(() => setHoldingStatus(item.id, "IN_STOCK"), "Back to in stock.")}>
            Not listed any more
          </Button>
        )}
        {!view.holding && <ButtonLink href={`/inventory/${item.id}/result`}>See sale result</ButtonLink>}
      </div>
      {error && <SystemBanner tone="error" title="That didn't work" message={error} />}
      {notice && (
        <p role="status" className={styles.small}>
          {notice}
        </p>
      )}

      {/* ---------- Sale (only once sold) ---------- */}
      {result && item.sale && (
        <Card title="Sale">
          <Metric label={result.headline} value={result.value} tone={result.tone} caption={result.summary ?? undefined} />
          <div className={styles.actions}>
            <ButtonLink href={`/inventory/${item.id}/sell`} variant="secondary">
              Correct the sale
            </ButtonLink>
            {!confirmUndo ? (
              <Button variant="text" onClick={() => setConfirmUndo(true)} disabled={pending}>
                Undo sale
              </Button>
            ) : (
              <>
                <span className={styles.small}>Back to your inventory, with no result?</span>
                <Button variant="destructive" loading={pending} onClick={() => run(() => undoSale(item.id), "Sale removed. The item is back in stock.")}>
                  Undo sale
                </Button>
                <Button variant="text" onClick={() => setConfirmUndo(false)} disabled={pending}>
                  Keep it
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      {/* ---------- Purchase ---------- */}
      <Card
        title="Purchase"
        action={
          !editing && (
            <Button variant="text" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      >
        {editing ? (
          <PurchaseEditor item={item} pending={pending} onCancel={() => setEditing(false)} onSave={(update, costs) => run(() => savePurchase(item.id, update, costs), "Purchase updated.")} />
        ) : (
          <>
            <dl className={styles.rows}>
              {view.purchaseLines.map(([label, value], i) => (
                <div key={`${label}-${i}`} className={[styles.row, label === "Total cost" ? styles.total : ""].join(" ")}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {item.purchase.costs.length === 0 && <p className={styles.small}>No extra costs yet. Add tax, shipping or repairs so your profit is accurate.</p>}
            {view.notes && <p>{view.notes}</p>}
          </>
        )}
      </Card>

      {/* ---------- Expected (frozen at Bought) ---------- */}
      <Card title="When you bought it">
        {view.expectedLines.length > 0 ? (
          <>
            <dl className={styles.rows}>
              {view.expectedLines.map(([label, value]) => (
                <div key={label} className={styles.row}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.small}>Estimates are not profit. Your result comes only from the sale you record.</p>
          </>
        ) : (
          <p className={styles.muted}>Rein Drop didn&apos;t capture an estimate for this item.</p>
        )}
        <div className={styles.actions}>
          {view.dealId && (
            <ButtonLink href={`/deals/${view.dealId}`} variant="text">
              Open the deal
            </ButtonLink>
          )}
          {view.sourceUrl && (
            <ButtonLink href={view.sourceUrl} target="_blank" rel="noopener noreferrer" variant="text">
              Original listing<span className="visually-hidden"> (opens in a new tab)</span> ↗
            </ButtonLink>
          )}
        </div>
      </Card>
    </div>
  );
}

function PurchaseEditor({
  item,
  pending,
  onCancel,
  onSave,
}: {
  item: InventoryItem;
  pending: boolean;
  onCancel: () => void;
  onSave: (update: UpdateInventoryItemRequest | null, costs: ReplacePurchaseCostsRequest | null) => void;
}) {
  const [form, setForm] = useState<PurchaseForm>(() => purchaseFormDefaults(item));
  const [errors, setErrors] = useState<PurchaseFormErrors>({});
  const set = (patch: Partial<PurchaseForm>) => setForm((f) => ({ ...f, ...patch }));
  const currency = item.purchase.price.currency;

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        // "Now" for validation is the submit time, not render time.
        const built = buildPurchaseUpdate(form, item, new Date());
        if (!built.ok) return setErrors(built.errors);
        setErrors({});
        if (!built.update && !built.costs) return onCancel();
        onSave(built.update, built.costs);
      }}
    >
      <TextInput label="Name" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} error={errors.title} />
      <TextInput label="What you paid" kind="money" currency={currency} value={form.price} onChange={(e) => set({ price: e.target.value })} error={errors.price} />
      <TextInput label="Bought on" kind="date" value={form.day} onChange={(e) => set({ day: e.target.value })} error={errors.day} />
      <CostRows
        legend="Purchase costs"
        hint="Tax, shipping to you, repairs, cleaning - anything it cost to get it ready."
        rows={form.costs}
        labels={PURCHASE_COST_LABEL}
        currency={currency}
        errors={errors.costs}
        disabled={pending}
        onChange={(costs) => set({ costs })}
      />
      <label className={styles.select}>
        Notes (optional)
        <textarea value={form.notes} maxLength={1000} rows={3} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <div className={styles.actions}>
        <Button type="submit" loading={pending}>
          Save purchase
        </Button>
        <Button variant="text" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
