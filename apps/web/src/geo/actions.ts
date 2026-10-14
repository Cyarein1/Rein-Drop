"use server";

import { ApiError, GEO_QUERY_MIN_LENGTH, type GeoPlace, type UpdateUserAreaRequestInput, type UserArea } from "@rein-drop/api-client";
import { revalidatePath } from "next/cache";
import { getServerApiClient } from "@/auth";

export type SuggestResult = { ok: true; places: GeoPlace[] } | { ok: false; message: string };

/**
 * Places while typing (decision 0017). Runs on the server, so the API (and its maps key) is never
 * called from the browser. Too-short text returns nothing without a request.
 */
export async function suggestPlaces(query: string): Promise<SuggestResult> {
  const q = query.trim().slice(0, 100);
  if (q.length < GEO_QUERY_MIN_LENGTH) return { ok: true, places: [] };
  try {
    const api = await getServerApiClient();
    return { ok: true, places: await api.suggestPlaces(q, 5) };
  } catch (err) {
    return { ok: false, message: err instanceof ApiError ? err.message : "Suggestions aren't available right now - you can still type the place." };
  }
}

export type AreaResult = { ok: true; area: UserArea | null } | { ok: false; message: string };

/** Save "Your area" (a picked suggestion, or typed text the API places itself). */
export async function saveMyArea(input: UpdateUserAreaRequestInput): Promise<AreaResult> {
  try {
    const api = await getServerApiClient();
    const area = await api.setMyArea(input);
    revalidatePath("/settings");
    return { ok: true, area };
  } catch (err) {
    return { ok: false, message: err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : "We couldn't save your area. Please try again." };
  }
}

export async function clearMyArea(): Promise<AreaResult> {
  try {
    const api = await getServerApiClient();
    await api.clearMyArea();
    revalidatePath("/settings");
    return { ok: true, area: null };
  } catch {
    return { ok: false, message: "We couldn't remove your area. Please try again." };
  }
}
