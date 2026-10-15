"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { DealDetail } from "@rein-drop/api-client";
import {
  boughtFormDefaults,
  buildBoughtRequest,
  buildIgnoreRequest,
  CONFIDENCE_LABEL,
  dealActions,
  dealDetailView,
  IGNORE_REASON_MAX,
  NEXT_STEP_LABEL,
  REASON_EFFECT_LABEL,
  RISK_LEVEL_LABEL,
  SEVERITY_TONE,
  STRENGTH_LABEL,
  type HuntFormContext,
  type PlainContext,
  withTranslator,
} from "@rein-drop/client-core";
import { mascotAssets } from "@/brand/assets";
import { MarketplaceName } from "@/components/MarketplaceName";
import { Badge, Button, ButtonLink, Card, Disclosure, Metric, SystemBanner, TextInput } from "@/components/ui";
import { dealAction, ignoreDeal, markDealBought, type DealActionResult } from "../actions";
import styles from "../deals.module.css";

type Form = "none" | "bought" | "ignore";

/**
 * Deal Detail: why Rein Drop flagged it, the evidence it has (price, risk, the listing's own
 * words, the checks behind the score), View source, and the Save / Ignore / Bought decisions.
 */
export function DealDetailScreen({ initial, context: plain }: { initial: DealDetail; context: PlainContext }) {
  const context = withTranslator(plain);
  const [deal, setDeal] = useState(initial);
  const [form, setForm] = useState<Form>("none");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const view = dealDetailView(deal, context);
  const can = dealActions(deal);

  // Opening the deal marks it seen (best effort - nothing to show if it fails).
  const markedSeen = useRef(false);
  useEffect(() => {
    if (markedSeen.current || initial.matchStatus !== "NEW") return;
    markedSeen.current = true;
    void dealAction(initial.id, "seen").then((r) => r.ok && setDeal(r.deal));
  }, [initial.id, initial.matchStatus]);

  const run = (action: () => Promise<DealActionResult>, done: string) =>
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDeal(result.deal);
      setForm("none");
      setNotice(done);
    });

  const questions = [...new Set([...(deal.why?.questionsForSeller ?? []), ...(deal.risk?.missingInformation.map((m) => m.question) ?? [])])];
  const exceptionalArt = mascotAssets.exceptionalDeal;

  return (
    <div className={styles.hero}>
      <Link href="/deals" className={styles.back}>
        ← All deals
      </Link>

      {view.exceptional && (
        <div className={styles.exceptionalBanner} role="note">
          {/* Only the approved "exceptional deal" mascot (surprised pose) may appear here. */}
          {exceptionalArt && <Image src={exceptionalArt} alt="" width={72} height={Math.round((exceptionalArt.height / exceptionalArt.width) * 72)} />}
          <div>
            <strong>Exceptional deal</strong>
            Rare: the estimate is well above your usual target. Still check the details before you buy.
          </div>
        </div>
      )}

      <div className={styles.badges}>
        {view.strength && <Badge tone={view.strength.tone}>{view.strength.label}</Badge>}
        {view.confidence && <Badge tone="neutral">{view.confidence}</Badge>}
        {view.justDropped && <Badge tone="fresh">Just dropped</Badge>}
        <Badge tone={view.status.tone}>{view.status.label}</Badge>
      </div>
      <h1 className={styles.heroTitle}>{view.title}</h1>
      <p className={styles.meta}>
        <MarketplaceName marketplace={view.marketplace} size={18} /> · {view.freshness} · Hunt: {view.huntName}
      </p>

      {view.sourceNote && (
        <SystemBanner
          tone={view.sourceNote.tone === "loss" ? "warning" : "info"}
          title={view.sourceNote.text}
          message={deal.source.available ? "The listing may have changed since Rein Drop last saw it." : "You can still keep it for reference."}
        />
      )}
      {view.decisions.map((d) => (
        <p key={d} className={styles.small}>
          {d}
        </p>
      ))}
      {deal.decision.inventoryItemId && (
        <ButtonLink href={`/inventory/${deal.decision.inventoryItemId}`} variant="secondary">
          Open in Inventory
        </ButtonLink>
      )}

      {/* ---------- Actions ---------- */}
      <div className={styles.actions}>
        <ButtonLink href={view.url} target="_blank" rel="noopener noreferrer" variant="secondary">
          <span aria-hidden><MarketplaceName marketplace={view.marketplace} showName={false} /></span> View on {view.source}
          <span className="visually-hidden"> (opens in a new tab)</span> ↗
        </ButtonLink>
        {can.canBuy && form !== "bought" && (
          <Button onClick={() => setForm("bought")} disabled={pending}>
            Bought
          </Button>
        )}
        {can.canSave && (
          <Button variant="secondary" loading={pending} onClick={() => run(() => dealAction(deal.id, "save"), "Saved. Find it under Saved.")}>
            Save
          </Button>
        )}
        {can.canUnsave && (
          <Button variant="secondary" loading={pending} onClick={() => run(() => dealAction(deal.id, "unsave"), "Removed from Saved.")}>
            Remove from Saved
          </Button>
        )}
        {can.canIgnore && form !== "ignore" && (
          <Button variant="text" onClick={() => setForm("ignore")} disabled={pending}>
            Ignore
          </Button>
        )}
        {can.canUnignore && (
          <Button variant="text" loading={pending} onClick={() => run(() => dealAction(deal.id, "unignore"), "Back in your deals.")}>
            Undo ignore
          </Button>
        )}
      </div>

      {form === "bought" && (
        <BoughtForm deal={deal} context={context} pending={pending} onCancel={() => setForm("none")} onSubmit={(request) => run(() => markDealBought(deal.id, request), "Marked as bought. It's in your Inventory.")} />
      )}
      {form === "ignore" && (
        <IgnoreForm pending={pending} onCancel={() => setForm("none")} onSubmit={(request) => run(() => ignoreDeal(deal.id, request), "Ignored. It's under Ignored if you change your mind.")} />
      )}
      {error && <SystemBanner tone="error" title="That didn't work" message={error} />}
      {notice && <p role="status" className={styles.small}>{notice}</p>}

      {/* ---------- Why ---------- */}
      <Card title="Why Rein Drop flagged it">
        {deal.assessment.status === "pending" && <p className={styles.muted}>Rein Drop is still analysing this listing. Check back shortly.</p>}
        {deal.assessment.status === "failed" && <p className={styles.muted}>The analysis didn&apos;t finish. Rein Drop will retry automatically.</p>}
        {deal.why && (
          <>
            <div className={styles.item}>
              <Badge tone={NEXT_STEP_LABEL[deal.why.nextStep].tone}>{NEXT_STEP_LABEL[deal.why.nextStep].label}</Badge>
            </div>
            <p className={styles.reason}>{deal.why.headline}</p>
            <p>{deal.why.summary}</p>
            {deal.why.positives.length > 0 && (
              <section aria-label="In its favour">
                <h3 className={styles.small}>In its favour</h3>
                <ul className={styles.bullets}>{deal.why.positives.map((p) => <li key={p}>{p}</li>)}</ul>
              </section>
            )}
            {deal.why.concerns.length > 0 && (
              <section aria-label="Concerns">
                <h3 className={styles.small}>Concerns</h3>
                <ul className={styles.bullets}>{deal.why.concerns.map((p) => <li key={p}>{p}</li>)}</ul>
              </section>
            )}
          </>
        )}
      </Card>

      {/* ---------- Price ---------- */}
      <Card title="Price">
        <dl className={styles.rows}>
          {view.priceLines.map(([label, value]) => (
            <div key={label} className={styles.row}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {view.maxPriceNote && <p>{view.maxPriceNote}</p>}
        <Metric label="Upside" value={view.upside.value} estimated={view.upside.estimated} caption={view.upside.caption} />
        {view.targetNote && <p className={styles.small}>{view.targetNote}</p>}
        {view.notIncluded && <p className={styles.small}>{view.notIncluded}</p>}
      </Card>

      {/* ---------- Risk ---------- */}
      <Card title="Risk and condition">
        {deal.risk ? (
          <>
            <div className={styles.item}>
              <Badge tone={RISK_LEVEL_LABEL[deal.risk.level].tone}>{RISK_LEVEL_LABEL[deal.risk.level].label}</Badge>
              <span className={styles.small}>Condition: {deal.risk.condition.replace("_", " ")}</span>
            </div>
            {deal.risk.factors.length > 0 ? (
              <ul className={styles.rows}>
                {deal.risk.factors.map((f) => (
                  <li key={`${f.code}-${f.note}`} className={styles.item}>
                    <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity}</Badge>
                    {f.note}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.small}>Nothing in the listing raises a concern.</p>
            )}
            <p className={styles.small}>{deal.risk.seller.note}</p>
          </>
        ) : (
          <p className={styles.muted}>Not assessed yet.</p>
        )}
        {questions.length > 0 && (
          <section aria-label="Ask the seller">
            <h3 className={styles.small}>Ask the seller</h3>
            <ul className={styles.bullets}>{questions.map((q) => <li key={q}>{q}</li>)}</ul>
          </section>
        )}
      </Card>

      {/* ---------- Listing ---------- */}
      <Card title="From the listing">
        <dl className={styles.rows}>
          {view.conditionText && (
            <div className={styles.row}>
              <dt>Condition</dt>
              <dd>{view.conditionText}</dd>
            </div>
          )}
          {view.locationText && (
            <div className={styles.row}>
              <dt>Location</dt>
              <dd>{view.locationText}</dd>
            </div>
          )}
        </dl>
        {view.description ? <p className={styles.description}>{view.description}</p> : <p className={styles.muted}>No description.</p>}
      </Card>

      {/* ---------- Scoring ---------- */}
      <Disclosure summary="How Rein Drop scored it">
        <div className={styles.hero}>
          <div className={styles.item}>
            {deal.assessment.strength && <Badge tone={STRENGTH_LABEL[deal.assessment.strength].tone}>{STRENGTH_LABEL[deal.assessment.strength].label}</Badge>}
            {deal.assessment.confidence && <Badge tone="neutral">{CONFIDENCE_LABEL[deal.assessment.confidence]}</Badge>}
          </div>
          {[...deal.strengthReasons, ...deal.confidenceReasons].length > 0 && (
            <ul className={styles.rows}>
              {[...deal.strengthReasons, ...deal.confidenceReasons].map((r) => (
                <li key={`${r.code}-${r.detail}`} className={styles.item}>
                  <Badge tone={REASON_EFFECT_LABEL[r.effect].tone}>{REASON_EFFECT_LABEL[r.effect].label}</Badge>
                  {r.detail}
                </li>
              ))}
            </ul>
          )}
          <h3 className={styles.small}>Your Hunt&apos;s checks</h3>
          <ul className={styles.rows}>
            {view.checks.map((c) => (
              <li key={c.label} className={styles.item}>
                <Badge tone={c.outcome.tone}>{c.outcome.label}</Badge>
                <strong>{c.label}</strong> {c.detail}
              </li>
            ))}
          </ul>
          {view.alertNote && <p className={styles.small}>{view.alertNote}</p>}
        </div>
      </Disclosure>
    </div>
  );
}

function BoughtForm({
  deal,
  context,
  pending,
  onCancel,
  onSubmit,
}: {
  deal: DealDetail;
  context: HuntFormContext;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (request: Parameters<typeof markDealBought>[1]) => void;
}) {
  const defaults = boughtFormDefaults(deal, context);
  const [price, setPrice] = useState(defaults.price);
  const [shipping, setShipping] = useState(defaults.shipping);
  const [error, setError] = useState<{ field?: "price" | "shipping"; message: string } | undefined>();
  return (
    <form
      className={styles.inlineForm}
      onSubmit={(e) => {
        e.preventDefault();
        const built = buildBoughtRequest(price, defaults.currency, deal.price.asking, shipping);
        if (!built.ok) return setError({ field: built.field, message: built.error });
        setError(undefined);
        onSubmit(built.request);
      }}
    >
      <TextInput
        label="What did you pay?"
        kind="money"
        currency={defaults.currency}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        hint={deal.price.asking ? "Starts at the asking price - change it if you paid less or more." : "This listing shows no price."}
        error={error?.field !== "shipping" ? error?.message : undefined}
        autoFocus
      />
      <TextInput
        label="Shipping to you (optional)"
        kind="money"
        currency={defaults.currency}
        value={shipping}
        onChange={(e) => setShipping(e.target.value)}
        hint={defaults.shipping ? "From the listing - change it if it was different." : "Leave empty if you collected it."}
        error={error?.field === "shipping" ? error.message : undefined}
      />
      <p className={styles.small}>It goes into your Inventory, where you can add tax or repairs and mark it sold later.</p>
      <div className={styles.actions}>
        <Button type="submit" loading={pending}>
          Mark as bought
        </Button>
        <Button variant="text" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function IgnoreForm({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (request: Parameters<typeof ignoreDeal>[1]) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className={styles.inlineForm}
      onSubmit={(e) => {
        e.preventDefault();
        const built = buildIgnoreRequest(reason);
        if (!built.ok) return setError(built.error);
        setError(undefined);
        onSubmit(built.request);
      }}
    >
      <TextInput
        label="Why isn't it for you? (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={IGNORE_REASON_MAX}
        hint="e.g. too far, wrong model, price too high"
        error={error}
        autoFocus
      />
      <div className={styles.actions}>
        <Button type="submit" variant="secondary" loading={pending}>
          Ignore this deal
        </Button>
        <Button variant="text" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
