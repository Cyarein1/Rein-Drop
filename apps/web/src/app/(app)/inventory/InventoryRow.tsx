import Link from "next/link";
import type { InventoryRowView } from "@rein-drop/client-core";
import { Badge, ButtonLink } from "@/components/ui";
import { MarketplaceName } from "@/components/MarketplaceName";
import styles from "./inventory.module.css";

/** One inventory item: what it cost, how long it's been held (or its realized result), the next step. */
export function InventoryRow({ view, headingLevel = 2 }: { view: InventoryRowView; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const actionHref = view.action.kind === "sell" ? `/inventory/${view.id}/sell` : `/inventory/${view.id}/result`;
  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <Heading className={styles.cardTitle}>
          <Link href={`/inventory/${view.id}`} className={styles.stretched}>
            {view.title}
          </Link>
        </Heading>
        <Badge tone={view.status.tone}>{view.status.label}</Badge>
      </div>
      <p className={styles.figures}>
        <span>{view.cost}</span>
        <span>{view.held}</span>
        {view.marketplace && <MarketplaceName marketplace={view.marketplace} />}
      </p>
      {view.result && (
        <p>
          {view.result.label}: <span className={styles[view.result.tone]}>{view.result.value}</span>
        </p>
      )}
      {view.estimate && <p className={styles.small}>{view.estimate}</p>}
      <ButtonLink href={actionHref} variant={view.action.kind === "sell" ? "primary" : "secondary"} className={styles.cardAction}>
        {view.action.label}
        <span className="visually-hidden">: {view.title}</span>
      </ButtonLink>
    </article>
  );
}
