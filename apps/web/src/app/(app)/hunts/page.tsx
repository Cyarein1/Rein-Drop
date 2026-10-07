import type { Metadata } from "next";
import type { Hunt, HuntStatus } from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";
import { Protected } from "@/auth/Protected";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Page,
  SystemBanner,
  type BadgeProps,
} from "@/components/ui";
import styles from "./hunts.module.css";

export const metadata: Metadata = { title: "Hunts" };

const STATUS: Record<HuntStatus, { label: string; tone: BadgeProps["tone"] }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  LIVE: { label: "Live", tone: "action" },
  PAUSED: { label: "Paused", tone: "info" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

const MARKETPLACE: Record<string, string> = { ebay: "eBay", facebook: "Facebook Marketplace" };

export default function HuntsPage({ searchParams }: PageProps<"/hunts">) {
  return (
    <Protected>
      <Page
        title="Hunts"
        description="Everything Rein Drop is watching for you."
        actions={<ButtonLink href="/hunts/new">Create Hunt</ButtonLink>}
      >
        <HuntList searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

async function HuntList({ searchParams }: { searchParams: PageProps<"/hunts">["searchParams"] }) {
  const api = await getServerApiClient();
  const [{ items }, params] = await Promise.all([api.listHunts({ limit: 50 }), searchParams]);
  const created =
    typeof params.created === "string" ? items.find((h) => h.id === params.created) : undefined;

  return (
    <>
      {created && (
        <SystemBanner
          tone="success"
          title="Hunt saved as a draft"
          message={`"${created.name}" is ready. Monitoring starts after plan selection - coming soon.`}
        />
      )}
      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="No Hunts yet"
            description="A Hunt is a saved search Rein Drop keeps checking on eBay and Facebook Marketplace."
            action={<ButtonLink href="/hunts/new">Create your first Hunt</ButtonLink>}
          />
        </Card>
      ) : (
        <ul className={styles.list}>
          {items.map((hunt) => (
            <li key={hunt.id}>
              <HuntCard hunt={hunt} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function HuntCard({ hunt }: { hunt: Hunt }) {
  const status = STATUS[hunt.status];
  return (
    <Card title={hunt.name} action={<Badge tone={status.tone}>{status.label}</Badge>}>
      <p className={styles.meta}>
        {hunt.marketplaces.map((m) => MARKETPLACE[m] ?? m).join(" · ")}
        {hunt.location ? ` · ${hunt.location.text}` : ""}
      </p>
    </Card>
  );
}
