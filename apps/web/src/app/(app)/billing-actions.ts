"use server";

import { redirect } from "next/navigation";
import { ApiError, billingReturnPathSchema } from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";

const FLOWS = ["manage", "change_plan", "cancel"] as const;
type Flow = (typeof FLOWS)[number];

/**
 * Opens the Stripe billing portal (payment method, invoices, change plan, cancel) and comes back
 * to `returnPath`. Changes made there reach Rein Drop through verified webhooks.
 */
export async function openBillingPortal(flow: Flow, returnPath: string): Promise<{ error: string }> {
  const api = await getServerApiClient();
  let url: string;
  try {
    url = await api.openBillingPortal({ flow, returnPath });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "We couldn't open billing. Please try again." };
  }
  redirect(url);
}

/** Form version (hidden `flow` + `returnPath` fields): on failure, back to the page with ?billing=unavailable. */
export async function billingPortalFormAction(formData: FormData): Promise<void> {
  const flow = FLOWS.find((f) => f === formData.get("flow")) ?? "manage";
  const parsed = billingReturnPathSchema.safeParse(formData.get("returnPath"));
  const returnPath = parsed.success ? parsed.data : "/settings";
  await openBillingPortal(flow, returnPath); // redirects to Stripe on success
  redirect(`${returnPath}${returnPath.includes("?") ? "&" : "?"}billing=unavailable`);
}

const BILLING_PAGE = "/settings/billing";

/**
 * Starts a hosted checkout for a paid plan (form field `planCode`). Nothing is granted here or on
 * return - the plan changes only when Stripe confirms (webhook, or the server-side sync the billing
 * page runs on ?checkout=success).
 */
export async function startCheckoutFormAction(formData: FormData): Promise<void> {
  const planCode = String(formData.get("planCode") ?? "").trim().slice(0, 50);
  const api = await getServerApiClient();
  let url: string;
  try {
    url = await api.startCheckout(planCode, BILLING_PAGE);
  } catch {
    redirect(`${BILLING_PAGE}?billing=unavailable`);
  }
  redirect(url);
}

/** "Refresh status": re-check the subscription with Stripe (server to server), then show the page again. */
export async function refreshBillingFormAction(): Promise<void> {
  const api = await getServerApiClient();
  await api.syncBilling().catch(() => null);
  redirect(`${BILLING_PAGE}?refreshed=1`);
}