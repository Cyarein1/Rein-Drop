"use client";

import { useState, useTransition } from "react";
import type { DealSummary, ListDealsQueryInput, Page } from "@rein-drop/api-client";
import { dealCardView, withTranslator, type PlainContext } from "@rein-drop/client-core";
import { Button } from "@/components/ui";
import { loadDeals } from "./actions";
import { DealCard } from "./DealCard";
import styles from "./deals.module.css";

/** The ranked list with "Show more" (keyset cursor from the API). */
export function DealFeed({
  initial,
  query,
  context: plain,
}: {
  initial: Page<DealSummary>;
  query: ListDealsQueryInput;
  context: PlainContext;
}) {
  const context = withTranslator(plain);
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  const showMore = () =>
    startLoading(async () => {
      if (!cursor) return;
      setError(null);
      const result = await loadDeals({ ...query, cursor });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems((prev) => [...prev, ...result.page.items.filter((d) => !prev.some((p) => p.id === d.id))]);
      setCursor(result.page.nextCursor);
    });

  return (
    <>
      <ul className={styles.list} aria-label="Deals, best first">
        {items.map((deal) => (
          <li key={deal.id}>
            <DealCard view={dealCardView(deal, context)} />
          </li>
        ))}
      </ul>
      {(cursor || error) && (
        <div className={styles.more}>
          {error && (
            <p role="alert" className={styles.small}>
              Couldn&apos;t load more: {error}
            </p>
          )}
          {cursor && (
            <Button variant="secondary" loading={loading} onClick={showMore}>
              Show more
            </Button>
          )}
        </div>
      )}
    </>
  );
}
