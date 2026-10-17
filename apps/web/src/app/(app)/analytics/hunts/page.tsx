import type { Metadata } from "next";
import Link from "next/link";
import type { HuntFunnel } from "@rein-drop/api-client";
import { funnelView, huntFormContext, periodLabel } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { BarList, type BarDatum } from "@/components/charts";
import { Badge, ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import styles from "../analytics.module.css";
import { AnalyticsNav, dealsHref, huntHref, PeriodTabs, readPeriod, sellHref, withPeriod } from "../parts";

export const metadata: Metadata = { title: "Hunt analytics" };

/**
 * Hunt analytics (screen 25), numbers and charts only: which Hunt turns deals into purchases, and
 * each Hunt's funnel. Every number opens that Hunt's deals (or the Hunt).
 */
export default function HuntAnalyticsPage({ searchParams }: PageProps<"/analytics/hunts">) {
  return (
    <Protected>
      <Page title="Hunt analytics" description="How each Hunt turns deals into purchases and sales.">
        <HuntsLoader searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

const statusLabel = (s: string) => (s === "LIVE" ? "Live" : s.charAt(0) + s.slice(1).toLowerCase());

async function HuntsLoader({ searchParams }: { searchParams: PageProps<"/analytics/hunts">["searchParams"] }) {
  const period = readPeriod(await searchParams);
  const session = await verifySession();
  const ctx = huntFormContext(session.user.locale);
  const api = await getServerApiClient();
  const hunts = await api.getHuntAnalytics({ period }).catch(() => null);

  const header = (
    <>
      <PeriodTabs path="/analytics/hunts" period={period} />
      <AnalyticsNav period={period} current="hunts" />
      <p className={styles.muted}>{periodLabel(period, ctx.t)}. Each step counts what happened in the period; profit is realized from recorded sales.</p>
    </>
  );
  if (!hunts) {
    return (
      <div className={styles.stack}>
        {header}
        <SystemBanner tone="error" title="Couldn't load Hunt analytics" message="Try again in a moment." action={<ButtonLink href={withPeriod("/analytics/hunts", period)} variant="secondary">Try again</ButtonLink>} />
      </div>
    );
  }
  if (hunts.items.length === 0) {
    return (
      <div className={styles.stack}>
        {header}
        <Card>
          <EmptyState title="No Hunts yet" description="Create a Hunt and its funnel appears here." action={<ButtonLink href="/hunts/new">Create Hunt</ButtonLink>} />
        </Card>
      </div>
    );
  }

  const views = hunts.items.map((h) => ({ h, view: funnelView(h, ctx) }));
  const active = views.filter((v) => !v.view.quiet);
  const quiet = views.filter((v) => v.view.quiet);

  return (
    <div className={styles.stack}>
      {header}
      {active.length === 0 ? (
        <p className={styles.muted}>None of your Hunts had activity in this period.</p>
      ) : (
        <>
          <Card title="Deals bought by Hunt">
            <BarList
              id="by-hunt"
              label="Deals bought by Hunt"
              bars={active.map(({ h, view }) => ({
                key: h.huntId,
                label: h.name,
                sublabel: `${h.found} found · ${h.sold} sold`,
                amount: h.bought,
                value: `${h.bought} bought`,
                tone: "series1",
                detail: {
                  title: h.name,
                  facts: [
                    { label: "Deals found", value: String(h.found) },
                    { label: "Alerts", value: String(h.alerted) },
                    { label: "Bought", value: String(h.bought) },
                    { label: "Sold", value: String(h.sold) },
                    { label: "Realized profit", value: view.realized?.value ?? "No sales yet" },
                  ],
                  links: [
                    { label: "This Hunt's deals", href: dealsHref({ huntId: h.huntId, status: "all" }) },
                    { label: "Deals bought", href: dealsHref({ huntId: h.huntId, status: "bought" }) },
                    { label: "Open the Hunt", href: huntHref(h.huntId) },
                  ],
                },
              }))}
            />
          </Card>

          <section aria-labelledby="funnels" className={styles.section}>
            <h2 id="funnels" className={styles.heading}>
              Funnel per Hunt
            </h2>
            <div className={styles.grid}>
              {active.map(({ h, view }) => (
                <Card key={h.huntId} title={<Link href={huntHref(h.huntId)}>{h.name}</Link>} action={<Badge tone={h.status === "LIVE" ? "profit" : "neutral"}>{statusLabel(h.status)}</Badge>}>
                  <BarList id={`funnel-${h.huntId}`} label={`${h.name}: found to sold`} bars={funnelBars(h)} />
                  <p className={styles.small}>
                    {[`${h.ignored} ignored`, view.rates].filter(Boolean).join(" · ")}
                    {" · "}
                    Realized profit:{" "}
                    {view.realized ? <span className={[styles.strong, styles[view.realized.tone]].join(" ")}>{view.realized.value}</span> : "no sales yet"}
                  </p>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}

      {quiet.length > 0 && (
        <p className={styles.small}>
          No activity in this period:{" "}
          {quiet.map(({ h }, i) => (
            <span key={h.huntId}>
              {i > 0 && ", "}
              <Link href={huntHref(h.huntId)}>{h.name}</Link>
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}

/** Found -> alerted -> viewed -> saved -> bought -> sold; each stage opens the matching deals. */
function funnelBars(h: HuntFunnel): BarDatum[] {
  const stage = (key: string, label: string, n: number, href: string): BarDatum => ({ key, label, amount: n, value: String(n), tone: "series1", href });
  return [
    stage("found", "Found", h.found, dealsHref({ huntId: h.huntId, status: "all" })),
    // The Alerts list has no Hunt filter: closest view.
    stage("alerted", "Alerted", h.alerted, "/alerts"),
    stage("viewed", "Viewed", h.viewed, dealsHref({ huntId: h.huntId, status: "seen" })),
    stage("saved", "Saved", h.saved, dealsHref({ huntId: h.huntId, status: "saved" })),
    stage("bought", "Bought", h.bought, dealsHref({ huntId: h.huntId, status: "bought" })),
    // Sell has no Hunt filter: the Sold section.
    stage("sold", "Sold", h.sold, sellHref("sold")),
  ];
}
