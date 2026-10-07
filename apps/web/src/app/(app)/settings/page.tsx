import type { Metadata } from "next";
import Link from "next/link";
import { verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Badge, Button, Card, Page } from "@/components/ui";
import { PlaceholderNotice } from "../placeholder-notice";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Protected>
      <Page title="Settings" width="narrow">
        <PlaceholderNotice>Settings sections are listed but not editable yet.</PlaceholderNotice>

        <AccountCard />

        <Card title="Seller Snapshot">
          <p style={{ color: "var(--rd-text-muted)" }}>
            Your five onboarding answers will appear here.
          </p>
        </Card>

        <Card title="Plan & billing">
          <p style={{ color: "var(--rd-text-muted)" }}>Plans and pricing are not decided yet.</p>
        </Card>

        <Card title="Notifications">
          <p style={{ color: "var(--rd-text-muted)" }}>
            Deal alerts, operational alerts and the weekly insight will be configured here.
          </p>
        </Card>

        <Card title="Developer">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
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
