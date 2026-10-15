"use server";

import { redirect } from "next/navigation";
import { ApiError, type MarketplaceKey, type SellDraftSuggestion, type SellListing, type UpdateSellListingRequest } from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";

export type SellActionResult = { ok: true; listing: SellListing } | { ok: false; message: string; field?: string };
export type SellDraftResult = { ok: true; draft: SellDraftSuggestion } | { ok: false; message: string };

function failure(err: unknown): { ok: false; message: string; field?: string } {
  if (err instanceof ApiError) {
    const details = err.details ?? [];
    return { ok: false, message: details.length > 1 ? details.map((d) => d.message).join(". ") : (details[0]?.message ?? err.message), field: details[0]?.path };
  }
  return { ok: false, message: "Something went wrong. Please try again." };
}

async function run(call: (api: Awaited<ReturnType<typeof getServerApiClient>>) => Promise<SellListing>): Promise<SellActionResult> {
  try {
    return { ok: true, listing: await call(await getServerApiClient()) };
  } catch (err) {
    return failure(err);
  }
}

/** "List for sale" on an inventory item: opens its listing (created on first use). */
export async function startListing(inventoryItemId: string): Promise<{ ok: false; message: string }> {
  let id: string;
  try {
    id = (await (await getServerApiClient()).startSellListing(inventoryItemId)).id;
  } catch (err) {
    return failure(err);
  }
  redirect(`/sell/${id}`);
}

export async function saveListing(id: string, update: UpdateSellListingRequest): Promise<SellActionResult> {
  return run((api) => api.updateSellListing(id, update));
}

export async function draftListing(id: string, notes: string): Promise<SellDraftResult> {
  try {
    return { ok: true, draft: await (await getServerApiClient()).draftSellListing(id, notes.trim() ? { notes } : {}) };
  } catch (err) {
    return failure(err);
  }
}

/** One photo per call (field "photo"); the browser sends several in sequence. */
export async function uploadPhoto(id: string, form: FormData): Promise<SellActionResult> {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a photo" };
  return run((api) => api.uploadSellPhoto(id, file, file.name));
}

export async function addSourcePhoto(id: string, url: string): Promise<SellActionResult> {
  return run((api) => api.addSourcePhoto(id, url));
}

export async function reorderPhotos(id: string, photoIds: string[]): Promise<SellActionResult> {
  return run((api) => api.reorderSellPhotos(id, photoIds));
}

export async function removePhoto(id: string, photoId: string): Promise<SellActionResult> {
  return run((api) => api.removeSellPhoto(id, photoId));
}

export async function publishListing(id: string, marketplaces: MarketplaceKey[]): Promise<SellActionResult> {
  return run((api) => api.publishSellListing(id, marketplaces));
}

export async function confirmPosted(id: string, marketplace: MarketplaceKey, url: string): Promise<SellActionResult> {
  return run((api) => api.confirmSellChannel(id, marketplace, url.trim() || undefined));
}

export async function endChannel(id: string, marketplace: MarketplaceKey): Promise<SellActionResult> {
  return run((api) => api.endSellChannel(id, marketplace));
}
