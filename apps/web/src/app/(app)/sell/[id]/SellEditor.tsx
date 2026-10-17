"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { MarketplaceKey, RecordSaleRequest, SellDraftSuggestion, SellListing, SellMarketplacesResponse } from "@rein-drop/api-client";
import {
  applyDraft,
  buildListingSoldRequest,
  buildSellUpdate,
  channelView,
  draftWouldReplace,
  formatMoney,
  inventoryStatusLabel,
  LISTING_CONDITION_OPTIONS,
  listingSoldDoneText,
  listingSoldFormDefaults,
  listingSoldWhereOptions,
  MARKETPLACE_NAME,
  removeManuallyView,
  saleCostLabels,
  SELL_LISTING_STATUS_LABEL,
  sellFormFrom,
  withTranslator,
  type HuntFormContext,
  type ListingSoldErrors,
  type ListingSoldForm,
  type PlainContext,
  type SellForm,
} from "@rein-drop/client-core";
import { Badge, Button, Card, ChoiceGroup, SystemBanner, TextInput } from "@/components/ui";
import { MarketplaceName } from "@/components/MarketplaceName";
import { itemHref, sellHref } from "@/sell/routes";
import {
  addSourcePhoto,
  confirmPosted,
  discardListing,
  draftListing,
  endChannel,
  markListingSold,
  restoreListing,
  publishListing,
  removePhoto,
  reorderPhotos,
  saveListing,
  uploadPhoto,
  type SellActionResult,
} from "../actions";
import { CostRows } from "../items/CostRows";
import styles from "../sell.module.css";

const TITLE_MAX = 80;

/**
 * The listing editor (decision 0019): write it yourself or "Use AI" (a suggestion that fills the
 * form - everything stays editable), photos (yours, the original listing's, or both; any can be
 * the cover), then pick marketplaces and publish. eBay is simulated for now; Facebook is assisted.
 */
export function SellEditor({
  initial,
  marketplaces,
  context: plain,
  purchasedAt,
  today,
}: {
  initial: SellListing;
  marketplaces: SellMarketplacesResponse;
  context: PlainContext;
  /** The item's purchase date (a sale can't be before it), when known. */
  purchasedAt?: string;
  today: string;
}) {
  const context = withTranslator(plain);
  const { t, localeTag } = context;
  const [listing, setListing] = useState(initial);
  const [lifecycle, setLifecycle] = useState<"none" | "sold" | "discard">("none");
  const [form, setForm] = useState<SellForm>(() => sellFormFrom(initial));
  const [dirty, setDirty] = useState(false);
  const [priceError, setPriceError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<SellDraftSuggestion | null>(null);
  const [askReplace, setAskReplace] = useState<SellDraftSuggestion | null>(null);
  const [notes, setNotes] = useState("");
  const [chosen, setChosen] = useState<MarketplaceKey[]>(marketplaces.items.map((m) => m.marketplace));
  const [postedUrl, setPostedUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const status = SELL_LISTING_STATUS_LABEL[listing.status];
  // The item's currency (the API refuses any other); never a hard-coded one.
  const currency = listing.currency;

  const edit = (patch: Partial<SellForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  const act = (label: string, call: () => Promise<SellActionResult>, done?: string, keepForm = true) => {
    setBusy(label);
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const r = await call();
      setBusy(null);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setListing(r.listing);
      if (!keepForm) setForm(sellFormFrom(r.listing));
      if (done) setNotice(done);
    });
  };

  const save = (then?: () => void) => {
    const built = buildSellUpdate(form, currency);
    if (!built.ok) {
      setPriceError(built.message);
      return;
    }
    setPriceError(undefined);
    setBusy("save");
    startTransition(async () => {
      setError(null);
      const r = await saveListing(listing.id, built.request);
      setBusy(null);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setListing(r.listing);
      setDirty(false);
      setNotice("Saved.");
      then?.();
    });
  };

  const askAi = () => {
    setBusy("ai");
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const r = await draftListing(listing.id, notes);
      setBusy(null);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      if (draftWouldReplace(form)) setAskReplace(r.draft);
      else take(r.draft, false);
    });
  };

  const take = (suggestion: SellDraftSuggestion, replace: boolean) => {
    setForm((f) => applyDraft(f, suggestion, replace));
    setDraft(suggestion);
    setAskReplace(null);
    setDirty(true);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("upload");
    setError(null);
    for (const file of [...files]) {
      const data = new FormData();
      data.set("photo", file);
      const r = await uploadPhoto(listing.id, data);
      if (!r.ok) {
        setError(`${file.name}: ${r.message}`);
        break;
      }
      setListing(r.listing);
    }
    setBusy(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const makeCover = (photoId: string) =>
    act("cover", () => reorderPhotos(listing.id, [photoId, ...listing.photos.filter((p) => p.id !== photoId).map((p) => p.id)]), "Cover photo changed.");

  const publish = () => save(() => act("publish", () => publishListing(listing.id, chosen), "Published. See where it's listed below."));

  const sold = (request: RecordSaleRequest) => {
    // Other marketplaces where it was live or waiting: the API ends them with the sale.
    const endedOthers = listing.channels.filter((c) => (c.status === "PUBLISHED" || c.status === "AWAITING_CONFIRMATION") && c.marketplace !== request.marketplace).length;
    setBusy("sold");
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const r = await markListingSold(listing.id, request);
      setBusy(null);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setListing(r.sold.listing);
      setLifecycle("none");
      setNotice(listingSoldDoneText(endedOthers, t));
    });
  };

  const removal = removeManuallyView(listing.removeManually, t);
  const itemStatus = inventoryStatusLabel(listing.itemStatus, t);
  // Publishing only while the item is held and the listing isn't discarded.
  const canPublish = listing.canSell && listing.status !== "DISCARDED";

  return (
    <div className={styles.stack}>
      <Link href={sellHref("listed", listing.status === "PUBLISHED" ? "active" : listing.status === "DISCARDED" ? "discarded" : "drafts")} className={styles.back}>
        ← Sell
      </Link>
      <div className={styles.badges}>
        <Badge tone={status.tone}>{status.label}</Badge>
        {listing.itemStatus !== "IN_STOCK" && listing.itemStatus !== "LISTED" && <Badge tone={itemStatus.tone}>Item: {itemStatus.label}</Badge>}
        {listing.aiAssisted && <Badge tone="info">Written with AI - check it</Badge>}
      </div>
      <h1 className={styles.title}>{listing.title || "New listing"}</h1>
      {listing.sale && (
        <p className={styles.small}>
          Sold for {formatMoney(listing.sale.price, localeTag)} on {new Intl.DateTimeFormat(localeTag, { dateStyle: "medium" }).format(new Date(listing.sale.soldAt))}
          {listing.sale.marketplace ? ` · ${MARKETPLACE_NAME[listing.sale.marketplace]}` : ""}
        </p>
      )}
      <Link href={itemHref(listing.inventoryItemId)} className={styles.back}>
        The item: costs, actions and history →
      </Link>

      {removal && (
        <SystemBanner
          tone="warning"
          title={removal.title}
          message={removal.body}
          action={
            <span className={styles.badges}>
              {[...new Set(listing.removeManually)].map((m) => (
                <Button key={m} variant="secondary" loading={busy === `removed-${m}`} onClick={() => act(`removed-${m}`, () => endChannel(listing.id, m), "Thanks - noted that it's off the marketplace.")}>
                  {removal.doneLabel}
                  <span className="visually-hidden"> on {MARKETPLACE_NAME[m]}</span>
                </Button>
              ))}
            </span>
          }
        />
      )}

      {/* ---------- Sold / discard / restore (nothing is deleted) ---------- */}
      {(listing.canSell || listing.canDiscard || listing.status === "DISCARDED") && (
        <div className={styles.badges}>
          {canPublish && (
            <Button variant={lifecycle === "sold" ? "secondary" : "primary"} aria-expanded={lifecycle === "sold"} disabled={pending} onClick={() => setLifecycle(lifecycle === "sold" ? "none" : "sold")}>
              {t("sell.markSold")}
            </Button>
          )}
          {listing.canDiscard && (
            <Button variant="text" aria-expanded={lifecycle === "discard"} disabled={pending} onClick={() => setLifecycle(lifecycle === "discard" ? "none" : "discard")}>
              {t("sell.discard")}
            </Button>
          )}
          {listing.status === "DISCARDED" && (
            <Button variant="secondary" loading={busy === "restore"} onClick={() => act("restore", () => restoreListing(listing.id), t("sell.doneRestored"), false)}>
              {t("sell.restore")}
            </Button>
          )}
        </div>
      )}
      {lifecycle === "discard" && listing.canDiscard && (
        <div role="group" aria-label={t("sell.discard")} className={styles.confirm}>
          <p>{t("sell.discardConfirm")}</p>
          <div className={styles.badges}>
            <Button
              variant="destructive"
              loading={busy === "discard"}
              onClick={() => {
                setLifecycle("none");
                act("discard", () => discardListing(listing.id), t("sell.doneDiscarded"));
              }}
            >
              {t("sell.discard")}
            </Button>
            <Button variant="text" onClick={() => setLifecycle("none")}>
              {t("inventory.keepIt")}
            </Button>
          </div>
        </div>
      )}
      {lifecycle === "sold" && canPublish && (
        <ListingSoldPanel listing={listing} context={context} today={today} purchasedAt={purchasedAt} pending={busy === "sold"} onCancel={() => setLifecycle("none")} onSubmit={sold} />
      )}

      {error && <SystemBanner tone="error" title="That didn't work" message={error} />}
      <p role="status" aria-live="polite" className={styles.small}>
        {notice}
      </p>

      {/* ---------- Write it (or let AI draft it) ---------- */}
      <Card title="Write the listing">
        <div className={styles.aiRow}>
          <TextInput label="Anything the AI should know? (optional)" value={notes} maxLength={500} placeholder="e.g. battery 89%, small scratch on the back, comes with box" onChange={(e) => setNotes(e.target.value)} />
          <Button variant="secondary" loading={busy === "ai"} disabled={!marketplaces.ai} onClick={askAi}>
            Use AI
          </Button>
        </div>
        {!marketplaces.ai && <p className={styles.small}>AI drafts aren&apos;t set up here yet - write it yourself.</p>}
        {askReplace && (
          <SystemBanner
            tone="info"
            title="Replace what you've written?"
            message="The AI draft is ready. Replace your text, or only fill the empty fields."
            action={
              <span className={styles.badges}>
                <Button variant="secondary" onClick={() => take(askReplace, true)}>
                  Replace
                </Button>
                <Button variant="text" onClick={() => take(askReplace, false)}>
                  Only fill empty fields
                </Button>
              </span>
            }
          />
        )}
        {draft && (
          <SystemBanner
            tone="info"
            title="Filled in from the AI draft - edit anything"
            message={[draft.suggestedPrice ? `Suggested price from the resale estimate: ${formatMoney(draft.suggestedPrice.amount, localeTag)} (an estimate, not a guarantee).` : "No resale estimate for this item - set your own price.", ...draft.checks].join(" ")}
          />
        )}

        <TextInput label="Title" value={form.title} maxLength={TITLE_MAX} hint={`${form.title.length} / ${TITLE_MAX}`} onChange={(e) => edit({ title: e.target.value })} />
        <ChoiceGroup legend="Condition" options={LISTING_CONDITION_OPTIONS} value={form.condition ?? ("" as never)} onChange={(condition) => edit({ condition })} />
        <TextInput label="Your price" kind="money" currency={currency} value={form.price} error={priceError} onChange={(e) => edit({ price: e.target.value })} />
        <div className={styles.field}>
          <label htmlFor={descriptionId} className={styles.label}>
            Description
          </label>
          <textarea id={descriptionId} className={styles.textarea} rows={8} maxLength={4000} value={form.description} onChange={(e) => edit({ description: e.target.value })} />
        </div>
        <fieldset className={styles.specifics}>
          <legend className={styles.label}>Item details</legend>
          {form.itemSpecifics.map((s, i) => (
            <div key={i} className={styles.specificRow}>
              <TextInput label="Name" value={s.name} maxLength={40} onChange={(e) => edit({ itemSpecifics: form.itemSpecifics.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <TextInput label="Value" value={s.value} maxLength={80} onChange={(e) => edit({ itemSpecifics: form.itemSpecifics.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
              <Button variant="text" aria-label={`Remove ${s.name || "detail"}`} onClick={() => edit({ itemSpecifics: form.itemSpecifics.filter((_, j) => j !== i) })}>
                Remove
              </Button>
            </div>
          ))}
          {form.itemSpecifics.length < 12 && (
            <Button variant="text" onClick={() => edit({ itemSpecifics: [...form.itemSpecifics, { name: "", value: "" }] })}>
              Add a detail
            </Button>
          )}
        </fieldset>
        <div className={styles.badges}>
          <Button variant="secondary" loading={busy === "save"} disabled={!dirty} onClick={() => save()}>
            Save
          </Button>
          {dirty && <span className={styles.small}>Unsaved changes</span>}
        </div>
      </Card>

      {/* ---------- Photos ---------- */}
      <Card title="Photos" action={<span className={styles.small}>{listing.photos.length} / 12 · the first is the cover</span>}>
        {listing.photos.length === 0 && <p className={styles.small}>No photos yet. Add your own, use the original listing&apos;s, or mix both.</p>}
        <ul className={styles.photos}>
          {listing.photos.map((p, i) => (
            <li key={p.id} className={styles.photo}>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed / external photo URLs */}
              <img src={p.url} alt={`Photo ${i + 1}${i === 0 ? " (cover)" : ""}`} className={styles.thumb} />
              <div className={styles.photoBar}>
                {i === 0 ? <Badge tone="action">Cover</Badge> : <Button variant="text" disabled={pending} onClick={() => makeCover(p.id)}>Make cover</Button>}
                {p.source === "source" && <Badge tone="neutral">Original listing</Badge>}
                <Button variant="text" aria-label={`Remove photo ${i + 1}`} disabled={pending} onClick={() => act("remove", () => removePhoto(listing.id, p.id))}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {marketplaces.uploads ? (
          <div className={styles.badges}>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden onChange={(e) => void upload(e.target.files)} />
            <Button variant="secondary" loading={busy === "upload"} disabled={listing.photos.length >= 12} onClick={() => fileInput.current?.click()}>
              Add your photos
            </Button>
            <span className={styles.small}>JPEG, PNG, WebP or HEIC, up to 8 MB each.</span>
          </div>
        ) : (
          <p className={styles.small}>Uploading your own photos isn&apos;t available here yet.</p>
        )}
        {listing.sourcePhotos.length > 0 && (
          <div className={styles.stack}>
            <h4 className={styles.label}>From the original listing</h4>
            <ul className={styles.photos}>
              {listing.sourcePhotos.map((url, i) => (
                <li key={url} className={styles.photo}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- external marketplace photo */}
                  <img src={url} alt={`Original listing photo ${i + 1}`} className={styles.thumb} />
                  <div className={styles.photoBar}>
                    <Button variant="text" disabled={pending || listing.photos.length >= 12} onClick={() => act("source", () => addSourcePhoto(listing.id, url))}>
                      Add
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <p className={styles.small}>These photos were taken by the original seller. Some marketplaces reject photos reused from other listings - your own photos are safest.</p>
          </div>
        )}
      </Card>

      {/* ---------- Where to list ---------- */}
      {canPublish && (
      <Card title="Where to list">
        <ChoiceGroup
          multiple
          legend="Marketplaces"
          options={marketplaces.items.map((m) => ({ value: m.marketplace, label: m.label, icon: <MarketplaceName marketplace={m.marketplace} size={18} showName={false} /> }))}
          value={chosen}
          onChange={setChosen}
        />
        <ul className={styles.notes}>
          {marketplaces.items.map((m) => (
            <li key={m.marketplace}>
              <strong>{m.label}:</strong> {m.note}
            </li>
          ))}
        </ul>
        {listing.missing.length > 0 && (
          <SystemBanner tone="info" title="Before you can publish" message={listing.missing.join(" · ")} />
        )}
        <div className={styles.badges}>
          <Button loading={busy === "publish" || busy === "save"} disabled={chosen.length === 0} onClick={publish}>
            {listing.status === "PUBLISHED" ? "Publish to more marketplaces" : "Publish"}
          </Button>
        </div>
      </Card>
      )}

      {listing.channels.length > 0 && (
        <Card title="Where it's listed">
          <ul className={styles.channels}>
            {listing.channels.map((c) => {
              const v = channelView(c, localeTag);
              return (
                <li key={c.marketplace} className={styles.channel}>
                  <div className={styles.badges}>
                    <strong><MarketplaceName marketplace={c.marketplace} size={18} /></strong>
                    <Badge tone={v.tone}>{v.label}</Badge>
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noreferrer">
                        Open listing ↗
                      </a>
                    )}
                  </div>
                  {v.detail && <p className={styles.small}>{v.detail}</p>}
                  {v.awaiting && c.assist && (
                    <div className={styles.stack}>
                      <textarea readOnly className={styles.textarea} rows={6} value={c.assist.text} aria-label={`Text to paste on ${v.name}`} />
                      <div className={styles.badges}>
                        <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(c.assist!.text).then(() => setNotice("Copied - paste it on Facebook."))}>
                          Copy text
                        </Button>
                        <a className={styles.linkButton} href={c.assist.openUrl} target="_blank" rel="noreferrer">
                          <span aria-hidden><MarketplaceName marketplace={c.marketplace} showName={false} /></span> Open {v.name} ↗
                        </a>
                      </div>
                      <TextInput label="Link to your listing (optional)" value={postedUrl} placeholder="https://www.facebook.com/marketplace/item/..." onChange={(e) => setPostedUrl(e.target.value)} />
                      <Button variant="secondary" loading={busy === `confirm-${c.marketplace}`} onClick={() => act(`confirm-${c.marketplace}`, () => confirmPosted(listing.id, c.marketplace, postedUrl), "Marked as posted.")}>
                        I&apos;ve posted it
                      </Button>
                    </div>
                  )}
                  {v.canEnd && (
                    <Button variant="text" loading={busy === `end-${c.marketplace}`} onClick={() => act(`end-${c.marketplace}`, () => endChannel(listing.id, c.marketplace), `Taken down on ${v.name}.`)}>
                      {c.mode === "assisted" ? "I've taken it down" : "Take it down"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** "Sold on eBay for $X": price, date, where (one of the listing's marketplaces or elsewhere), fees. */
function ListingSoldPanel({
  listing,
  context,
  today,
  purchasedAt,
  pending,
  onCancel,
  onSubmit,
}: {
  listing: SellListing;
  context: HuntFormContext;
  today: string;
  purchasedAt?: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (request: RecordSaleRequest) => void;
}) {
  const { t } = context;
  const [form, setForm] = useState<ListingSoldForm>(() => listingSoldFormDefaults(listing, new Date(today)));
  const [errors, setErrors] = useState<ListingSoldErrors>({});
  const set = (patch: Partial<ListingSoldForm>) => setForm((f) => ({ ...f, ...patch }));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <form
      noValidate
      aria-labelledby="listing-sold-title"
      className={styles.confirm}
      onSubmit={(e) => {
        e.preventDefault();
        const built = buildListingSoldRequest(form, listing, new Date(), t, purchasedAt);
        if (!built.ok) return setErrors(built.errors);
        setErrors({});
        onSubmit(built.request);
      }}
    >
      <h2 id="listing-sold-title" ref={heading} tabIndex={-1} className={styles.label}>
        {t("sell.markSold")}
      </h2>
      <p className={styles.small}>Recording the sale ends this listing everywhere else, so nobody else buys it.</p>
      <TextInput label={t("inventory.formSoldFor")} kind="money" currency={form.currency} value={form.price} hint={t("inventory.formSoldForHint")} error={errors.price} onChange={(e) => set({ price: e.target.value })} />
      <TextInput label={t("inventory.formSoldOn")} kind="date" value={form.day} error={errors.day} onChange={(e) => set({ day: e.target.value })} />
      <ChoiceGroup legend={t("sell.soldWhere")} options={listingSoldWhereOptions(listing, t)} value={form.where ?? ("" as never)} error={errors.where} onChange={(where) => set({ where })} />
      <CostRows
        legend={t("inventory.saleCosts")}
        hint={t("inventory.saleCostsHint")}
        rows={form.costs}
        labels={saleCostLabels(t)}
        currency={form.currency}
        errors={errors.costs}
        disabled={pending}
        onChange={(costs) => set({ costs })}
      />
      <div className={styles.badges}>
        <Button type="submit" loading={pending}>
          {t("sell.markSold")}
        </Button>
        <Button variant="text" onClick={onCancel} disabled={pending}>
          {t("inventory.cancel")}
        </Button>
      </div>
    </form>
  );
}
