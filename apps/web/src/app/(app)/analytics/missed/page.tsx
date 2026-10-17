import type { Metadata } from "next";
import type { MissedDeal, MissedPotential, Money } from "@rein-drop/api-client";
import { boughtVsMissedSeries, chartCurrency, huntFormContext, MARKETPLACE_LABEL, missedGroups, periodLabel } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { BarList, ColumnChart, compactCount, KpiTiles, type MarkDetail } from "@/components/charts";
import { ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import styles from "../analytics.module.css";
import { AnalyticsNav, dealHref, dealsHref, huntHref, moneyIn, PeriodTabs, plural, readPeriod, withPeriod } from "../parts";

export const metadata: Metadata = { title: "Missed potential" };

const DEAL_LINKS = 3;

/**
 * Missed potential (screen 27) as numbers and charts: how many strong deals got away, when, from
 * which Hunt and marketplace. Each bar opens a pop-up with a few numbers and the deals themselves.
 * Potential is an estimate - never a loss, never profit colours.
 */
export default function MissedPotentialPage({ searchParams }: PageProps<"/analytics/missed">) {
  return (
    <Protected>
      <Page title="Missed potential" description="Strong deals you didn't buy. Potential, not a loss.">
        <MissedLoader searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

async function MissedLoader({ searchParams }: { searchParams: PageProps<"/analytics/missed">["searchParams"] }) {
  const period = readPeriod(await searchParams);
  const session = await verifySession();
  const ctx = huntFormContext(session.user.locale);
  const api = await getServerApiClient();
  const missed = await api.getMissedPotential({ period }).catch(() => null);

  const header = (
    <>
      <PeriodTabs path="/analytics/missed" period={period} />
      <AnalyticsNav period={period} current="missed" />
    </>
  );
  if (!missed) {
    return (
      <div className={styles.stack}>
        {header}
        <SystemBanner tone="error" title="Couldn't load missed potential" message="Try again in a moment." action={<ButtonLink href={withPeriod("/analytics/missed", period)} variant="secondary">Try again</ButtonLink>} />
      </div>
    );
  }
  if (missed.count === 0) {
    return (
      <div className={styles.stack}>
        {header}
        <Card>
          <EmptyState
            title="No strong deals got away"
            description={`${periodLabel(period, ctx.t)}: every strong deal was either bought or is still open.`}
            action={<ButtonLink href="/deals" variant="secondary">See open deals</ButtonLink>}
          />
        </Card>
      </div>
    );
  }
  return (
    <div className={styles.stack}>
      {header}
      <MissedCharts missed={missed} ctx={{ currency: ctx.currency, localeTag: ctx.localeTag }} label={periodLabel(period, ctx.t)} />
    </div>
  );
}

function MissedCharts({ missed, ctx, label }: { missed: MissedPotential; ctx: { currency: string; localeTag: string }; label: string }) {
  const currency = chartCurrency(ctx.currency, missed.estimatedPotential);
  const money = moneyIn(currency, ctx.localeTag);
  const estimate = (list: readonly (Money | null)[]) => list.reduce((s, m) => s + (m?.currency === currency ? m.amountMinor : 0), 0);
  const potential = estimate(missed.estimatedPotential);
  const series = boughtVsMissedSeries({ period: missed.period, localeTag: ctx.localeTag, boughtAt: [], missed });
  const partial = missed.items.length < missed.count;

  /** The pop-up for a group of missed deals: a few numbers, the deals themselves, then the list. */
  const groupDetail = (title: string, deals: MissedDeal[], more: { label: string; href: string }): MarkDetail => {
    const est = estimate(deals.map((d) => d.estimatedUpside));
    return {
      title,
      note: "Estimated potential - never a loss.",
      facts: [
        { label: "Missed deals", value: String(deals.length) },
        { label: "Gone before you bought", value: String(deals.filter((d) => d.reason === "gone").length) },
        { label: "You passed", value: String(deals.filter((d) => d.reason === "ignored").length) },
        ...(est > 0 ? [{ label: "Potential (estimated)", value: money(est) }] : []),
      ],
      links: [...deals.slice(0, DEAL_LINKS).map((d) => ({ label: d.title, href: dealHref(d.dealId) })), more],
    };
  };

  const byHunt = missedGroups(missed, (d) => d.hunt.id);
  const byMarketplace = missedGroups(missed, (d) => d.marketplace);

  return (
    <>
      <p className={styles.muted}>
        {label}. Strong deals found in the period that were never bought and are no longer open. Potential is Rein Drop&apos;s estimate - it never counts as a loss.
      </p>
      <section aria-labelledby="missed-numbers" className={styles.section}>
        <h2 id="missed-numbers" className="visually-hidden">
          Key numbers
        </h2>
        <KpiTiles
          id="missed-kpi"
          tiles={[
            { key: "count", label: "Missed deals", value: String(missed.count), basis: "Activity", caption: "Strong or exceptional", href: dealsHref({ status: "all" }) },
            { key: "gone", label: "Gone before you bought", value: String(missed.gone), basis: "Activity", caption: "Sold, removed or expired", href: dealsHref({ status: "unavailable" }) },
            { key: "ignored", label: "You passed", value: String(missed.ignored), basis: "Activity", caption: "Marked Not for me", href: dealsHref({ status: "ignored" }) },
            {
              key: "potential",
              label: "Potential",
              value: potential > 0 ? money(potential) : "-",
              basis: "Estimated",
              caption: missed.withEstimate < missed.count ? `${missed.withEstimate} of ${missed.count} had an estimate` : "Never a loss",
              href: dealsHref({ status: "all" }),
            },
          ]}
        />
      </section>

      <Card title="Missed deals over time">
        <ColumnChart
          id="missed-time"
          label="Strong deals missed, over time"
          series={[{ key: "missed", label: "Missed", tone: "series2" }]}
          formatTick={(n) => compactCount(n, ctx.localeTag)}
          buckets={series.buckets.map((b) => ({
            key: b.key,
            label: b.label,
            rangeLabel: b.rangeLabel,
            values: [{ amount: b.missed, value: String(b.missed) }],
            ...(b.missed > 0 ? { detail: groupDetail(b.rangeLabel, b.missedDeals, { label: "All deals", href: dealsHref({ status: "all" }) }) } : {}),
          }))}
        />
        {partial && <p className={styles.small}>Charts show the {missed.items.length} most valuable of {missed.count} missed deals; the numbers above count them all.</p>}
      </Card>

      <div className={styles.grid}>
        <Card title="By Hunt">
          <BarList
            id="missed-hunt"
            label="Missed deals by Hunt"
            bars={byHunt.map((g) => {
              const hunt = g.deals[0]!.hunt;
              return {
                key: g.key,
                label: hunt.name,
                sublabel: `${g.gone} gone · ${g.ignored} passed`,
                amount: g.deals.length,
                value: String(g.deals.length),
                tone: "series2",
                detail: {
                  ...groupDetail(hunt.name, g.deals, { label: "This Hunt's deals", href: dealsHref({ huntId: hunt.id, status: "all" }) }),
                  links: [
                    ...g.deals.slice(0, DEAL_LINKS).map((d) => ({ label: d.title, href: dealHref(d.dealId) })),
                    { label: "This Hunt's deals", href: dealsHref({ huntId: hunt.id, status: "all" }) },
                    { label: "Open the Hunt", href: huntHref(hunt.id) },
                  ],
                },
              };
            })}
          />
        </Card>
        <Card title="By marketplace">
          <BarList
            id="missed-marketplace"
            label="Missed deals by marketplace"
            bars={byMarketplace.map((g) => ({
              key: g.key,
              label: MARKETPLACE_LABEL[g.key],
              sublabel: `${g.gone} gone · ${g.ignored} passed`,
              amount: g.deals.length,
              value: String(g.deals.length),
              tone: "series2",
              detail: groupDetail(MARKETPLACE_LABEL[g.key], g.deals, { label: `All ${MARKETPLACE_LABEL[g.key]} deals`, href: dealsHref({ marketplace: g.key, status: "all" }) }),
            }))}
          />
        </Card>
      </div>
      <p className={styles.small}>{plural(missed.count, "missed deal")} in total. Missed deals never count against your profit.</p>
    </>
  );
}
