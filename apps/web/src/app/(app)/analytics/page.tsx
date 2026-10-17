import type { Metadata } from "next";
import Link from "next/link";
import {
  analyticsRecommendation,
  boughtVsMissedSeries,
  dealPurchaseDates,
  huntFormContext,
  MARKETPLACE_LABEL,
  overviewView,
  periodLabel,
} from "@rein-drop/client-core";
import type { Money } from "@rein-drop/api-client";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { BarList, ColumnChart, compactCount, KpiTiles, type BarDatum, type Kpi } from "@/components/charts";
import { ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import styles from "./analytics.module.css";
import { loadInventory } from "./inventory-pages";
import { AnalyticsNav, dealHref, dealsHref, huntHref, moneyIn, PeriodTabs, plural, readPeriod, RecommendationBox, sellHref, toneOfAmount, withPeriod } from "./parts";

export const metadata: Metadata = { title: "Analytics" };

const TOP_HUNTS = 3;
const MISSED_LINKS = 3;

/**
 * Analytics overview - "am I buying well?" (decision 0021): numbers and charts only. Every tile,
 * bar and column opens the detail (Deals, Hunts, Sell) or a small pop-up first. Selling results
 * per product / marketplace live in Sell > Insights.
 */
export default function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  return (
    <Protected>
      <Page title="Analytics" description="Are you buying well? Money in, what it made, and the deals that got away.">
        <OverviewLoader searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

async function OverviewLoader({ searchParams }: { searchParams: PageProps<"/analytics">["searchParams"] }) {
  const period = readPeriod(await searchParams);
  const session = await verifySession();
  const ctx = huntFormContext(session.user.locale);
  const api = await getServerApiClient();
  const data = await Promise.all([
    api.getAnalyticsOverview({ period }),
    api.getHuntAnalytics({ period }),
    api.getProductAnalytics({ period }),
    api.getMarketplaceAnalytics({ period }),
    api.getMissedPotential({ period }),
  ]).catch(() => null);

  const header = (
    <>
      <PeriodTabs path="/analytics" period={period} />
      <AnalyticsNav period={period} current="overview" />
    </>
  );
  if (!data) {
    return (
      <div className={styles.stack}>
        {header}
        <SystemBanner
          tone="error"
          title="Couldn't load your analytics"
          message="Rein Drop couldn't reach its server. Your records are safe - try again in a moment."
          action={<ButtonLink href={withPeriod("/analytics", period)} variant="secondary">Try again</ButtonLink>}
        />
      </div>
    );
  }
  const [overview, hunts, products, marketplaces, missed] = data;
  // Purchases over time aren't aggregated by the API: read the items (newest purchase first) back to the period start.
  const since = overview.period.since ? Date.parse(overview.period.since) : null;
  const inventory = await loadInventory(api, { status: "all" }, since === null ? undefined : (i) => Date.parse(i.purchase.purchasedAt) < since).catch(() => null);

  const view = overviewView(overview, ctx);
  const currency = view.currency;
  const money = moneyIn(currency, ctx.localeTag);
  const sum = (list: readonly Money[]) => list.filter((m) => m.currency === currency).reduce((s, m) => s + m.amountMinor, 0);
  const main = overview.realized.find((r) => r.currency === currency) ?? null;
  const closed = overview.closed.find((c) => c.currency === currency) ?? null;
  const spent = sum(overview.spent);
  const salesProfit = main?.realizedProfit.amountMinor ?? 0;
  const closedResult = closed?.realizedResult.amountMinor ?? 0;
  const net = sum(overview.netRealized);
  const held = sum(overview.holding.costBasis);
  const potential = sum(missed.estimatedPotential);
  const recommendation = analyticsRecommendation({ overview, hunts, products, missed }, ctx);
  const closedCount = (closed?.returned ?? 0) + (closed?.writtenOff ?? 0);
  const otherCurrencies = [
    ...overview.netRealized.filter((m) => m.currency !== currency && m.amountMinor !== 0).map((m) => `${moneyIn(m.currency, ctx.localeTag)(m.amountMinor)} net realized in ${m.currency}`),
    ...overview.spent.filter((m) => m.currency !== currency).map((m) => `${moneyIn(m.currency, ctx.localeTag)(m.amountMinor)} spent in ${m.currency}`),
  ];

  const tiles: Kpi[] = [
    {
      key: "spent",
      label: "Money in",
      value: money(spent),
      basis: "Activity",
      caption: `${plural(overview.buys, "item")} bought`,
      href: "/sell",
    },
    {
      key: "net",
      label: "Net realized",
      value: money(net),
      basis: "Realized",
      tone: toneOfAmount(net),
      caption: "Sales + returns and write-offs",
      detail: {
        title: `Net realized: ${money(net)}`,
        note: "Realized only - from sales you recorded, returns and write-offs. Never estimates.",
        facts: [
          { label: "From sales", value: `${money(salesProfit)} (${plural(main?.comparableSales ?? 0, "sale")})` },
          { label: "Returns and write-offs", value: `${money(closedResult)} (${plural(closedCount, "item")})` },
          { label: "Money in", value: money(spent) },
        ],
        links: [
          { label: "Sold items", href: sellHref("sold") },
          { label: "Returned and written off", href: sellHref("other") },
          { label: "Selling insights", href: withPeriod("/sell/insights", period) },
        ],
      },
    },
    {
      key: "held",
      label: "Held now",
      value: money(held),
      basis: "Now",
      caption: overview.holding.count > 0 ? `${plural(overview.holding.count, "item")}, oldest ${plural(overview.holding.oldestDays ?? 0, "day")}` : "Nothing held",
      href: sellHref("holding"),
    },
    {
      key: "missed",
      label: "Missed deals",
      value: String(missed.count),
      basis: "Estimated",
      caption: potential > 0 ? `${money(potential)} potential - never a loss` : "Strong deals you didn't buy",
      href: withPeriod("/analytics/missed", period),
    },
  ];

  const moneyBars: BarDatum[] = [
    { key: "spent", label: "Money in", sublabel: `${plural(overview.buys, "item")} bought`, amount: spent, value: money(spent), tone: "series1", href: "/sell" },
    {
      key: "sales",
      label: "Realized from sales",
      sublabel: plural(overview.sells, "sale"),
      amount: salesProfit,
      value: main ? money(salesProfit) : "-",
      tone: salesProfit < 0 ? "loss" : "profit",
      href: sellHref("sold"),
    },
    {
      key: "closed",
      label: "Returns and write-offs",
      sublabel: `${closed?.returned ?? 0} returned · ${closed?.writtenOff ?? 0} written off`,
      amount: closedResult,
      value: money(closedResult),
      tone: closedResult < 0 ? "loss" : "profit",
      href: sellHref("other"),
    },
    { key: "net", label: "Net realized", sublabel: "Sales + returns", amount: net, value: money(net), tone: net < 0 ? "loss" : "profit", href: withPeriod("/sell/insights", period) },
  ];

  const series = boughtVsMissedSeries({
    period: overview.period,
    localeTag: ctx.localeTag,
    boughtAt: inventory ? dealPurchaseDates(inventory.items) : [],
    boughtComplete: inventory?.complete ?? false,
    missed,
  });

  const activeHunts = hunts.items.filter((h) => h.found + h.bought + h.sold > 0).slice(0, TOP_HUNTS);
  const sourcing = marketplaces.items.filter((m) => m.sourced.found + m.sourced.bought > 0);
  const hasActivity = view.hasActivity || missed.count > 0 || hunts.items.some((h) => h.found > 0);

  return (
    <div className={styles.stack}>
      {header}
      <p className={styles.muted}>
        {periodLabel(period, ctx.t)}. Realized = from sales, returns and write-offs you recorded. Estimated = Rein Drop&apos;s estimate, never profit or loss.
      </p>

      {!hasActivity ? (
        <Card>
          <EmptyState
            title="Nothing bought or found in this period"
            description="Analytics come from what your Hunts find and what you buy. Mark a deal Bought and your numbers appear here."
            action={<ButtonLink href="/deals">Go to deals</ButtonLink>}
          />
        </Card>
      ) : (
        <>
          <section aria-labelledby="results" className={styles.section}>
            <h2 id="results" className="visually-hidden">
              Key numbers
            </h2>
            <KpiTiles id="kpi" tiles={tiles} />
            {otherCurrencies.map((line) => (
              <p key={line} className={styles.small}>
                Also {line} (not converted).
              </p>
            ))}
          </section>

          <Card title={`Money in vs money made (${currency})`}>
            <BarList id="money" label={`Money in and realized results, ${currency}`} bars={moneyBars} />
          </Card>

          <Card title="Deals bought vs missed">
            {series.buckets.length === 0 ? (
              <p className={styles.muted}>No deals bought or missed in this period.</p>
            ) : (
              <ColumnChart
                id="bought-missed"
                label="Deals bought and strong deals missed, over time"
                series={[
                  { key: "bought", label: "Bought", tone: "series1" },
                  { key: "missed", label: "Missed", tone: "series2" },
                ]}
                formatTick={(n) => compactCount(n, ctx.localeTag)}
                buckets={series.buckets.map((b) => {
                  const est = b.missedDeals.reduce((s, d) => s + (d.estimatedUpside?.currency === currency ? d.estimatedUpside.amountMinor : 0), 0);
                  return {
                    key: b.key,
                    label: b.label,
                    rangeLabel: b.rangeLabel,
                    values: [
                      { amount: b.bought, value: String(b.bought) },
                      { amount: b.missed, value: String(b.missed) },
                    ],
                    detail: {
                      title: b.rangeLabel,
                      facts: [
                        { label: "Deals bought", value: String(b.bought) },
                        { label: "Strong deals missed", value: String(b.missed) },
                        ...(est > 0 ? [{ label: "Missed potential (estimated)", value: money(est) }] : []),
                      ],
                      links: [
                        ...b.missedDeals.slice(0, MISSED_LINKS).map((d) => ({ label: `Missed: ${d.title}`, href: dealHref(d.dealId) })),
                        ...(b.bought > 0 ? [{ label: "Bought deals", href: dealsHref({ status: "bought" }) }] : []),
                        ...(b.missed > MISSED_LINKS ? [{ label: "All missed potential", href: withPeriod("/analytics/missed", period) }] : []),
                      ],
                    },
                  };
                })}
              />
            )}
            {!series.complete && (
              <p className={styles.small}>
                {series.missedShown < series.missedTotal
                  ? `Missed shows the ${series.missedShown} most valuable of ${series.missedTotal} missed deals.`
                  : "Only your latest purchases could be loaded, so older weeks may be short."}
              </p>
            )}
          </Card>

          {recommendation && <RecommendationBox recommendation={recommendation} period={period} />}

          <section aria-labelledby="hunts" className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 id="hunts" className={styles.heading}>
                Hunt funnel
              </h2>
              <Link href={withPeriod("/analytics/hunts", period)} className={styles.link}>
                All Hunts
              </Link>
            </div>
            {activeHunts.length === 0 ? (
              <p className={styles.muted}>No Hunt activity in this period.</p>
            ) : (
              <div className={styles.grid}>
                {activeHunts.map((h) => (
                  <Card key={h.huntId} title={<Link href={huntHref(h.huntId)}>{h.name}</Link>}>
                    <BarList
                      id={`funnel-${h.huntId}`}
                      label={`${h.name}: deals found, bought and sold`}
                      bars={[
                        { key: "found", label: "Deals found", amount: h.found, value: String(h.found), tone: "series1", href: dealsHref({ huntId: h.huntId, status: "all" }) },
                        { key: "bought", label: "Bought", amount: h.bought, value: String(h.bought), tone: "series1", href: dealsHref({ huntId: h.huntId, status: "bought" }) },
                        { key: "sold", label: "Sold", amount: h.sold, value: String(h.sold), tone: "series1", href: sellHref("sold") },
                      ]}
                    />
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="sources" className={styles.section}>
            <h2 id="sources" className={styles.heading}>
              Where your deals come from
            </h2>
            {sourcing.length === 0 ? (
              <p className={styles.muted}>No deals found or bought in this period.</p>
            ) : (
              <Card title="Deals bought by marketplace">
                <BarList
                  id="sources"
                  label="Deals bought by marketplace"
                  bars={sourcing.map((m) => {
                    const name = m.marketplace === "other" ? "Bought elsewhere" : MARKETPLACE_LABEL[m.marketplace];
                    return {
                      key: m.marketplace,
                      label: name,
                      sublabel: `${m.sourced.found} found · ${m.sourced.alerted} alerts · ${m.sourced.sold} sold`,
                      amount: m.sourced.bought,
                      value: `${m.sourced.bought} bought`,
                      tone: "series1",
                      href: m.marketplace === "other" ? "/sell" : dealsHref({ marketplace: m.marketplace, status: "bought" }),
                    };
                  })}
                />
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
