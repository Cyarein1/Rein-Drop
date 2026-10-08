"use server";

import {
  ApiError,
  type InventoryItem,
  type ListInventoryQueryInput,
  type Page,
  type RecordSaleRequest,
  type ReplacePurchaseCostsRequest,
  type UpdateInventoryItemRequest,
} from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";

export type InventoryActionResult = { ok: true; item: InventoryItem } | { ok: false; message: string; field?: string };
export type InventoryPageResult = { ok: true; page: Page<InventoryItem> } | { ok: false; message: string };

function failure(err: unknown): { ok: false; message: string; field?: string } {
  if (err instanceof ApiError) {
    const detail = err.details?.[0];
    return { ok: false, message: detail?.message ?? err.message, field: detail?.path };
  }
  return { ok: false, message: "Something went wrong. Please try again." };
}

/** Next page of the list ("Show more"). */
export async function loadInventory(query: ListInventoryQueryInput): Promise<InventoryPageResult> {
  try {
    const api = await getServerApiClient();
    return { ok: true, page: await api.listInventory(query) };
  } catch (err) {
    return failure(err);
  }
}

/** Saves the purchase edits: the item fields and / or the full purchase-cost list. */
export async function savePurchase(
  id: string,
  update: UpdateInventoryItemRequest | null,
  costs: ReplacePurchaseCostsRequest | null,
): Promise<InventoryActionResult> {
  try {
    const api = await getServerApiClient();
    let item = update ? await api.updateInventoryItem(id, update) : null;
    if (costs) item = await api.replacePurchaseCosts(id, costs);
    return { ok: true, item: item ?? (await api.getInventoryItem(id)) };
  } catch (err) {
    return failure(err);
  }
}

export async function setHoldingStatus(id: string, status: "IN_STOCK" | "LISTED"): Promise<InventoryActionResult> {
  try {
    const api = await getServerApiClient();
    return { ok: true, item: await api.updateInventoryItem(id, { status }) };
  } catch (err) {
    return failure(err);
  }
}

/** Mark Sold, or correct the recorded sale. */
export async function recordSale(id: string, request: RecordSaleRequest): Promise<InventoryActionResult> {
  try {
    const api = await getServerApiClient();
    return { ok: true, item: await api.recordSale(id, request) };
  } catch (err) {
    return failure(err);
  }
}

export async function undoSale(id: string): Promise<InventoryActionResult> {
  try {
    const api = await getServerApiClient();
    return { ok: true, item: await api.undoSale(id) };
  } catch (err) {
    return failure(err);
  }
}
