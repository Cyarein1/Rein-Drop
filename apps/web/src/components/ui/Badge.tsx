import type { ReactNode } from "react";
import type { BadgeTone } from "@rein-drop/design-tokens";
import styles from "./Badge.module.css";

export interface BadgeProps {
  /**
   * fresh = Drop Yellow (pair with explicit text, e.g. "Just dropped" / "2 min ago"),
   * profit, loss, action, info, neutral (marketplace/status/confidence labels).
   */
  tone?: BadgeTone;
  children: ReactNode;
}

/** Colour is never the only signal: badges always carry text. */
export function Badge({ tone = "neutral", children }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[tone]].join(" ")}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}
