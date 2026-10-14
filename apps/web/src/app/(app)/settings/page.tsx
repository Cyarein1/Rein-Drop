import type { Metadata } from "next";
import Link from "next/link";
import { huntFormContext, snapshotAnswerRows } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { billingPortalFormAction } from "../billing-actions";
import { Protected } from "@/auth/Protected";
import { Badge, Button, ButtonLink, Card, Page, SystemBanner } from "@/components/ui";
import { PlaceholderNotice } from "../placeholder-notice";
import { loadLocationSupport } from "@/geo/load";
import { AreaSettings } from "./AreaSettings";
import { NotificationSettings } from "./NotificationSettings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <Protected>
      <Page title="Settings" width="narrow">
        <BillingNotice searchParams={searchParams} />
        <PlaceholderNotice>Most settings sections are listed but not editable yet.</PlaceholderNotice>

        <AccountCard />

        <AreaCard />

        <SellerSnapshotCard />

        <PlanCard />

        <NotificationsCard />

        <Card title="Developer">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              <Link href="/dev/notifications">Notification simulator log</Link>
            </li>
            <li>
              <Link href="/dev">System status</Link>
            </li>
            <li>
              <Link href="/dev/ui">UI primitives gallery</Link>
            </li>
          </ul>
        </Card>
      </Page>
    </Protected>
  );
}

/** Current plan and its live-Hunt use; cancellation is a placeholder flow until billing exists (D2). */
/** Shown after the billing portal couldn't be opened (?billing=unavailable). */
async function BillingNotice({ searchParams }: { searchParams: PageProps<"/settings">["searchParams"] }) {
  if ((await searchParams).billing !== "unavailable") return null;
  return <SystemBanner tone="error" title="Couldn't open billing" message="Rein Drop couldn't reach the billing service. Please try again in a moment." />;
}

async function PlanCard() {
  const [session, api] = await Promise.all([verifySession(), getServerApiClient()]);
  const [ent, billing] = await Promise.all([api.getEntitlements(), api.getBillingInfo()]).catch(() => [null, null] as const);
  const muted = { color: "var(--rd-text-muted)" };
  if (!ent || !billing) {
    return (
      <Card title="Plan & billing">
        <SystemBanner tone="error" title="Couldn't load your plan" message="Refresh the page to try again." />
      </Card>
    );
  }
  const limit = ent.entitlements.activeHunts.limit;
  const sub = ent.subscription;
  const date = (iso: string) => new Intl.DateTimeFormat(huntFormContext(session.user.locale).localeTag, { dateStyle: "medium" }).format(new Date(iso));
  const renewal =
    sub?.provider === "stripe" && sub.currentPeriodEnd
      ? sub.cancelAtPeriodEnd
        ? `Cancelled - ends ${date(sub.currentPeriodEnd)}, then you move to Free.`
        : sub.status === "PAST_DUE"
          ? "Your last payment didn't go through - update your payment method in billing."
          : `Renews ${date(sub.currentPeriodEnd)}.`
      : null;
  return (
    <Card title="Plan & billing" action={<Badge tone="neutral">{ent.plan.name}</Badge>}>
      <p>
        {limit === null ? `${ent.usage.activeHunts} live Hunts (no limit)` : `${ent.usage.activeHunts} of ${limit} live ${limit === 1 ? "Hunt" : "Hunts"} in use`}
      </p>
      {renewal && <p>{renewal}</p>}
      {!ent.plan.limitsFinal && <p style={muted}>Limits are placeholders until plans are final.</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <ButtonLink href="/settings/billing">Plans & billing</ButtonLink>
        {billing.canManage && (
          // Payment method, invoices, plan changes and cancellation live in Stripe's billing portal.
          <form action={billingPortalFormAction}>
            <input type="hidden" name="flow" value="manage" />
            <input type="hidden" name="returnPath" value="/settings" />
            <Button type="submit" variant="secondary">
              Manage billing
            </Button>
          </form>
        )}
        {ent.plan.code !== "free" && (
          <ButtonLink href="/settings/cancel" variant="text">
            Cancel plan
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}

/** The five onboarding answers, editable (Screenbook frame 30). */
async function SellerSnapshotCard() {
  const [session, api] = await Promise.all([verifySession(), getServerApiClient()]);
  const snapshot = await api.getSellerSnapshot().catch(() => null);
  const muted = { color: "var(--rd-text-muted)" };

  if (!snapshot) {
    return (
      <Card title="Seller Snapshot">
        <SystemBanner tone="error" title="Couldn't load your answers" message="Refresh the page to try again." />
      </Card>
    );
  }
  if (snapshot.status === "not_started") {
    return (
      <Card title="Seller Snapshot">
        <p style={muted}>Five quick questions set Rein Drop up around how you source.</p>
        <div>
          <ButtonLink href="/onboarding">Set up now</ButtonLink>
        </div>
      </Card>
    );
  }
  if (snapshot.status === "not_reseller") {
    return (
      <Card title="Seller Snapshot">
        <p style={muted}>You told us you&apos;re not reselling right now - that experience is coming soon.</p>
        <div>
          <ButtonLink href="/onboarding?edit=1" variant="secondary">
            Change my answer
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const rows = snapshotAnswerRows(snapshot, huntFormContext(session.user.locale));
  return (
    <Card
      title="Seller Snapshot"
      action={snapshot.status === "in_progress" ? <Badge tone="fresh">Not finished</Badge> : undefined}
    >
      <dl style={{ margin: 0, display: "grid", gap: 12 }}>
        {rows.map((row) => (
          <div key={row.question}>
            <dt style={{ ...muted, fontSize: 14 }}>{row.question}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{row.answer}</dd>
          </div>
        ))}
      </dl>
      <p style={{ ...muted, fontSize: 14 }}>
        These answers set the defaults for new Hunts. Changing them never changes existing Hunts.
      </p>
      <div>
        <ButtonLink href={snapshot.status === "in_progress" ? "/onboarding" : "/onboarding?edit=1"} variant="secondary">
          {snapshot.status === "in_progress" ? "Finish setting up" : "Edit answers"}
        </ButtonLink>
      </div>
    </Card>
  );
}

async function AccountCard() {
  const session = await verifySession();
  return (
    <Card
      title="Account"
      action={session.isDevelopment ? <Badge tone="info">Development sign-in</Badge> : undefined}
    >
      <p>{session.user.email}</p>
      {session.isDevelopment ? (
        <p style={{ color: "var(--rd-text-muted)", fontSize: 14 }}>
          Signed in automatically as the seeded local user (development only) - there is nothing to sign out of.
        </p>
      ) : (
        // POST only, so a link or image can't sign anyone out.
        <form action="/auth/sign-out" method="post">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      )}
    </Card>
  );
}

/** "Your area" (decision 0017): the default location for new Hunts. */
async function AreaCard() {
  const api = await getServerApiClient();
  const { geo, area } = await loadLocationSupport(api);
  return (
    <section id="your-area" aria-label="Your area">
      <Card title="Your area">
        <AreaSettings initial={area} geo={geo} />
      </Card>
    </section>
  );
}

/** Notification preferences (Screenbook frame 28). */
async function NotificationsCard() {
  const api = await getServerApiClient();
  const prefs = await api.getNotificationPreferences().catch(() => null);
  return (
    <Card title="Notifications" action={<ButtonLink href="/alerts" variant="text">Open inbox</ButtonLink>}>
      {prefs ? (
        <NotificationSettings initial={prefs} />
      ) : (
        <SystemBanner tone="error" title="Couldn't load your notification settings" message="Refresh the page to try again." />
      )}
    </Card>
  );
}
