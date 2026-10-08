import type { Metadata } from "next";
import Link from "next/link";
import { funnelView, huntFormContext, periodLabel } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Badge, ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import styles from "../analytics.module.css";
import { AnalyticsNav, Bars, PeriodTabs, readPeriod, withPeriod } from "../parts";

export const metadata: Metadata = { title: "Hunt analytics" };

/** Hunt analytics (screen 25): found -> alerted -> viewed -> saved -> bought -> sold, per Hunt. */
export default function HuntAnalyticsPage({ searchParams }: PageProps<"/analytics/hunts">) {
  return (
    <Protected>
      <Page title="Hunt analytics" description="How each Hunt turns deals into purchases and sales.">
        <HuntsLoader searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

async function HuntsLoader({ searchParams }: { searchParams: PageProps<"/analytics/hunts">["searchParams"] }) {
  const period = readPeriod(await searchParams);
  const session = await verifySession();
  const ctx = huntFormContext(session.user.locale);
  const api = await getServerApiClient();
  const hunts = await api.getHuntAnalytics({ period }).catch(() => null);

  return (
    <div className={styles.stack}>
      <PeriodTabs path="/analytics/hunts" period={period} />
      <AnalyticsNav period={period} current="hunts" />
      <p className={styles.muted}>{periodLabel(period)}. Each step counts what happened in the period; profit is realized from recorded sales.</p>
      {!hunts ? (
        <SystemBanner
          tone="error"
          title="Couldn't load Hunt analytics"
          message="Try again in a moment."
          action={<ButtonLink href={withPeriod("/analytics/hunts", period)} variant="secondary">Try again</ButtonLink>}
        />
      ) : hunts.items.length === 0 ? (
        <Card>
          <EmptyState title="No Hunts yet" description="Create a Hunt and its funnel appears here." action={<ButtonLink href="/hunts/new">Create Hunt</ButtonLink>} />
        </Card>
      ) : (
        hunts.items.map((h) => {
          const view = funnelView(h, ctx);
          return (
            <Card
              key={h.huntId}
              title={<Link href={`/hunts/${h.huntId}`}>{h.name}</Link>}
              action={<Badge tone={h.status === "LIVE" ? "profit" : "neutral"}>{h.status === "LIVE" ? "Live" : h.status.charAt(0) + h.status.slice(1).toLowerCase()}</Badge>}
            >
              {view.quiet ? (
                <p className={styles.muted}>Nothing happened in this period.</p>
              ) : (
                <>
                  <Bars bars={view.stages} label={`${h.name}: found to sold`} />
                  <p className={styles.small}>{[`${h.ignored} ignored`, view.rates].filter(Boolean).join(" · ")}</p>
                  <p>
                    Realized profit:{" "}
                    {view.realized ? <span className={[styles.strong, styles[view.realized.tone]].join(" ")}>{view.realized.value}</span> : <span className={styles.muted}>no sales yet</span>}
                  </p>
                </>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
