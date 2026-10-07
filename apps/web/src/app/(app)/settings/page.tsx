import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/auth/session";
import { Badge, Button, Card, Page } from "@/components/ui";
import { PlaceholderNotice } from "../placeholder-notice";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getSession();

  return (
    <Page title="Settings" width="narrow">
      <PlaceholderNotice>Settings sections are listed but not editable yet.</PlaceholderNotice>

      <Card
        title="Account"
        action={session.isPlaceholder ? <Badge tone="info">Placeholder session</Badge> : undefined}
      >
        <p>{session.user.email}</p>
        <p style={{ color: "var(--rd-text-muted)", fontSize: 14 }}>
          Sign-in is not implemented yet - everyone is signed in as this local development user.
        </p>
        <div>
          <Button variant="secondary" disabled>
            Sign out
          </Button>
        </div>
      </Card>

      <Card title="Seller Snapshot">
        <p style={{ color: "var(--rd-text-muted)" }}>Your five onboarding answers will appear here.</p>
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
  );
}
