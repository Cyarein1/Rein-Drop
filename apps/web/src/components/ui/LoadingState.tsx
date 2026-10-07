import styles from "./LoadingState.module.css";

export function Spinner({ size = "md" }: { size?: "sm" | "md" }) {
  return <span className={[styles.spinner, styles[size]].join(" ")} aria-hidden="true" />;
}

export interface LoadingStateProps {
  /** Announced to screen readers and shown under the spinner. */
  label?: string;
}

/** Inline loading state for a section or page. Plain spinner - no mascot (Mascot Usage Guide, section 7). */
export function LoadingState({ label = "Loading…" }: LoadingStateProps) {
  return (
    <div className={styles.container} role="status" aria-live="polite">
      <Spinner />
      <p className={styles.label}>{label}</p>
    </div>
  );
}
