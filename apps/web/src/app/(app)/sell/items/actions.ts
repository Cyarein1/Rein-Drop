"use server";

import { redirect } from "next/navigation";
import {
  ApiError,
  type ApiClient,
  type CancelItemRequest,
  type CreateInventoryItemRequestInput,
  type InventoryEvent,
  type InventoryItem,
  type ListInventoryQueryInput,
  type MarketplaceKey,
  type Page,
  type RecordSaleRequest,
  type ReplacePurchaseCostsRequest,
  type ReturnItemRequest,
  type UpdateInventoryItemRequest,
  type WriteOffItemRequest,
} from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";
import { itemHref } from "@/sell/routes";

/** `events` = the item's refreshed timeline (null when it couldn't be loaded - the change still happened). */
export type InventoryActionResult = { ok: true; item: InventoryItem; events: InventoryEvent[] | null } | { ok: false; message: string; field?: string };
export type InventoryPageResult = { ok: true; page: Page<InventoryItem> } | { ok: false; message: string };

function failure(err: unknown): { ok: false; message: string; field?: string } {
  if (err instanceof ApiError) {
    const details = err.details ?? [];
    return { ok: false, message: details.length > 1 ? details.map((d) => d.message).join(". ") : (details[0]?.message ?? err.message), field: details[0]?.path };
  }
  return { ok: false, message: "Something went wrong. Please try again." };
}

/** Runs one item change, then reloads its timeline (best effort). */
async function change(id: string, call: (api: ApiClient) => Promise<InventoryItem | null>): Promise<InventoryActionResult> {
  try {
    const api = await getServerApiClient();
    const item = (await call(api)) ?? (await api.getInventoryItem(id));
    const events = await api
      .getInventoryEvents(id)
      .then((r) => r.items)
      .catch(() => null);
    return { ok: true, item, events };
  } catch (err) {
    return failure(err);
  }
}

/** Next page of a section ("Show more"). */
export async function loadInventory(query: ListInventoryQueryInput): Promise<InventoryPageResult> {
  try {
    const api = await getServerApiClient();
    return { ok: true, page: await api.listInventory(query) };
  } catch (err) {
    return failure(err);
  }
}

/** "Add item": something bought outside Rein Drop. Opens the new item's page. */
export async function createItem(input: CreateInventoryItemRequestInput): Promise<{ ok: false; message: string; field?: string }> {
  let id: string;
  try {
    id = (await (await getServerApiClient()).createInventoryItem(input)).id;
  } catch (err) {
    return failure(err);
  }
  redirect(`${itemHref(id)}?added=1`);
}

/** Saves the purchase edits: the item fields and / or the full purchase-cost list. */
export async function savePurchase(id: string, update: UpdateInventoryItemRequest | null, costs: ReplacePurchaseCostsRequest | null): Promise<InventoryActionResult> {
  return change(id, async (api) => {
    let item = update ? await api.updateInventoryItem(id, update) : null;
    if (costs) item = await api.replacePurchaseCosts(id, costs);
    return item;
  });
}

export async function setHoldingStatus(id: string, status: "IN_STOCK" | "LISTED"): Promise<InventoryActionResult> {
  return change(id, (api) => api.updateInventoryItem(id, { status }));
}

/** Mark Sold, or correct the recorded sale. */
export async function recordSale(id: string, request: RecordSaleRequest): Promise<InventoryActionResult> {
  return change(id, (api) => api.recordSale(id, request));
}

export async function undoSale(id: string): Promise<InventoryActionResult> {
  return change(id, (api) => api.undoSale(id));
}

export async function returnItem(id: string, request: ReturnItemRequest): Promise<InventoryActionResult> {
  return change(id, (api) => api.returnInventoryItem(id, request));
}

export async function writeOffItem(id: string, request: WriteOffItemRequest): Promise<InventoryActionResult> {
  return change(id, (api) => api.writeOffInventoryItem(id, request));
}

/** Undo bought (bought by mistake). */
export async function cancelItem(id: string, request: CancelItemRequest = {}): Promise<InventoryActionResult> {
  return change(id, (api) => api.cancelInventoryItem(id, request));
}

export async function reopenItem(id: string): Promise<InventoryActionResult> {
  return change(id, (api) => api.reopenInventoryItem(id));
}

/** "I've removed it": the seller took an ended assisted listing (e.g. Facebook) down themselves. */
export async function confirmRemoved(id: string, listingId: string, marketplace: MarketplaceKey): Promise<InventoryActionResult> {
  return change(id, async (api) => {
    await api.endSellChannel(listingId, marketplace);
    return null;
  });
}
