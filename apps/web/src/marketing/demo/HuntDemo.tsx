"use client";

import Image from "next/image";
import { useEffect, useReducer, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, CircleHelp, FlaskConical, Gauge, Laptop, Receipt, RotateCcw, Search, X } from "lucide-react";
import { trackLanding } from "../analytics/analytics";
import { signedUsd, usd } from "../illustrative";
import { marketplaceByKey } from "../marketplaces";
import { MarketplaceMark } from "../marketplaces/MarketplaceMark";
import { productPhotos } from "../photos";
import { PRIMARY_CTA } from "../sections";
import {
  DEMO_CONDITION_LABEL,
  DEMO_CONDITIONS,
  DEMO_DISCLAIMERS,
  DEMO_LABEL,
  DEMO_MARKETPLACES,
  DEMO_PRODUCTS,
  demoProduct,
  type DemoListing,
  type DemoProduct,
} from "./demo-fixtures";
import { DEMO_INITIAL_STATE, demoTransition, type DemoEvent, type DemoState } from "./demo-model";
import { DEMO_SCAN_TICK_MS, DEMO_STEPS, demoAnnouncement, demoHeading, demoStepIndex } from "./demo-view";
import styles from "./HuntDemo.module.css";

type Dispatch = (event: DemoEvent) => void;

/** The model plus the latest live-region text (kept until something new is announced). */
interface View {
  state: DemoState;
  announcement: string;
}

function withAnnouncement(view: View, event: DemoEvent): View {
  const next = demoTransition(view.state, event);
  if (next === view.state) return view;
  return { state: next, announcement: demoAnnouncement(view.state, next) ?? view.announcement };
}

const BACK_LABEL: Partial<Record<DemoState["step"], string>> = {
  configure: "Back to products",
  scan: "Stop and go back",
  candidate: "Change the Hunt",
  no_match: "Change the Hunt",
  evaluation: "Back to the match",
};

/**
 * "Try a sample Hunt" (Landing 15): the interactive demo, driven by the pure model from Landing 14.
 * Everything is illustrative and local - no marketplace is contacted, nothing is random, and the
 * same choices always give the same result. The scan paces itself (one example listing every
 * DEMO_SCAN_TICK_MS) and finishes at once with reduced motion. On every step change focus moves to
 * the panel heading; the self-running scan is announced through a polite live region.
 */
export function HuntDemo() {
  const [{ state, announcement }, dispatch] = useReducer(withAnnouncement, { state: DEMO_INITIAL_STATE, announcement: "" });
  const previousStep = useRef(state.step);
  const heading = useRef<HTMLHeadingElement>(null);

  // Step changed: the old controls are gone, so focus moves to the new heading.
  useEffect(() => {
    if (previousStep.current === state.step) return;
    const from = previousStep.current;
    previousStep.current = state.step;
    // Anonymous analytics (Landing 21): the product key only.
    if (from === "choose" && state.step === "configure") trackLanding("demo_started", { product: state.product });
    if (state.step === "evaluation") trackLanding("demo_completed", { product: state.product });
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
    // Runs on every state change but returns early unless the step changed (scan ticks don't refocus).
  }, [state]);

  // The scan: one listing per tick; with reduced motion, the result straight away.
  useEffect(() => {
    if (state.step !== "scan") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => dispatch(reduced ? { type: "SCAN_COMPLETE" } : { type: "SCAN_TICK" }), reduced ? 0 : DEMO_SCAN_TICK_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const stepIndex = demoStepIndex(state);
  const back = BACK_LABEL[state.step];

  return (
    <section id="demo" aria-labelledby="demo-heading" tabIndex={-1} className={styles.section}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Interactive demo</p>
          <h2 id="demo-heading" className={styles.heading}>
            Try a sample Hunt
          </h2>
          <p className={styles.lead}>Pick a product, set what you&apos;d pay, and watch Rein Drop check a handful of example listings - then see why one stands out.</p>
        </header>

        <div className={styles.demo}>
          <div className={styles.topbar}>
            <p className={styles.label}>
              <FlaskConical aria-hidden size={16} />
              {DEMO_LABEL}
            </p>
            {state.step !== "choose" && (
              <div className={styles.tools}>
                {back && (
                  <button type="button" className={styles.toolButton} onClick={() => dispatch({ type: "BACK" })}>
                    <ArrowLeft aria-hidden size={16} />
                    {back}
                  </button>
                )}
                <button type="button" className={styles.toolButton} onClick={() => dispatch({ type: "RESTART" })}>
                  <RotateCcw aria-hidden size={16} />
                  Start over
                </button>
              </div>
            )}
          </div>

          <ol className={styles.progress} aria-label="Demo progress">
            {DEMO_STEPS.map((s, i) => (
              <li key={s.key} className={styles.progressStep} aria-current={i === stepIndex ? "step" : undefined} data-state={i < stepIndex ? "done" : i === stepIndex ? "current" : "todo"}>
                <span className={styles.progressDot} aria-hidden>
                  {i < stepIndex ? <Check size={14} strokeWidth={3} /> : i + 1}
                </span>
                <span>
                  {s.label}
                  {i < stepIndex && <span className="visually-hidden"> (done)</span>}
                </span>
              </li>
            ))}
          </ol>

          <div className={styles.panel}>
            <h3 ref={heading} tabIndex={-1} className={styles.panelHeading}>
              {demoHeading(state)}
            </h3>
            {/* Keyed by progress step: each new stage fades in; the scan result stays in the same stage. */}
            <div key={stepIndex} className={styles.stage}>
              {state.step === "choose" && <ChooseStep dispatch={dispatch} />}
              {state.step === "configure" && <ConfigureStep state={state} dispatch={dispatch} />}
              {(state.step === "scan" || state.step === "candidate" || state.step === "no_match") && <ScanStep state={state} dispatch={dispatch} />}
              {state.step === "evaluation" && <EvaluationStep state={state} dispatch={dispatch} />}
            </div>
          </div>

          <p className="visually-hidden" aria-live="polite" aria-atomic="true">
            {announcement}
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function ProductVisual({ product, size }: { product: DemoProduct; size: "card" | "small" }) {
  const photo = product.photo ? productPhotos[product.photo] : null;
  return (
    <span className={size === "card" ? styles.visual : styles.visualSmall} aria-hidden>
      {photo ? (
        <Image src={photo.src} width={photo.width} height={photo.height} alt="" sizes={size === "card" ? "(min-width: 720px) 240px, 90vw" : "64px"} className={styles.visualImage} />
      ) : (
        // No licensed photo for this product: a neutral glyph, never a made-up product image.
        <Laptop size={size === "card" ? 56 : 28} strokeWidth={1.5} />
      )}
    </span>
  );
}

function ChooseStep({ dispatch }: { dispatch: Dispatch }) {
  return (
    <ul className={styles.products}>
      {DEMO_PRODUCTS.map((p) => (
        <li key={p.key}>
          <button type="button" className={styles.productCard} onClick={() => dispatch({ type: "SELECT_PRODUCT", product: p.key })}>
            <ProductVisual product={p} size="card" />
            <span className={styles.productName}>{p.name}</span>
            <span className={styles.productMeta}>
              Example Hunt: up to {usd(p.defaults.maxPriceUsd)}, {p.listings.length} example listings
            </span>
            <span className={styles.productGo} aria-hidden>
              Try it <ArrowRight size={16} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConfigureStep({ state, dispatch }: { state: Extract<DemoState, { step: "configure" }>; dispatch: Dispatch }) {
  const product = demoProduct(state.product);
  const { config } = state;
  const { minUsd, maxUsd, stepUsd } = product.priceRange;
  const fill = ((config.maxPriceUsd - minUsd) / (maxUsd - minUsd)) * 100;
  const facebookOn = config.marketplaces.includes("facebook");
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        dispatch({ type: "START_SCAN" });
      }}
    >
      <p className={styles.query}>
        <ProductVisual product={product} size="small" />
        <span>
          <span className={styles.queryLabel}>Hunting for</span>
          <span className={styles.queryText}>
            <Search aria-hidden size={16} />“{product.query}”
          </span>
        </span>
      </p>

      <div className={styles.field}>
        <span className={styles.fieldRow}>
          <label htmlFor="demo-max-price" className={styles.fieldLabel}>
            Max price
          </label>
          <output htmlFor="demo-max-price" className={styles.value}>
            {usd(config.maxPriceUsd)}
          </output>
        </span>
        <input
          id="demo-max-price"
          type="range"
          className={styles.slider}
          min={minUsd}
          max={maxUsd}
          step={stepUsd}
          value={config.maxPriceUsd}
          aria-valuetext={usd(config.maxPriceUsd)}
          style={{ "--fill": `${fill}%` } as React.CSSProperties}
          onChange={(e) => dispatch({ type: "SET_MAX_PRICE", usd: Number(e.target.value) })}
        />
      </div>

      <fieldset className={styles.field}>
        <legend className={styles.fieldLabel}>Condition</legend>
        <span className={styles.segmented}>
          {DEMO_CONDITIONS.map((c) => (
            <label key={c} className={styles.segment}>
              <input type="radio" name="demo-condition" className={styles.hiddenInput} checked={config.condition === c} onChange={() => dispatch({ type: "SET_CONDITION", condition: c })} />
              <span>{c === "any" ? "Any" : DEMO_CONDITION_LABEL[c]}</span>
            </label>
          ))}
        </span>
      </fieldset>

      <fieldset className={styles.field}>
        <legend className={styles.fieldLabel}>Marketplaces</legend>
        <span className={styles.chips}>
          {DEMO_MARKETPLACES.map((m) => {
            const on = config.marketplaces.includes(m);
            const last = on && config.marketplaces.length === 1;
            const entry = marketplaceByKey(m);
            return (
              <label key={m} className={styles.chip} data-disabled={last || undefined}>
                <input
                  type="checkbox"
                  className={styles.hiddenInput}
                  checked={on}
                  disabled={last}
                  aria-describedby={last ? "demo-marketplaces-hint" : undefined}
                  onChange={() => dispatch({ type: "TOGGLE_MARKETPLACE", marketplace: m })}
                />
                <MarketplaceMark marketplace={entry} size={20} showName={entry.logo?.kind !== "wordmark"} />
              </label>
            );
          })}
        </span>
        <p id="demo-marketplaces-hint" className={styles.hint}>
          A Hunt watches at least one marketplace.
        </p>
      </fieldset>

      <fieldset className={styles.field} disabled={!facebookOn}>
        <legend className={styles.fieldLabel}>Local pickup distance</legend>
        <span className={styles.segmented}>
          {product.radiusOptions.map((miles) => (
            <label key={miles} className={styles.segment}>
              <input type="radio" name="demo-radius" className={styles.hiddenInput} checked={config.radiusMiles === miles} onChange={() => dispatch({ type: "SET_RADIUS", miles })} />
              <span>{miles} mi</span>
            </label>
          ))}
        </span>
        <p className={styles.hint}>{facebookOn ? "For Facebook Marketplace listings (local pickup). eBay listings ship." : "Only used with Facebook Marketplace (local pickup)."}</p>
      </fieldset>

      <button type="submit" className={styles.primary}>
        Start the scan
        <ArrowRight aria-hidden size={18} />
      </button>
    </form>
  );
}

function listingWhere(l: DemoListing) {
  return l.distanceMiles === null ? "Ships" : `${l.distanceMiles} mi away`;
}

function ScanStep({ state, dispatch }: { state: Extract<DemoState, { step: "scan" | "candidate" | "no_match" }>; dispatch: Dispatch }) {
  const product = demoProduct(state.product);
  const total = product.listings.length;
  const checked = state.scanned.length;
  const scanning = state.step === "scan";
  const best = state.step === "candidate" ? state.candidate : null;
  return (
    <div className={styles.scan}>
      <div className={styles.progressRow}>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label="Example listings checked"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={checked}
          aria-valuetext={`${checked} of ${total} checked`}
        >
          <span className={styles.barFill} style={{ width: `${(checked / total) * 100}%` }} />
        </div>
        <span className={styles.barText} aria-hidden>
          {checked} of {total} checked
        </span>
      </div>

      <ol className={styles.log} aria-label="Example listings">
        {product.listings.map((l, i) => {
          const result = state.scanned[i];
          const status = result ? (result.result === "match" ? "match" : "skip") : scanning && i === checked ? "checking" : "waiting";
          const isBest = best?.listing.id === l.id;
          return (
            <li key={l.id} className={styles.logRow} data-status={status} data-best={isBest || undefined}>
              <MarketplaceMark marketplace={marketplaceByKey(l.marketplace)} size={18} />
              <span className={styles.logMain}>
                <span className={styles.logTitle}>{l.title}</span>
                <span className={styles.logMeta}>
                  {usd(l.askingUsd)} · {DEMO_CONDITION_LABEL[l.condition]} · {listingWhere(l)}
                </span>
              </span>
              {/* Keyed by status, so each new result fades in as it's checked. */}
              <span key={status} className={styles.logStatus}>
                {status === "match" && <Check aria-hidden size={16} strokeWidth={3} />}
                {status === "skip" && <X aria-hidden size={16} strokeWidth={3} />}
                {isBest ? "Best match" : result ? result.note : status === "checking" ? "Checking…" : "Waiting"}
              </span>
            </li>
          );
        })}
      </ol>

      {scanning && (
        <button type="button" className={styles.textButton} onClick={() => dispatch({ type: "SCAN_COMPLETE" })}>
          Skip to the result
        </button>
      )}

      {best && (
        <div className={styles.match}>
          <div className={styles.matchTop}>
            <ProductVisual product={product} size="small" />
            <div>
              <p className={styles.matchTitle}>{best.listing.title}</p>
              <p className={styles.logMeta}>
                {DEMO_CONDITION_LABEL[best.listing.condition]} · {listingWhere(best.listing)} · posted {best.listing.postedMinutesAgo} min ago
              </p>
            </div>
          </div>
          <Numbers askingUsd={best.listing.askingUsd} resaleUsd={best.resale.typicalUsd} upsideUsd={best.grossUpsideUsd} />
          <button type="button" className={styles.primary} onClick={() => dispatch({ type: "VIEW_EVALUATION" })}>
            See why it was flagged
            <ArrowRight aria-hidden size={18} />
          </button>
        </div>
      )}

      {state.step === "no_match" && (
        <div className={styles.noMatch}>
          <p>None of the example listings fit this Hunt. Try a higher max price, any condition, another marketplace or a wider distance.</p>
          <button type="button" className={styles.primary} onClick={() => dispatch({ type: "BACK" })}>
            <ArrowLeft aria-hidden size={18} />
            Change the Hunt
          </button>
        </div>
      )}
    </div>
  );
}

function Numbers({ askingUsd, resaleUsd, upsideUsd, resaleRange, upsideRange }: { askingUsd: number; resaleUsd: number; upsideUsd: number; resaleRange?: string; upsideRange?: string }) {
  return (
    <dl className={styles.numbers}>
      <div>
        <dt>Asking price</dt>
        <dd>{usd(askingUsd)}</dd>
      </div>
      <div>
        <dt>
          Est. resale <span className={styles.estimate}>Estimate</span>
        </dt>
        <dd>{usd(resaleUsd)}</dd>
        {resaleRange && <dd className={styles.small}>{resaleRange}</dd>}
      </div>
      <div className={styles.upside}>
        <dt>Potential gross upside</dt>
        <dd>{signedUsd(upsideUsd)}</dd>
        <dd className={styles.small}>{upsideRange ?? "Before fees, shipping, tax and repairs"}</dd>
      </div>
    </dl>
  );
}

function EvaluationStep({ state, dispatch }: { state: Extract<DemoState, { step: "evaluation" }>; dispatch: Dispatch }) {
  const product = demoProduct(state.product);
  const { evaluation: e, candidate } = state;
  const notes = [
    { key: "why", title: "Why it was flagged", Icon: CircleCheck, items: e.why },
    { key: "questions", title: "Questions to ask the seller", Icon: CircleHelp, items: e.questionsForSeller },
    { key: "costs", title: "Before you count it as profit", Icon: Receipt, items: e.costsBeforeProfit },
  ] as const;
  return (
    <div className={styles.evaluation}>
      <div className={styles.matchTop}>
        <ProductVisual product={product} size="small" />
        <div>
          <span className={styles.strength}>{e.strength}</span>
          <p className={styles.matchTitle}>{candidate.listing.title}</p>
          <p className={styles.logMeta}>
            <MarketplaceMark marketplace={marketplaceByKey(candidate.listing.marketplace)} size={16} showName={marketplaceByKey(candidate.listing.marketplace).logo?.kind !== "wordmark"} />
          </p>
        </div>
      </div>

      <Numbers
        askingUsd={e.askingUsd}
        resaleUsd={e.estimatedResale.typicalUsd}
        upsideUsd={e.grossUpside.typicalUsd}
        resaleRange={`Range ${usd(e.estimatedResale.lowUsd)} to ${usd(e.estimatedResale.highUsd)}`}
        upsideRange={`Range ${signedUsd(e.grossUpside.lowUsd)} to ${signedUsd(e.grossUpside.highUsd)}, before fees, shipping, tax and repairs`}
      />

      <p className={styles.confidence}>
        <Gauge aria-hidden size={16} />
        {e.confidence.text}
      </p>

      <div className={styles.notes}>
        {notes.map(({ key, title, Icon, items }) => (
          <section key={key} className={styles.note} aria-labelledby={`demo-note-${key}`}>
            <h4 id={`demo-note-${key}`} className={styles.noteTitle}>
              <Icon aria-hidden size={18} />
              {title}
            </h4>
            <ul className={styles.items}>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className={styles.disclaimer}>
        <CircleAlert aria-hidden size={16} />
        <span>
          {DEMO_DISCLAIMERS.estimate} {DEMO_DISCLAIMERS.gross}
        </span>
      </p>

      <div className={styles.actions}>
        <a href={`#${PRIMARY_CTA.section}`} className={styles.primary}>
          {PRIMARY_CTA.label}
          <ArrowRight aria-hidden size={18} />
        </a>
        <button type="button" className={styles.secondary} onClick={() => dispatch({ type: "RESTART" })}>
          <RotateCcw aria-hidden size={16} />
          Try another product
        </button>
      </div>
    </div>
  );
}
