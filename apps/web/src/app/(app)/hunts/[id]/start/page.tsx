import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError } from "@rein-drop/api-client";
import { huntFormContext } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { PlanGate } from "./PlanGate";

export const metadata: Metadata = { title: "Start watching" };

export default function StartWatchingPage({ params, searchParams }: PageProps<"/hunts/[id]/start">) {
  return (
    <Protected>
      <StartWatchingLoader params={params} searchParams={searchParams} />
    </Protected>
  );
}

/** Everything comes from the server: the hunt, the plans, the user's entitlements and the activation check. */
async function StartWatchingLoader({
  params,
  searchParams,
}: {
  params: PageProps<"/hunts/[id]/start">["params"];
  searchParams: PageProps<"/hunts/[id]/start">["searchParams"];
}) {
  const { id } = await params;
  const back = (await searchParams).checkout;
  const checkout = back === "success" || back === "cancelled" ? back : null;
  const session = await verifySession();
  const api = await getServerApiClient();
  const data = await Promise.all([
    api.getHunt(id),
    api.listPlans(),
    api.getEntitlements(),
    api.checkHuntActivation(id),
    api.getBillingInfo(),
  ]).catch((err: unknown) => {
    // Unknown / foreign / malformed id -> 404 page; anything else -> error boundary.
    if (err instanceof ApiError && (err.status === 404 || err.code === "VALIDATION_FAILED")) notFound();
    throw err;
  });
  const [hunt, plans, entitlements, check, billing] = data;

  return (
    <PlanGate
      hunt={hunt}
      plans={plans}
      entitlements={entitlements}
      check={check}
      context={huntFormContext(session.user.locale)}
      billing={billing}
      checkout={checkout}
    />
  );
}
