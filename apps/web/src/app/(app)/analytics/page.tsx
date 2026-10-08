import type { Metadata } from "next";
import Link from "next/link";
import {
  analyticsRecommendation,
  funnelView,
  huntFormContext,
  marketplaceRowsView,
  missedView,
  overviewView,
  periodLabel,
  productRowsView,
} from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import styles from "./analytics.module.css";
import { AnalyticsNav, Bars, MetricTile, PeriodTabs, readPeriod, RecommendationBox, withPeriod } from "./parts";

export const metadata: Metadata = { title: "Analytics" };

const TOP_HUNTS = 3;
const TOP_PRODUCTS = 5;

/**
 * Analytics overview (screen 24): realized results first, then where they came from (Hunts,
 * products, marketplaces), missed potential kept apart, and one recommendation. No mascot in the
 * dense parts (Mascot Usage Guide, section 7).
 */
export default function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  return (
    <Protected>
      <Page title="Analytics" description="What you bought, what you sold, and what actually made money.">
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
  const view = overviewView(overview, ctx);
  const recommendation = analyticsRecommendation({ overview, hunts, products, missed }, ctx);
  const missedSummary = missedView(missed, ctx);
  const activeHunts = hunts.items.map((h) => funnelView(h, ctx)).filter((h) => !h.quiet).slice(0, TOP_HUNTS);
  const topProducts = productRowsView(products.items, ctx).slice(0, TOP_PRODUCTS);

  return (
    <div className={styles.stack}>
      {header}
      <p className={styles.muted}>
        {periodLabel(period)}. Realized = from sales you recorded. Estimated = Rein Drop&apos;s estimate, never profit.
      </p>

      {!view.hasActivity ? (
        <Card>
          <EmptyState
            title="Nothing bought or sold in this period"
            description="Analytics come from what you buy and sell. Mark a deal Bought, then mark it sold from Inventory, and your realized profit appears here."
            action={<ButtonLink href="/deals">Go to deals</ButtonLink>}
          />
        </Card>
      ) : (
        <section aria-labelledby="results" className={styles.section}>
          <h2 id="results" className="visually-hidden">
            Results
          </h2>
          <div className={styles.cards}>
            {view.cards.map((c) => (
              <MetricTile key={c.label} card={c} />
            ))}
          </div>
          {view.otherCurrencies.map((line) => (
            <p key={line} className={styles.small}>
              {line}
            </p>
          ))}
          <Card title="Money in vs realized profit">
            <Bars bars={view.moneyBars} label={`Capital deployed and realized profit, ${view.currency}`} />
          </Card>
        </section>
      )}

      {recommendation && <RecommendationBox recommendation={recommendation} period={period} />}

      <section aria-labelledby="hunts" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 id="hunts" className={styles.heading}>
            Hunts
          </h2>
          <Link href={withPeriod("/analytics/hunts", period)} className={styles.link}>
            All Hunts
          </Link>
        </div>
        {activeHunts.length === 0 ? (
          <p className={styles.muted}>No Hunt activity in this period.</p>
        ) : (
          activeHunts.map((h) => (
            <Card key={h.huntId} title={h.name} action={h.realized ? <span className={[styles.strong, styles[h.realized.tone]].join(" ")}>{h.realized.value}</span> : undefined}>
              <Bars bars={h.stages} label={`${h.name}: found to sold`} />
              {h.rates && <p className={styles.small}>{h.rates}</p>}
            </Card>
          ))
        )}
      </section>

      <section aria-labelledby="products" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 id="products" className={styles.heading}>
            Products
          </h2>
          <Link href={withPeriod("/analytics/products", period)} className={styles.link}>
            All products
          </Link>
        </div>
        {topProducts.length === 0 ? (
          <p className={styles.muted}>No products bought or sold in this period.</p>
        ) : (
          <Card title="Realized profit by product">
            <Bars
              bars={topProducts.map((p) => p.bar ?? { label: p.name, value: p.counts, widthPercent: 0, tone: "neutral" })}
              label="Realized profit by product"
            />
          </Card>
        )}
      </section>

      <section aria-labelledby="marketplaces" className={styles.section}>
        <h2 id="marketplaces" className={styles.heading}>
          Marketplaces
        </h2>
        <ul className={styles.list}>
          {marketplaceRowsView(marketplaces, ctx).map((m) => (
            <li key={m.name} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.itemTitle}>{m.name}</span>
                {m.realized && <span className={[styles.strong, styles[m.realized.tone]].join(" ")}>{m.realized.value} realized</span>}
              </div>
              <p className={styles.small}>Sourced: {m.sourced}</p>
              <p className={styles.small}>{m.soldHere}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="missed" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 id="missed" className={styles.heading}>
            Missed potential
          </h2>
          <Link href={withPeriod("/analytics/missed", period)} className={styles.link}>
            Details
          </Link>
        </div>
        <div className={styles.potential}>
          <p className={styles.itemTitle}>{missedSummary.headline}</p>
          {missedSummary.potential && (
            <p>
              <span className={styles.basis + " " + styles.basisEstimated}>Estimated</span> {missedSummary.potential.value}
            </p>
          )}
          <p className={styles.small}>Not a loss: missed deals never count against your profit.</p>
        </div>
      </section>
    </div>
  );
}
