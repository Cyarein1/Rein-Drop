import type { Metadata } from "next";
import Link from "next/link";
import { cancellationState } from "@rein-drop/client-core";
import { getServerApiClient } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Page, ProductState, SystemBanner } from "@/components/ui";

export const metadata: Metadata = { title: "Cancel plan" };

/**
 * Cancellation flow - PLACEHOLDER until a billing provider exists (D2). Shows exactly what would
 * happen (nothing is deleted), offers to keep the plan, and says plainly that online cancellation
 * isn't available yet. Soft, never guilt-tripping (Mascot Usage Guide: plan cancellation).
 */
export default function CancelPlanPage() {
  return (
    <Protected>
      <Page width="narrow">
        <CancelLoader />
      </Page>
    </Protected>
  );
}

async function CancelLoader() {
  const api = await getServerApiClient();
  const ent = await api.getEntitlements().catch(() => null);
  if (!ent) {
    return <SystemBanner tone="error" title="Couldn't load your plan" message="Go back to Settings and try again." action={<Link href="/settings">Settings</Link>} />;
  }
  const view = cancellationState({ name: ent.plan.name, isFree: ent.plan.code === "free" });
  return (
    <>
      <Link href="/settings">← Settings</Link>
      <ProductState view={view} headingLevel={2}>
        {view.consequences.length > 0 && (
          <ul>
            {view.consequences.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
        {view.consequences.length > 0 && <SystemBanner tone="info" title="Not available yet" message={view.unavailableReason} />}
      </ProductState>
    </>
  );
}
