import { MarkTarget, toneClass, type MarkAction, type MarkTone } from "./Mark";
import { barSpan, domainOf, domId } from "./scale";
import styles from "./charts.module.css";

export interface BarDatum extends MarkAction {
  key: string;
  label: string;
  /** The number the bar length encodes (any unit; negatives draw left of zero). */
  amount: number;
  /** The formatted value shown at the bar tip (always visible: the chart's text equivalent). */
  value: string;
  /** Extra context under the label ("3 sales · 12 days"). */
  sublabel?: string;
  tone: MarkTone;
}

/**
 * Horizontal bars, one row per category, each row a link or a pop-up button. Label and value are
 * always printed, so the list itself is the table view; the bar adds the comparison. Zero is a
 * shared baseline (diverging when there are negative values).
 */
export function BarList({ id, label, bars }: { id: string; label: string; bars: BarDatum[] }) {
  const domain = domainOf(bars.map((b) => b.amount));
  return (
    <ul className={styles.barList} aria-label={label}>
      {bars.map((b) => {
        const span = barSpan(b.amount, domain);
        const negative = b.amount < 0;
        return (
          <li key={b.key}>
            <MarkTarget
              id={domId(id, b.key)}
              action={b}
              label={[`${b.label}: ${b.value}`, b.sublabel].filter(Boolean).join(". ")}
              className={styles.barRow}
            >
              <span className={styles.barText} aria-hidden="true">
                <span className={styles.barLabel}>{b.label}</span>
                {b.sublabel && <span className={styles.barSub}>{b.sublabel}</span>}
              </span>
              <span className={styles.barTrack} aria-hidden="true">
                {domain.zero > 0 && <span className={styles.barZero} style={{ left: `${domain.zero}%` }} />}
                <span
                  className={[styles.barFill, negative ? styles.barNeg : "", toneClass(b.tone)].join(" ")}
                  style={{ left: `${span.start}%`, width: `${span.size}%` }}
                />
              </span>
              <span className={styles.barValue} aria-hidden="true">
                {b.value}
              </span>
            </MarkTarget>
          </li>
        );
      })}
    </ul>
  );
}
