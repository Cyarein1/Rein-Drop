import Link from "next/link";
import type { DealCardView } from "@rein-drop/client-core";
import { Badge } from "@/components/ui";
import styles from "./deals.module.css";

/**
 * One deal in the feed: product, source, price, freshness, estimated upside, confidence and
 * status. The title link stretches over the card, so the whole card opens the deal with a single
 * tab stop. Exceptional deals get the soft-yellow branded treatment (no mascot artwork exists).
 */
export function DealCard({ view, headingLevel = 2 }: { view: DealCardView; /** 3 when the card sits under a section heading (e.g. on Home). */ headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <article className={[styles.card, view.exceptional && styles.exceptional].filter(Boolean).join(" ")}>
      <div className={styles.badges}>
        {view.strength && <Badge tone={view.strength.tone}>{view.strength.label}</Badge>}
        {view.justDropped && <Badge tone="fresh">Just dropped</Badge>}
        <Badge tone={view.status.tone}>{view.status.label}</Badge>
      </div>

      <Heading className={styles.cardTitle}>
        <Link href={`/deals/${view.id}`} className={styles.stretched} aria-label={view.accessibleSummary}>
          {view.title}
        </Link>
      </Heading>
      <p className={styles.meta}>
        {view.source} · {view.freshness} · {view.huntName}
      </p>

      <dl className={styles.figures}>
        <div>
          <dt>Price</dt>
          <dd className={styles.figure}>{view.price}</dd>
          {view.priceExtra && <dd className={styles.small}>{view.priceExtra}</dd>}
        </div>
        <div>
          <dt>
            Upside{" "}
            {view.upside.estimated && <span className={styles.estimated}>Estimated</span>}
          </dt>
          <dd className={view.upside.estimated ? styles.figure : styles.muted}>{view.upside.value}</dd>
          {!view.upside.estimated && <dd className={styles.small}>{view.upside.caption}</dd>}
        </div>
        <div>
          <dt>Confidence</dt>
          <dd className={view.confidence ? undefined : styles.muted}>
            {view.confidence ? view.confidence.replace(" confidence", "") : "Not yet"}
          </dd>
        </div>
      </dl>

      {view.reason && <p className={styles.reason}>{view.reason}</p>}
      {view.analysisNote && <p className={styles.small}>{view.analysisNote}</p>}
      {view.sourceNote && <p className={styles.sourceNote}>{view.sourceNote.text}</p>}
    </article>
  );
}
