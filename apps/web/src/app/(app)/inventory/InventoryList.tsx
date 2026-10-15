"use client";

import { useState, useTransition } from "react";
import type { InventoryItem, ListInventoryQueryInput, Page } from "@rein-drop/api-client";
import { inventoryRowView, withTranslator, type PlainContext } from "@rein-drop/client-core";
import { Button } from "@/components/ui";
import { loadInventory } from "./actions";
import { InventoryRow } from "./InventoryRow";
import styles from "./inventory.module.css";

/** Newest purchase first, with "Show more" (cursor from the API). */
export function InventoryList({
  initial,
  query,
  context: plain,
}: {
  initial: Page<InventoryItem>;
  query: ListInventoryQueryInput;
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
      const result = await loadInventory({ ...query, cursor });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems((prev) => [...prev, ...result.page.items.filter((i) => !prev.some((p) => p.id === i.id))]);
      setCursor(result.page.nextCursor);
    });

  return (
    <>
      <ul className={styles.list} aria-label="Inventory, newest purchase first">
        {items.map((item) => (
          <li key={item.id}>
            <InventoryRow view={inventoryRowView(item, context)} />
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
