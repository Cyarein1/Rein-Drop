import type { ReactNode } from "react";
import styles from "./Disclosure.module.css";

export interface DisclosureProps {
  summary: string;
  /** Start expanded (e.g. when the section already has values). */
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Expandable section ("More filters") using native <details>/<summary>. */
export function Disclosure({ summary, defaultOpen = false, children }: DisclosureProps) {
  return (
    <details className={styles.details} open={defaultOpen}>
      <summary className={styles.summary}>{summary}</summary>
      <div className={styles.content}>{children}</div>
    </details>
  );
}
