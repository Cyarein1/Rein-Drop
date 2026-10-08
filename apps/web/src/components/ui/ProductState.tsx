import type { ReactNode } from "react";
import { PRODUCT_STATE_MASCOTS } from "@rein-drop/design-tokens";
import type { ProductStateView } from "@rein-drop/client-core";
import { ButtonLink } from "./ButtonLink";
import { MascotSlot } from "./MascotSlot";
import styles from "./ProductState.module.css";

/**
 * A polished product state (first scan, no deals yet, reduced monitoring, suggestion,
 * cancellation): mascot slot by STATE -> semantic token, title, body, facts and actions.
 */
export function ProductState({ view, headingLevel = 2, children }: { view: ProductStateView; headingLevel?: 2 | 3; children?: ReactNode }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className={styles.state} data-state={view.state} role={view.live ? "status" : undefined} aria-live={view.live ? "polite" : undefined}>
      <MascotSlot token={PRODUCT_STATE_MASCOTS[view.state]} />
      <div className={styles.body}>
        <Heading className={styles.title}>{view.title}</Heading>
        <p>{view.body}</p>
        {view.details.length > 0 && (
          <ul className={styles.details}>
            {view.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
        {children}
        {view.actions.length > 0 && (
          <div className={styles.actions}>
            {view.actions.map((a) => (
              <ButtonLink key={a.label} href={a.path} variant={a.variant}>
                {a.label}
              </ButtonLink>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
