import type { Metadata } from "next";
import Link from "next/link";
import { cancellationState, huntFormContext } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Button, Page, ProductState, SystemBanner } from "@/components/ui";
import { billingPortalFormAction } from "../../billing-actions";

export const metadata: Metadata = { title: "Cancel plan" };

/**
 * Cancellation (decision 0014): says exactly what happens (nothing is deleted, the plan lasts until
 * the paid period ends, then Free limits apply), offers to keep the plan, and cancels in Stripe's
 * billing portal. The plan only changes when Stripe confirms it. Soft, never guilt-tripping.
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
  const [session, api] = await Promise.all([verifySession(), getServerApiClient()]);
  const [ent, billing] = await Promise.all([api.getEntitlements(), api.getBillingInfo()]).catch(() => [null, null] as const);
  if (!ent || !billing) {
    return <SystemBanner tone="error" title="Couldn't load your plan" message="Go back to Settings and try again." action={<Link href="/settings">Settings</Link>} />;
  }
  const sub = ent.subscription;
  const paidUntil = sub?.currentPeriodEnd
    ? new Intl.DateTimeFormat(huntFormContext(session.user.locale).localeTag, { dateStyle: "medium" }).format(new Date(sub.currentPeriodEnd))
    : null;
  if (sub?.provider === "stripe" && sub.cancelAtPeriodEnd) {
    return (
      <>
        <Link href="/settings">← Settings</Link>
        <SystemBanner
          tone="info"
          title={`${ent.plan.name} is already cancelled`}
          message={`You keep it${paidUntil ? ` until ${paidUntil}` : " until the end of the paid period"}, then move to Free. Changed your mind? You can keep it in billing.`}
          action={
            <form action={billingPortalFormAction}>
              <input type="hidden" name="flow" value="manage" />
              <input type="hidden" name="returnPath" value="/settings" />
              <Button type="submit" variant="secondary">
                Open billing
              </Button>
            </form>
          }
        />
      </>
    );
  }
  const view = cancellationState(
    { name: ent.plan.name, isFree: ent.plan.code === "free" },
    { canCancelOnline: billing.mode === "stripe" && sub?.provider === "stripe", paidUntil },
  );
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
        {view.available && (
          <form action={billingPortalFormAction}>
            <input type="hidden" name="flow" value="cancel" />
            <input type="hidden" name="returnPath" value="/settings" />
            <Button type="submit" variant="secondary">
              Cancel in billing
            </Button>
          </form>
        )}
        {view.unavailableReason && <SystemBanner tone="info" title="Not available here" message={view.unavailableReason} />}
      </ProductState>
    </>
  );
}
