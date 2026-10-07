"use server";

import { ApiError, type SellerSnapshot, type UpdateSellerSnapshotRequest } from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";

export type SaveSnapshotStepResult = { ok: true; snapshot: SellerSnapshot } | { ok: false; message: string };

/**
 * Saves one onboarding answer (or the "Are you a reseller?" gate) as the user moves on, so a
 * refresh resumes where they left off. Runs on the server; the API re-validates everything.
 */
export async function saveSnapshotStep(update: UpdateSellerSnapshotRequest): Promise<SaveSnapshotStepResult> {
  const api = await getServerApiClient();
  try {
    return { ok: true, snapshot: await api.updateSellerSnapshot(update) };
  } catch (err) {
    if (err instanceof ApiError) {
      const detail = err.details?.[0]?.message;
      return { ok: false, message: detail ? `${err.message}: ${detail}` : err.message };
    }
    return { ok: false, message: "We couldn't save your answer. Please try again." };
  }
}
