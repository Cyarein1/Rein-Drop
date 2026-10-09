"use server";

import { ApiError, type ActivationBlock, type Hunt } from "@rein-drop/api-client";
import { redirect } from "next/navigation";
import { getServerApiClient } from "@/auth";

export type StartWatchingResult =
  | { ok: true; hunt: Hunt }
  | { ok: false; message: string; block: ActivationBlock | null; billingUnavailable?: boolean };

/** Free plan: no card, no charge - record the choice, then activate the hunt. */
export async function chooseFreeAndStart(huntId: string): Promise<StartWatchingResult> {
  const api = await getServerApiClient();
  try {
    await api.chooseFreePlan();
  } catch (err) {
    return { ok: false, message: err instanceof ApiError ? err.message : "We couldn't choose the Free plan. Please try again.", block: null };
  }
  return startHunt(huntId);
}

/**
 * Paid plan: send the browser to Stripe Checkout. The plan only changes when Stripe confirms the
 * payment (webhook); the user comes back to this page (?checkout=success) to start watching.
 */
export async function goToCheckout(huntId: string, planCode: string): Promise<StartWatchingResult> {
  const api = await getServerApiClient();
  let url: string;
  try {
    url = await api.startCheckout(planCode, `/hunts/${huntId}/start`);
  } catch (err) {
    return { ok: false, message: err instanceof ApiError ? err.message : "We couldn't open checkout. Please try again.", block: null };
  }
  redirect(url);
}

/**
 * DEVELOPMENT-ONLY plan gate submit: records the chosen plan through the fake billing (no
 * payment), then activates the hunt. The API answers 404 outside development.
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

/** Product event: the plan comparison was shown. Best effort - never affects the page. */
export async function trackPlanViewed(): Promise<void> {
  try {
    const api = await getServerApiClient();
    await api.trackEvent({ name: "plan_viewed", properties: { context: "hunt_activation" } });
  } catch {
    // Telemetry must never surface to the user.
  }
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
