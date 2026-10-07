import { redirect } from "next/navigation";
import { getServerApiClient } from "@/auth";

/**
 * New users go through the Seller Snapshot before the dashboard (App Flow Blueprint section 2:
 * don't dump the user on an empty dashboard). Only for onboarding that isn't started or finished:
 * someone who answered "not a reseller" chose to come to Home from the coming-soon screen.
 * If the snapshot can't be loaded the page still renders - onboarding is never a hard blocker.
 */
export async function OnboardingRedirect() {
  const api = await getServerApiClient();
  const snapshot = await api.getSellerSnapshot().catch(() => null);
  if (snapshot?.status === "not_started" || snapshot?.status === "in_progress") redirect("/onboarding");
  return null;
}
