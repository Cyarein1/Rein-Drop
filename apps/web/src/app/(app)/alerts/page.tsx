import type { Metadata } from "next";
import { getServerApiClient } from "@/auth";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import { AlertInbox } from "./AlertInbox";

export const metadata: Metadata = { title: "Inbox" };

export default function AlertsPage() {
  return (
    <Protected>
      <Page title="Inbox" description="Every alert Rein Drop sent you, newest first." width="narrow">
        <InboxLoader />
      </Page>
    </Protected>
  );
}

async function InboxLoader() {
  const api = await getServerApiClient();
  const page = await api.listAlerts({ limit: 50 }).catch(() => null);
  if (!page) {
    return (
      <SystemBanner
        tone="error"
        title="Couldn't load your inbox"
        message="Rein Drop couldn't reach its server. Try again in a moment."
        action={<ButtonLink href="/alerts" variant="secondary">Try again</ButtonLink>}
      />
    );
  }
  if (page.items.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No alerts yet"
          description="Rein Drop alerts you only when a live Hunt finds something worth acting on. Your deals feed shows everything else."
          action={<ButtonLink href="/deals" variant="secondary">Open deals</ButtonLink>}
        />
      </Card>
    );
  }
  return <AlertInbox initial={page.items} initialUnread={page.unreadCount} />;
}
