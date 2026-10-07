import type { MetricTone } from "@rein-drop/design-tokens";
import styles from "./Metric.module.css";

export interface MetricProps {
  label: string;
  /** Pre-formatted value (formatting money/percent is the caller's job). */
  value: string;
  /** profit = Profit Green, loss = Loss Red (realized only - never for missed potential). */
  tone?: MetricTone;
  /** Estimated values must be explicitly labeled (Screenbook, section 1). */
  estimated?: boolean;
  /** Optional comparison line, e.g. { label: "Expected", value: "$120" }. */
  comparison?: { label: string; value: string };
  caption?: string;
}

export function Metric({ label, value, tone = "neutral", estimated, comparison, caption }: MetricProps) {
  return (
    <div className={styles.metric}>
      <p className={styles.label}>
        {label}
        {estimated && <span className={styles.estimated}>Estimated</span>}
      </p>
      <p className={[styles.value, styles[tone]].join(" ")}>{value}</p>
      {comparison && (
        <p className={styles.comparison}>
          {comparison.label}: <strong>{comparison.value}</strong>
        </p>
      )}
      {caption && <p className={styles.caption}>{caption}</p>}
    </div>
  );
}
