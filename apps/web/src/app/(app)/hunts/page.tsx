import type { Metadata } from "next";
import Link from "next/link";
import type { Hunt, HuntActivity } from "@rein-drop/api-client";
import {
  countsLine,
  HUNT_FILTERS,
  HUNT_STATUS_LABEL,
  joinList,
  MARKETPLACE_LABEL,
  monitoringLine,
  type HuntListFilter,
} from "@rein-drop/client-core";
import { getServerApiClient } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Badge, ButtonLink, Card, EmptyState, Page, Spinner, SystemBanner } from "@/components/ui";
import { SourceBanner } from "@/components/SourceBanner";
import styles from "./hunts.module.css";

export const metadata: Metadata = { title: "Hunts" };

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
  const params = await searchParams;
  const requested = typeof params.status === "string" ? params.status : "all";
  const filter: HuntListFilter = HUNT_FILTERS.find((f) => f.value === requested)?.value ?? "all";
  const api = await getServerApiClient();
  const result = await Promise.all([
    api.listHunts({ limit: 100, ...(filter === "all" ? {} : { status: filter }) }),
    api.listHuntActivity(),
  ]).catch(() => null);
  // Advisory: if it can't be loaded the page still works, just without the source status line.
  const health = await api.getSourceHealth().catch(() => null);

  const tabs = (
    <nav aria-label="Hunt status" className={styles.tabs}>
      {HUNT_FILTERS.map((f) => (
        <Link
          key={f.value}
          href={f.value === "all" ? "/hunts" : `/hunts?status=${f.value}`}
          className={styles.tab}
          aria-current={filter === f.value ? "page" : undefined}
        >
          {f.label}
        </Link>
      ))}
    </nav>
  );

  if (!result) {
    return (
      <>
        {tabs}
        <SystemBanner
          tone="error"
          title="Couldn't load your Hunts"
          message="Rein Drop couldn't reach its server. Try again in a moment."
          action={<ButtonLink href="/hunts" variant="secondary">Try again</ButtonLink>}
        />
      </>
    );
  }
  const [{ items }, activities] = result;
  const activityOf = new Map(activities.map((a) => [a.huntId, a]));
  const created = typeof params.created === "string" ? items.find((h) => h.id === params.created) : undefined;

  return (
    <>
      {created && (
        <SystemBanner
          tone="success"
          title="Hunt saved as a draft"
          message={`"${created.name}" is ready. Choose Start watching when you want monitoring to begin.`}
        />
      )}
      <SourceBanner sources={health?.items ?? null} now={new Date(health?.generatedAt ?? 0)} />
      {tabs}
      {items.length === 0 ? (
        <Card>
          <EmptyHunts filter={filter} />
        </Card>
      ) : (
        <ul className={styles.list}>
          {items.map((hunt) => (
            <li key={hunt.id}>
              <HuntCard hunt={hunt} activity={activityOf.get(hunt.id) ?? null} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EmptyHunts({ filter }: { filter: HuntListFilter }) {
  if (filter === "all") {
    return (
      <EmptyState
        title="No Hunts yet"
        description="A Hunt is a saved search Rein Drop keeps checking on eBay and Facebook Marketplace."
        action={<ButtonLink href="/hunts/new">Create your first Hunt</ButtonLink>}
      />
    );
  }
  const copy: Record<Exclude<HuntListFilter, "all">, string> = {
    LIVE: "No active Hunts. Start watching a draft, or resume a paused Hunt.",
    PAUSED: "No paused Hunts.",
    DRAFT: "No drafts.",
    ARCHIVED: "Nothing archived. Archived Hunts stop watching and can be restored.",
  };
  return <EmptyState title={`No ${HUNT_FILTERS.find((f) => f.value === filter)!.label.toLowerCase()} Hunts`} description={copy[filter]} />;
}

function HuntCard({ hunt, activity }: { hunt: Hunt; activity: HuntActivity | null }) {
  const status = HUNT_STATUS_LABEL[hunt.status];
  const monitoring = monitoringLine(hunt, activity);
  const counts = countsLine(activity);
  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>
          <Link href={`/hunts/${hunt.id}`} className={styles.stretched}>
            {hunt.name}
          </Link>
        </h2>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className={styles.meta}>
        {joinList(hunt.marketplaces.map((m) => MARKETPLACE_LABEL[m]))}
        {hunt.location ? ` · ${hunt.location.text}` : ""}
      </p>
      <p className={styles.monitoring} data-tone={monitoring.tone}>
        {monitoring.scanning && <Spinner size="sm" />}
        {monitoring.text}
      </p>
      {counts && <p className={styles.counts}>{counts}</p>}
      {hunt.status === "DRAFT" && (
        <div className={styles.cardAction}>
          <ButtonLink href={`/hunts/${hunt.id}/start`} variant="secondary">
            Start watching
          </ButtonLink>
        </div>
      )}
    </article>
  );
}
