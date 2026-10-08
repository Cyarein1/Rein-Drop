import { notFound } from "next/navigation";
import { ApiError, type InventoryItem } from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";

/** Loads one item for a page: unknown / someone else's / malformed id -> 404; anything else -> error boundary. */
export async function loadInventoryItem(id: string): Promise<InventoryItem> {
  const api = await getServerApiClient();
  return api.getInventoryItem(id).catch((err: unknown) => {
    if (err instanceof ApiError && (err.status === 404 || err.code === "VALIDATION_FAILED")) notFound();
    throw err;
  });
}
