import type { Metadata } from "next";
import Link from "next/link";
import { huntFormContext, snapshotAnswerRows } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Badge, Button, ButtonLink, Card, Page, SystemBanner } from "@/components/ui";
import { PlaceholderNotice } from "../placeholder-notice";
import { NotificationSettings } from "./NotificationSettings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Protected>
      <Page title="Settings" width="narrow">
        <PlaceholderNotice>Most settings sections are listed but not editable yet.</PlaceholderNotice>

        <AccountCard />

        <SellerSnapshotCard />

        <Card title="Plan & billing">
          <p style={{ color: "var(--rd-text-muted)" }}>Plans and pricing are not decided yet.</p>
        </Card>

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
      {session.isDevelopment && (
        <p style={{ color: "var(--rd-text-muted)", fontSize: 14 }}>
          Signed in automatically as the seeded local user (development only). Real sign-in arrives
          with the managed auth provider.
        </p>
      )}
      <div>
        {/* TODO(auth): sign-out comes with the managed provider. */}
        <Button variant="secondary" disabled>
          Sign out
        </Button>
      </div>
    </Card>
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
