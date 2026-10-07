"use server";

import { ApiError, type ActivationBlock, type Hunt } from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";

export type StartWatchingResult =
  | { ok: true; hunt: Hunt }
  | { ok: false; message: string; block: ActivationBlock | null; billingUnavailable?: boolean };

/**
 * Plan gate submit: records the chosen plan through the DEVELOPMENT-ONLY fake billing (no
 * payment), then activates the hunt. TODO(billing): replace the fake confirmation with the
 * real checkout once a provider is chosen - not integrated.
 */
export async function confirmPlanAndStart(huntId: string, planCode: string): Promise<StartWatchingResult> {
  const api = await getServerApiClient();
  try {
    await api.confirmDevBilling(planCode);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return { ok: false, message: "Billing isn't available yet.", block: null, billingUnavailable: true };
    }
    return { ok: false, message: err instanceof Error ? err.message : "Billing failed", block: null };
  }
  return startHunt(huntId);
}

/** Activates with the plan the user already has. Blocks come back as structured reasons. */
export async function startHunt(huntId: string): Promise<StartWatchingResult> {
  const api = await getServerApiClient();
  try {
    return { ok: true, hunt: await api.transitionHunt(huntId, "activate") };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, message: err.message, block: err.activationBlock ?? null };
    }
    return { ok: false, message: "We couldn't start this hunt. Please try again.", block: null };
  }
}
