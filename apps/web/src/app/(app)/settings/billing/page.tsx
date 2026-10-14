import type { Metadata } from "next";
import { billingStatusView, checkoutReturnView, huntFormContext, planCards } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Badge, Button, ButtonLink, Card, Page, SystemBanner } from "@/components/ui";
import { billingPortalFormAction, refreshBillingFormAction, startCheckoutFormAction } from "../../billing-actions";
import styles from "./billing.module.css";

export const metadata: Metadata = { title: "Plans & billing" };

/**
 * Plans & billing - WEB ONLY (decision 0018). Current plan and access, renewal information, every
 * plan with its price, and the actions Stripe supports: subscribe (hosted checkout), change plan,
 * cancel and manage payment details (Customer Portal). Paid access is granted only from what Stripe
 * confirms - after checkout this page asks the server to re-check with Stripe; the browser's
 * "success" alone changes nothing.
 */
export default function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  return (
    <Protected>
      <Page title="Plans & billing" description="Your plan, what it includes, and billing - managed here on the web." width="narrow">
        <BillingContent searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

async function BillingContent({ searchParams }: { searchParams: PageProps<"/settings/billing">["searchParams"] }) {
  const params = await searchParams;
  const [session, api] = await Promise.all([verifySession(), getServerApiClient()]);
  const localeTag = huntFormContext(session.user.locale).localeTag;
  // Back from checkout: confirm with Stripe server-side before showing anything (webhook may lag).
  if (params.checkout === "success") await api.syncBilling().catch(() => null);
  const [access, plans, billing] = await Promise.all([api.getAccess(), api.listPlans(), api.getBillingInfo()]).catch(() => [null, null, null] as const);
  if (!access || !plans || !billing) {
    return <SystemBanner tone="error" title="Couldn't load billing" message="Refresh the page to try again. Your plan is unaffected." />;
  }

  const source = access.products.source;
  const status = billingStatusView(source, localeTag);
  const returned = checkoutReturnView(typeof params.checkout === "string" ? params.checkout : undefined, source);
  const cards = planCards(plans, source, billing, localeTag);
  const portal = (flow: "manage" | "change_plan" | "cancel", label: string, variant: "primary" | "secondary" | "text" = "secondary") => (
    <form action={billingPortalFormAction}>
      <input type="hidden" name="flow" value={flow} />
      <input type="hidden" name="returnPath" value="/settings/billing" />
      <Button type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
  const usage = (u: { limit: number | null; used: number }, label: string) => `${label}: ${u.used} ${u.limit === null ? "(no limit)" : `of ${u.limit}`}`;

  return (
    <>
      {returned && <SystemBanner tone={returned.tone} title={returned.title} message={returned.message} />}
      {params.billing === "unavailable" && <SystemBanner tone="error" title="Couldn't open billing" message="Rein Drop couldn't reach the billing service. Please try again in a moment." />}
      {params.refreshed === "1" && <SystemBanner tone="info" title="Status checked with Stripe" message="This page shows what Stripe reports now." />}
      {billing.mode === "development" && <SystemBanner tone="info" title="Development billing" message="Stripe isn't configured here, so nothing can be bought on this page. Plans are chosen in a Hunt's Start watching step (development confirmation)." />}

      <Card title="Current plan" action={<Badge tone={status.tone}>{status.label}</Badge>}>
        <p className={styles.planName}>{source.plan?.name ?? "No plan"}</p>
        {status.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <ul className={styles.usage}>
          <li>{usage(source.limits.activeHunts, "Live Hunts")}</li>
          <li>{usage(source.limits.savedHunts, "Saved Hunts")}</li>
        </ul>
        {plans.some((p) => !p.limitsFinal) && <p className={styles.muted}>Limits are placeholders while Rein Drop is in beta.</p>}
        <div className={styles.actions}>
          {billing.canManage && portal("manage", status.paymentAttention ? "Update payment method" : "Manage billing", status.paymentAttention ? "primary" : "secondary")}
          {source.paid && !source.cancelsAtPeriodEnd && (
            <ButtonLink href="/settings/cancel" variant="text">
              Cancel plan
            </ButtonLink>
          )}
          {billing.mode === "stripe" && (
            <form action={refreshBillingFormAction}>
              <Button type="submit" variant="text">
                Refresh status
              </Button>
            </form>
          )}
        </div>
      </Card>

      <section aria-labelledby="plans-heading" className={styles.plans}>
        <h2 id="plans-heading" className={styles.heading}>
          Plans
        </h2>
        {cards.map((card) => (
          <Card
            key={card.plan.code}
            title={card.plan.name}
            action={card.action.kind === "current" ? <Badge tone="info">Current</Badge> : undefined}
            className={card.action.kind === "current" ? styles.current : undefined}
          >
            <p className={styles.price}>{card.plan.pricing.status === "free" ? "No card, no charge" : card.price}</p>
            <ul className={styles.lines}>
              {card.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {card.action.kind === "subscribe" && (
              <form action={startCheckoutFormAction}>
                <input type="hidden" name="planCode" value={card.plan.code} />
                <Button type="submit">{`Subscribe to ${card.plan.name}`}</Button>
              </form>
            )}
            {card.action.kind === "change" && portal("change_plan", `Switch to ${card.plan.name}`)}
            {card.action.kind === "downgrade_to_free" && <p className={styles.muted}>Cancel your plan to move to Free at the end of the period - nothing is deleted.</p>}
            {card.action.kind === "unavailable" && <p className={styles.muted}>{card.action.reason}</p>}
          </Card>
        ))}
        <p className={styles.muted}>Payments are handled by Stripe. Rein Drop never sees or stores your card details.</p>
      </section>
    </>
  );
}
