import type { ReactNode } from "react";
import styles from "./Page.module.css";

export interface PageProps {
  title?: string;
  description?: string;
  /** Page-level actions shown beside the title (keep one primary action). */
  actions?: ReactNode;
  /** narrow = single-column forms/onboarding. */
  width?: "default" | "narrow";
  children: ReactNode;
}

/**
 * Page content container: the web counterpart of the mobile `Screen`.
 * Renders no landmark - the surrounding layout owns the single <main>.
 */
export function Page({ title, description, actions, width = "default", children }: PageProps) {
  return (
    <div className={[styles.page, styles[width]].join(" ")}>
      {(title || actions) && (
        <header className={styles.header}>
          <div className={styles.heading}>
            {title && <h1 className={styles.title}>{title}</h1>}
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
