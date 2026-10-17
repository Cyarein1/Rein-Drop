import type { ApiClient as Api, InventoryItem, ListInventoryQueryInput } from "@rein-drop/api-client";

/** Pages of 100, at most this many (1,000 items) per chart - beyond that the chart says it is partial. */
const MAX_PAGES = 10;

/**
 * Every item of an inventory list (newest purchase first), for charts the analytics endpoints
 * don't aggregate (purchases over time, selling per marketplace, slow sellers). `stopAfter` ends
 * paging early once an item is older than what the chart needs (the list is ordered by purchase
 * date, newest first). `complete` is false when the cap was hit.
 */
export async function loadInventory(
  api: Api,
  query: Omit<ListInventoryQueryInput, "limit" | "cursor">,
  stopAfter?: (item: InventoryItem) => boolean,
): Promise<{ items: InventoryItem[]; complete: boolean }> {
  const items: InventoryItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await api.listInventory({ ...query, limit: 100, cursor });
    items.push(...res.items);
    if (!res.nextCursor || (stopAfter && res.items.some(stopAfter))) return { items, complete: true };
    cursor = res.nextCursor;
  }
  return { items, complete: false };
}
