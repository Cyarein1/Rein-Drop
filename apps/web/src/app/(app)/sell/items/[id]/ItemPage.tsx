"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { InventoryEvent, InventoryItem, MarketplaceKey, ReplacePurchaseCostsRequest, UpdateInventoryItemRequest } from "@rein-drop/api-client";
import {
  buildPurchaseUpdate,
  buildReturnRequest,
  buildWriteOffRequest,
  cancelBlockedHint,
  closureView,
  inventoryDetailView,
  itemActionsView,
  MARKETPLACE_NAME,
  purchaseCostLabels,
  purchaseFormDefaults,
  removeManuallyView,
  returnFormDefaults,
  saleResultView,
  sellListingStatusLabel,
  formatMoney,
  timelineView,
  withTranslator,
  writeOffFormDefaults,
  writeOffReasonOptions,
  type HuntFormContext,
  type ItemActionView,
  type PlainContext,
  type PurchaseForm,
  type PurchaseFormErrors,
  type ReturnForm,
  type TimelineRow,
  type WriteOffForm,
} from "@rein-drop/client-core";
import { Badge, Button, ButtonLink, Card, ChoiceGroup, Metric, SystemBanner, TextInput } from "@/components/ui";
import { MarketplaceName } from "@/components/MarketplaceName";
import { itemResultHref, itemSoldHref, listingHref, sectionForItem, sellHref } from "@/sell/routes";
import { startListing } from "../../actions";
import {
  cancelItem,
  confirmRemoved,
  reopenItem,
  returnItem,
  savePurchase,
  setHoldingStatus,
  undoSale,
  writeOffItem,
  type InventoryActionResult,
} from "../actions";
import { CostRows } from "../CostRows";
import styles from "../items.module.css";

type Panel = { kind: "none" } | { kind: "edit" } | { kind: "return" } | { kind: "write_off" } | { kind: "confirm"; action: ItemActionView };

const BUTTON_VARIANT = { primary: "primary", secondary: "secondary", danger: "secondary" } as const;

/**
 * The one item page (decision 0021, step 90/91) for every item, whatever its section: what it is
 * and what it cost, the actions allowed right now (from the API's state machine, `item.actions`),
 * the closed-item card, the "remove it yourself" reminder, and the item's history. Nothing here
 * deletes anything: endings are statuses and every change lands in the history.
 */
export function ItemPage({
  initial,
  initialEvents,
  context: plain,
  today,
  notice: initialNotice,
}: {
  initial: InventoryItem;
  initialEvents: InventoryEvent[] | null;
  context: PlainContext;
  today: string;
  notice: string | null;
}) {
  const context = withTranslator(plain);
  const { t } = context;
  const [item, setItem] = useState(initial);
  const [events, setEvents] = useState(initialEvents);
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialNotice);
  const [pending, startTransition] = useTransition();
  const [listing, startListingTransition] = useTransition();

  const view = inventoryDetailView(item, context);
  const actions = itemActionsView(item, t);
  const blockedHint = cancelBlockedHint(item, t);
  const closure = closureView(item, context);
  const result = saleResultView(item, context);
  const removal = removeManuallyView(item.sellListing?.removeManually ?? [], t);
  const timeline = events ? timelineView(events, context) : null;
  const liveListing = item.sellListing && (item.sellListing.status === "DRAFT" || item.sellListing.status === "PUBLISHED") ? item.sellListing : null;

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
      if (r.events) setEvents(r.events);
      setPanel({ kind: "none" });
      setNotice(done);
    });

  const startList = () =>
    startListingTransition(async () => {
      setError(null);
      // Redirects to the listing editor on success (a discarded draft is restored).
      const r = await startListing(item.id);
      if (!r.ok) setError(r.message);
    });

  const open = (next: Panel) => {
    setError(null);
    setNotice(null);
    setPanel(next);
  };

  const onAction = (a: ItemActionView) => {
    switch (a.action) {
      case "edit_purchase":
        return open({ kind: "edit" });
      case "list_for_sale":
        return startList();
      case "mark_listed":
        return run(() => setHoldingStatus(item.id, "LISTED"), "Marked as listed for sale.");
      case "mark_unlisted":
        return run(() => setHoldingStatus(item.id, "IN_STOCK"), "Back to in stock.");
      case "return":
        return open({ kind: "return" });
      case "write_off":
        return open({ kind: "write_off" });
      default:
        // cancel, reopen, undo_sale: ask first.
        return open({ kind: "confirm", action: a });
    }
  };

  const confirmed = (a: ItemActionView) => {
    switch (a.action) {
      case "cancel":
        return run(() => cancelItem(item.id), t("inventory.doneCancelled"));
      case "reopen":
        return run(() => reopenItem(item.id), t("inventory.doneReopened"));
      case "undo_sale":
        return run(() => undoSale(item.id), t("inventory.doneUndo"));
    }
  };

  return (
    <div className={styles.stack}>
      <Link href={sellHref(sectionForItem(item))} className={styles.back}>
        ← Sell
      </Link>
      <div className={styles.badges}>
        <Badge tone={view.status.tone}>{view.status.label}</Badge>
        {view.marketplace && <MarketplaceName marketplace={view.marketplace} size={18} />}
        {item.origin === "manual" && <Badge tone="neutral">{t("inventory.addedByYou")}</Badge>}
      </div>
      <h1 className={styles.title}>{view.title}</h1>
      <p className={styles.meta}>
        {view.purchasedOn} · {view.held}
        {item.boughtFrom && (item.boughtFrom.text || item.boughtFrom.marketplace) && (
          <> · {t("inventory.boughtFrom", { where: item.boughtFrom.text ?? MARKETPLACE_NAME[item.boughtFrom.marketplace!] })}</>
        )}
      </p>

      <PriceSummary item={item} context={context} cost={view.cost} result={view.result} />

      {removal && item.sellListing && (
        <SystemBanner
          tone="warning"
          title={removal.title}
          message={removal.body}
          action={
            <span className={styles.actions}>
              {[...new Set(item.sellListing.removeManually)].map((m: MarketplaceKey) => (
                <Button key={m} variant="secondary" loading={pending} onClick={() => run(() => confirmRemoved(item.id, item.sellListing!.id, m), "Thanks - noted that it's off the marketplace.")}>
                  {removal.doneLabel}
                  <span className="visually-hidden"> on {MARKETPLACE_NAME[m]}</span>
                </Button>
              ))}
            </span>
          }
        />
      )}

      {/* ---------- What you can do now (from the API's state machine) ---------- */}
      <section aria-labelledby="item-actions" className={styles.stack}>
        <h2 id="item-actions" className="visually-hidden">
          Actions
        </h2>
        <div className={styles.actions}>
          {actions.map((a) => {
            if (a.action === "mark_sold" || a.action === "correct_sale") {
              return (
                <ButtonLink key={a.action} href={itemSoldHref(item.id)} variant={BUTTON_VARIANT[a.tone]}>
                  {a.label}
                </ButtonLink>
              );
            }
            if (a.action === "list_for_sale" && liveListing) {
              return (
                <ButtonLink key={a.action} href={listingHref(liveListing.id)} variant="secondary">
                  Open listing
                </ButtonLink>
              );
            }
            const expanded = (panel.kind === "confirm" && panel.action.action === a.action) || panel.kind === a.action || (panel.kind === "edit" && a.action === "edit_purchase");
            return (
              <Button
                key={a.action}
                variant={BUTTON_VARIANT[a.tone]}
                loading={(a.action === "list_for_sale" && listing) || (pending && (a.action === "mark_listed" || a.action === "mark_unlisted"))}
                disabled={pending && !(a.action === "mark_listed" || a.action === "mark_unlisted")}
                aria-expanded={a.confirm || a.action === "return" || a.action === "write_off" || a.action === "edit_purchase" ? expanded : undefined}
                onClick={() => onAction(a)}
              >
                {a.label}
              </Button>
            );
          })}
          {result && (
            <ButtonLink href={itemResultHref(item.id)} variant="text">
              {t("inventory.seeResult")}
            </ButtonLink>
          )}
        </div>
        {blockedHint && <p className={styles.small}>{blockedHint}</p>}

        {panel.kind === "confirm" && panel.action.confirm && (
          <ConfirmPanel
            confirm={panel.action.confirm}
            danger={panel.action.tone === "danger"}
            pending={pending}
            onConfirm={() => confirmed(panel.action)}
            onCancel={() => setPanel({ kind: "none" })}
          />
        )}
        {panel.kind === "return" && (
          <ReturnPanel item={item} context={context} today={today} pending={pending} onCancel={() => setPanel({ kind: "none" })} onSubmit={(request) => run(() => returnItem(item.id, request), t("inventory.doneReturned"))} />
        )}
        {panel.kind === "write_off" && (
          <WriteOffPanel item={item} context={context} today={today} pending={pending} onCancel={() => setPanel({ kind: "none" })} onSubmit={(request) => run(() => writeOffItem(item.id, request), t("inventory.doneWrittenOff"))} />
        )}

        {error && <SystemBanner tone="error" title={t("inventory.actionFailed")} message={error} />}
        <p role="status" aria-live="polite" className={styles.small}>
          {notice}
        </p>
      </section>

      {/* ---------- Ended without a sale ---------- */}
      {closure && (
        <Card title={closure.headline}>
          {closure.lines.length > 0 && (
            <dl className={styles.rows}>
              {closure.lines.map(([label, value]) => (
                <div key={label} className={styles.row}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {closure.result && <Metric label={closure.result.label} value={closure.result.value} tone={closure.result.tone} />}
          {closure.note && <p>{closure.note}</p>}
          <p className={styles.small}>{closure.explanation}</p>
        </Card>
      )}

      {/* ---------- Sale ---------- */}
      {result && item.sale && (
        <Card title={t("inventory.saleCard")}>
          <Metric label={result.headline} value={result.value} tone={result.tone} caption={result.summary ?? undefined} />
          {item.sale.marketplace && (
            <p className={styles.small}>
              Sold on <MarketplaceName marketplace={item.sale.marketplace} size={16} />
            </p>
          )}
        </Card>
      )}

      {/* ---------- Its listing ---------- */}
      {item.sellListing && <ListingCard listing={item.sellListing} context={context} />}

      {/* ---------- Purchase ---------- */}
      <Card title={t("inventory.purchaseCard")}>
        {panel.kind === "edit" ? (
          <PurchaseEditor
            item={item}
            context={context}
            pending={pending}
            onCancel={() => setPanel({ kind: "none" })}
            onSave={(update, costs) => run(() => savePurchase(item.id, update, costs), t("inventory.donePurchase"))}
          />
        ) : (
          <>
            <dl className={styles.rows}>
              {view.purchaseLines.map(([label, value], i) => (
                <div key={`${label}-${i}`} className={[styles.row, i === view.purchaseLines.length - 1 && item.purchase.costs.length > 0 ? styles.total : ""].join(" ")}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {item.purchase.costs.length === 0 && item.actions.includes("edit_purchase") && <p className={styles.small}>{t("inventory.noExtraCosts")}</p>}
            {view.notes && <p>{view.notes}</p>}
          </>
        )}
      </Card>

      {/* ---------- Expected (frozen at Bought) ---------- */}
      {(view.expectedLines.length > 0 || view.dealId || view.sourceUrl) && (
        <Card title={t("inventory.whenBought")}>
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
              <p className={styles.small}>{t("inventory.estimatesNotProfit")}</p>
            </>
          ) : (
            <p className={styles.muted}>{t("inventory.noEstimate")}</p>
          )}
          <div className={styles.actions}>
            {view.dealId && (
              <ButtonLink href={`/deals/${view.dealId}`} variant="text">
                {t("inventory.openDeal")}
              </ButtonLink>
            )}
            {view.sourceUrl && (
              <ButtonLink href={view.sourceUrl} target="_blank" rel="noopener noreferrer" variant="text">
                Original listing<span className="visually-hidden"> (opens in a new tab)</span> ↗
              </ButtonLink>
            )}
          </div>
        </Card>
      )}

      {/* ---------- History (the audit trail) ---------- */}
      <Card title={t("inventory.timelineTitle")}>
        {timeline ? <Timeline rows={timeline} /> : <p className={styles.muted}>The history couldn&apos;t be loaded. Refresh the page to try again.</p>}
      </Card>
    </div>
  );
}

/** Cost, asking price, sale, result - the figures that matter at a glance. */
function PriceSummary({ item, context, cost, result }: { item: InventoryItem; context: HuntFormContext; cost: string; result: { label: string; value: string; tone: string } | null }) {
  const fmt = (m: Parameters<typeof formatMoney>[0]) => formatMoney(m, context.localeTag);
  return (
    <dl className={styles.summary}>
      <div>
        <dt>Cost</dt>
        <dd>{item.purchase.total ? fmt(item.purchase.total) : cost}</dd>
      </div>
      {item.holding && item.sellListing?.price && (
        <div>
          <dt>Your asking price</dt>
          <dd>{fmt(item.sellListing.price)}</dd>
        </div>
      )}
      {item.sale && (
        <div>
          <dt>Sold for</dt>
          <dd>{fmt(item.sale.price)}</dd>
        </div>
      )}
      {result && (
        <div>
          <dt>{result.label}</dt>
          <dd className={result.tone === "profit" ? styles.profit : result.tone === "loss" ? styles.loss : undefined}>{result.value}</dd>
        </div>
      )}
    </dl>
  );
}

function ListingCard({ listing, context }: { listing: NonNullable<InventoryItem["sellListing"]>; context: HuntFormContext }) {
  const status = sellListingStatusLabel(listing.status, context.t);
  return (
    <Card
      title="Listing"
      action={
        <ButtonLink href={listingHref(listing.id)} variant="text">
          Open listing
        </ButtonLink>
      }
    >
      <div className={styles.badges}>
        <Badge tone={status.tone}>{status.label}</Badge>
        {listing.price && <span className={styles.small}>{formatMoney(listing.price, context.localeTag)}</span>}
      </div>
      {listing.channels.length > 0 ? (
        <ul className={styles.rows}>
          {listing.channels.map((c) => (
            <li key={c.marketplace} className={styles.row}>
              <MarketplaceName marketplace={c.marketplace} size={16} />
              <span className={styles.small}>{CHANNEL_STATUS[c.status]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.small}>Not on any marketplace yet.</p>
      )}
    </Card>
  );
}

const CHANNEL_STATUS = { PUBLISHED: "Live", AWAITING_CONFIRMATION: "Waiting for you to post it", FAILED: "Didn't publish", ENDED: "Ended" } as const;

function Timeline({ rows }: { rows: TimelineRow[] }) {
  if (rows.length === 0) return <p className={styles.muted}>Nothing recorded yet.</p>;
  const tone = { profit: styles.eventProfit, loss: styles.eventLoss, info: styles.eventInfo, neutral: "" } as const;
  return (
    <ol className={styles.timeline} aria-label="Item history, newest first">
      {rows.map((row) => (
        <li key={row.id} className={[styles.event, tone[row.tone]].join(" ")}>
          <span className={styles.eventTitle}>{row.title}</span>
          {row.details.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
          <span className={styles.small}>{row.when}</span>
        </li>
      ))}
    </ol>
  );
}

/** Moves focus to a panel's heading when it opens, so keyboard and screen-reader users land in it. */
function usePanelFocus() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}

function ConfirmPanel({
  confirm,
  danger,
  pending,
  onConfirm,
  onCancel,
}: {
  confirm: NonNullable<ItemActionView["confirm"]>;
  danger: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const heading = usePanelFocus();
  return (
    <div role="group" aria-labelledby="confirm-title" className={[styles.panel, danger ? styles.panelDanger : ""].join(" ")}>
      <h3 id="confirm-title" ref={heading} tabIndex={-1} className={styles.panelTitle}>
        {confirm.title}
      </h3>
      <p>{confirm.body}</p>
      <div className={styles.actions}>
        <Button variant={danger ? "destructive" : "primary"} loading={pending} onClick={onConfirm}>
          {confirm.confirmLabel}
        </Button>
        <Button variant="text" onClick={onCancel} disabled={pending}>
          {confirm.cancelLabel}
        </Button>
      </div>
    </div>
  );
}

function ReturnPanel({
  item,
  context,
  today,
  pending,
  onCancel,
  onSubmit,
}: {
  item: InventoryItem;
  context: HuntFormContext;
  today: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (request: Parameters<typeof returnItem>[1]) => void;
}) {
  const { t } = context;
  const heading = usePanelFocus();
  const [form, setForm] = useState<ReturnForm>(() => returnFormDefaults(item, new Date(today)));
  const [errors, setErrors] = useState<Partial<Record<"refund" | "day", string>>>({});
  const set = (patch: Partial<ReturnForm>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <form
      noValidate
      aria-labelledby="return-title"
      className={[styles.panel, styles.panelDanger].join(" ")}
      onSubmit={(e) => {
        e.preventDefault();
        const built = buildReturnRequest(form, item, new Date(), t);
        if (!built.ok) return setErrors(built.errors);
        setErrors({});
        onSubmit(built.request);
      }}
    >
      <h3 id="return-title" ref={heading} tabIndex={-1} className={styles.panelTitle}>
        {t("inventory.confirmReturnTitle")}
      </h3>
      <p>{t("inventory.confirmReturnBody")}</p>
      <TextInput
        label={t("inventory.formRefund")}
        kind="money"
        currency={item.purchase.price.currency}
        value={form.refund}
        hint={t("inventory.formRefundHint")}
        error={errors.refund}
        onChange={(e) => set({ refund: e.target.value })}
      />
      <TextInput label={t("inventory.formReturnedOn")} kind="date" value={form.day} error={errors.day} onChange={(e) => set({ day: e.target.value })} />
      <TextInput label={t("inventory.formCloseNote")} value={form.note} maxLength={500} onChange={(e) => set({ note: e.target.value })} />
      <div className={styles.actions}>
        <Button type="submit" variant="destructive" loading={pending}>
          {t("inventory.actionReturn")}
        </Button>
        <Button variant="text" onClick={onCancel} disabled={pending}>
          {t("inventory.keepIt")}
        </Button>
      </div>
    </form>
  );
}

function WriteOffPanel({
  item,
  context,
  today,
  pending,
  onCancel,
  onSubmit,
}: {
  item: InventoryItem;
  context: HuntFormContext;
  today: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (request: Parameters<typeof writeOffItem>[1]) => void;
}) {
  const { t } = context;
  const heading = usePanelFocus();
  const [form, setForm] = useState<WriteOffForm>(() => writeOffFormDefaults(new Date(today)));
  const [errors, setErrors] = useState<Partial<Record<"day", string>>>({});
  const set = (patch: Partial<WriteOffForm>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <form
      noValidate
      aria-labelledby="write-off-title"
      className={[styles.panel, styles.panelDanger].join(" ")}
      onSubmit={(e) => {
        e.preventDefault();
        const built = buildWriteOffRequest(form, item, new Date(), t);
        if (!built.ok) return setErrors(built.errors);
        setErrors({});
        onSubmit(built.request);
      }}
    >
      <h3 id="write-off-title" ref={heading} tabIndex={-1} className={styles.panelTitle}>
        {t("inventory.confirmWriteOffTitle")}
      </h3>
      <p>{t("inventory.confirmWriteOffBody")}</p>
      <ChoiceGroup legend={t("inventory.formReason")} options={writeOffReasonOptions(t)} value={form.reason ?? ("" as never)} onChange={(reason) => set({ reason })} />
      <TextInput label={t("inventory.formWrittenOffOn")} kind="date" value={form.day} error={errors.day} onChange={(e) => set({ day: e.target.value })} />
      <TextInput label={t("inventory.formCloseNote")} value={form.note} maxLength={500} onChange={(e) => set({ note: e.target.value })} />
      <div className={styles.actions}>
        <Button type="submit" variant="destructive" loading={pending}>
          {t("inventory.actionWriteOff")}
        </Button>
        <Button variant="text" onClick={onCancel} disabled={pending}>
          {t("inventory.keepIt")}
        </Button>
      </div>
    </form>
  );
}

function PurchaseEditor({
  item,
  context,
  pending,
  onCancel,
  onSave,
}: {
  item: InventoryItem;
  context: HuntFormContext;
  pending: boolean;
  onCancel: () => void;
  onSave: (update: UpdateInventoryItemRequest | null, costs: ReplacePurchaseCostsRequest | null) => void;
}) {
  const { t } = context;
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
        const built = buildPurchaseUpdate(form, item, new Date(), t);
        if (!built.ok) return setErrors(built.errors);
        setErrors({});
        if (!built.update && !built.costs) return onCancel();
        onSave(built.update, built.costs);
      }}
    >
      <TextInput autoFocus label={t("inventory.formName")} value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} error={errors.title} />
      <TextInput label={t("inventory.formPaid")} kind="money" currency={currency} value={form.price} onChange={(e) => set({ price: e.target.value })} error={errors.price} />
      <TextInput label={t("inventory.formBoughtOn")} kind="date" value={form.day} onChange={(e) => set({ day: e.target.value })} error={errors.day} />
      <CostRows
        legend={t("inventory.purchaseCosts")}
        hint={t("inventory.purchaseCostsHint")}
        rows={form.costs}
        labels={purchaseCostLabels(t)}
        currency={currency}
        errors={errors.costs}
        disabled={pending}
        onChange={(costs) => set({ costs })}
      />
      <label className={styles.select}>
        {t("inventory.formNotes")}
        <textarea value={form.notes} maxLength={1000} rows={3} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <div className={styles.actions}>
        <Button type="submit" loading={pending}>
          {t("inventory.savePurchase")}
        </Button>
        <Button variant="text" onClick={onCancel} disabled={pending}>
          {t("inventory.cancel")}
        </Button>
      </div>
    </form>
  );
}
