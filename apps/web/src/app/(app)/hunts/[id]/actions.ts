"use server";

import { ApiError, type Hunt, type UpdateHuntRequest } from "@rein-drop/api-client";
import { mapHuntErrors, type HuntFormErrors } from "@rein-drop/client-core";
import { getServerApiClient } from "@/auth";

export type HuntActionResult = { ok: true; hunt: Hunt } | { ok: false; message: string; errors: HuntFormErrors };

function failure(err: unknown, fallback: string): HuntActionResult {
  if (err instanceof ApiError) {
    // Activation blocks (plan limits) carry readable reasons.
    const reasons = err.activationBlock?.reasons.map((r) => r.message).join(" ");
    return { ok: false, message: reasons || err.message, errors: mapHuntErrors(err.details ?? []) };
  }
  return { ok: false, message: fallback, errors: {} };
}

/** Pause / resume / archive / restore. Activation goes through the plan gate page instead. */
export async function transitionHuntAction(id: string, action: "pause" | "resume" | "archive" | "restore"): Promise<HuntActionResult> {
  const api = await getServerApiClient();
  try {
    return { ok: true, hunt: await api.transitionHunt(id, action) };
  } catch (err) {
    return failure(err, "That didn't work. Please try again.");
  }
}

/** Saves edited criteria (same hunt id; recorded in its history). */
export async function updateHuntAction(id: string, request: UpdateHuntRequest): Promise<HuntActionResult> {
  const api = await getServerApiClient();
  try {
    return { ok: true, hunt: await api.updateHunt(id, request) };
  } catch (err) {
    return failure(err, "We couldn't save your changes. Please try again.");
  }
}
