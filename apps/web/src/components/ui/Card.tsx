import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  /** Shown to the right of the title, e.g. a Badge or text Button. */
  action?: ReactNode;
}

/** White surface, subtle border, ~12px radius (Mobile UI Screenbook, section 1). */
export function Card({ title, action, className, children, ...rest }: CardProps) {
  return (
    <section className={[styles.card, className].filter(Boolean).join(" ")} {...rest}>
      {(title || action) && (
        <header className={styles.header}>
          {title && <h3 className={styles.title}>{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
