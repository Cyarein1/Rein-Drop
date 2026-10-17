import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./charts.module.css";

/**
 * Chart colour jobs (dataviz: colour follows the job, never decoration).
 * - series1 / series2: identity (navy-family blue, Rein Orange) - validated pair, see charts.module.css.
 * - profit / loss: REALIZED results only (Profit Green / Loss Red). Never for estimates.
 * - muted: context (not the story).
 */
export type MarkTone = "series1" | "series2" | "profit" | "loss" | "muted";

/** A few numbers and where to go next - the small pop-up before navigating (decision 0021). */
export interface MarkDetail {
  title: string;
  /** Optional subtitle ("Estimated - never a loss"). */
  note?: string;
  facts: { label: string; value: string }[];
  links: { label: string; href: string }[];
}

/** What a mark does when clicked: open `detail` in a pop-up, else go to `href`, else nothing. */
export interface MarkAction {
  href?: string;
  detail?: MarkDetail;
}

/** Tone -> class for a mark fill. */
export const toneClass = (tone: MarkTone) => styles[`tone_${tone}`];

/**
 * The clickable wrapper of a mark (a bar row, a column, a tile). Keyboard focusable; the pop-up
 * uses the native Popover API (no client JS: Esc and outside click close it).
 */
export function MarkTarget({ id, action, label, className, children }: { id: string; action: MarkAction; label: string; className: string; children: ReactNode }) {
  if (action.detail) {
    return (
      <>
        <button type="button" popoverTarget={id} className={[className, styles.target].join(" ")} aria-label={label}>
          {children}
        </button>
        <MarkPopover id={id} detail={action.detail} />
      </>
    );
  }
  if (action.href) {
    return (
      <Link href={action.href} className={[className, styles.target].join(" ")} aria-label={label}>
        {children}
      </Link>
    );
  }
  return (
    <div className={className} role="img" aria-label={label}>
      {children}
    </div>
  );
}

function MarkPopover({ id, detail }: { id: string; detail: MarkDetail }) {
  return (
    <div id={id} popover="auto" className={styles.popover} role="dialog" aria-labelledby={`${id}-title`}>
      <div className={styles.popoverHead}>
        <p id={`${id}-title`} className={styles.popoverTitle}>
          {detail.title}
        </p>
        <button type="button" popoverTarget={id} popoverTargetAction="hide" className={styles.popoverClose} aria-label="Close">
          ×
        </button>
      </div>
      {detail.note && <p className={styles.small}>{detail.note}</p>}
      {detail.facts.length > 0 && (
        <dl className={styles.facts}>
          {detail.facts.map((f) => (
            <div key={f.label} className={styles.fact}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {detail.links.length > 0 && (
        <ul className={styles.popoverLinks}>
          {detail.links.map((l) => (
            <li key={l.href + l.label}>
              <Link href={l.href} className={styles.popoverLink}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
