import type { Metadata } from "next";
import Link from "next/link";
import type { InventoryItem, Money } from "@rein-drop/api-client";
import {
  closedInPeriod,
  huntFormContext,
  itemCostBasis,
  itemRealized,
  MARKETPLACE_LABEL,
  overviewView,
  periodLabel,
  profitOverTime,
  sellingByMarketplace,
  slowSellers,
  soldInPeriod,
  tiedUp,
} from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { BarList, ColumnChart, compactMoney, KpiTiles, PeriodTabs, readPeriod, withPeriod, type BarDatum, type Kpi } from "@/components/charts";
import { ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import { loadInventory } from "../../analytics/inventory-pages";
import { itemHref, moneyIn, plural, sellHref, toneOfAmount } from "../../analytics/parts";
import styles from "./insights.module.css";

export const metadata: Metadata = { title: "Selling insights" };

const TOP = 5;

/**
 * Sell > Insights - "am I selling well?" (decision 0021): realized profit and time to sell per
 * product and marketplace, fees, returns / write-offs, slow sellers and money tied up in stock.
 * Numbers and charts only; each bar opens the item, the Sold section or a small pop-up.
 */
export default function SellInsightsPage({ searchParams }: PageProps<"/sell/insights">) {
  return (
    <Protected>
      <Page title="Selling insights" description="What sells, where, how fast, and what it really made.">
        <InsightsLoader searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

async function InsightsLoader({ searchParams }: { searchParams: PageProps<"/sell/insights">["searchParams"] }) {
  const period = readPeriod(await searchParams);
  const session = await verifySession();
  const ctx = huntFormContext(session.user.locale);
  const api = await getServerApiClient();
  const data = await Promise.all([
    api.getAnalyticsOverview({ period }),
    api.getProductAnalytics({ period }),
    // Per-item charts: the analytics endpoints don't break selling down by marketplace sold on or by item.
    loadInventory(api, { section: "sold" }),
    loadInventory(api, { section: "holding" }),
    loadInventory(api, { section: "listed" }),
    loadInventory(api, { section: "other" }),
  ]).catch(() => null);

  const header = (
    <>
      <PeriodTabs path="/sell/insights" period={period} />
      <nav aria-label="Related" className={styles.subnav}>
        <Link href="/sell" className={styles.link}>
          Back to Sell
        </Link>
        <Link href={withPeriod("/analytics", period)} className={styles.link}>
          Buying analytics
        </Link>
      </nav>
    </>
  );
  if (!data) {
    return (
      <div className={styles.stack}>
        {header}
        <SystemBanner
          tone="error"
          title="Couldn't load your selling insights"
          message="Rein Drop couldn't reach its server. Your records are safe - try again in a moment."
          action={<ButtonLink href={withPeriod("/sell/insights", period)} variant="secondary">Try again</ButtonLink>}
        />
      </div>
    );
  }

  const [overview, products, soldAll, holdingList, listedList, otherList] = data;
  const currency = overviewView(overview, ctx).currency;
  const money = moneyIn(currency, ctx.localeTag);
  const sum = (list: readonly Money[]) => list.filter((m) => m.currency === currency).reduce((s, m) => s + m.amountMinor, 0);
  const p = overview.period;

  const sold = soldInPeriod(soldAll.items, p);
  const closed = closedInPeriod(otherList.items, p);
  const held = [...holdingList.items, ...listedList.items];
  const main = overview.realized.find((r) => r.currency === currency) ?? null;
  const closedTotals = overview.closed.find((c) => c.currency === currency) ?? null;
  const salesProfit = main?.realizedProfit.amountMinor ?? 0;
  const closedResult = closedTotals?.realizedResult.amountMinor ?? 0;
  const sellingCosts = sum(overview.sellingCosts);
  const stock = tiedUp(holdingList.items, currency);
  const listed = tiedUp(listedList.items, currency);
  const partial = !soldAll.complete || !holdingList.complete || !listedList.complete || !otherList.complete;

  if (overview.sells + overview.holding.count + closed.length === 0 && products.items.length === 0) {
    return (
      <div className={styles.stack}>
        {header}
        <Card>
          <EmptyState
            title="Nothing to sell or sold yet"
            description="Insights come from what you hold and sell. Mark a deal Bought or add an item, then record the sale."
            action={<ButtonLink href="/sell">Go to Sell</ButtonLink>}
          />
        </Card>
      </div>
    );
  }

  const tiles: Kpi[] = [
    {
      key: "profit",
      label: "Realized profit",
      value: main ? money(salesProfit) : "-",
      basis: "Realized",
      tone: toneOfAmount(salesProfit),
      caption: main ? `From ${plural(main.comparableSales, "sale")}${main.marginPercent !== null ? `, ${main.marginPercent}% margin` : ""}` : "After your first sale",
      href: sellHref("sold"),
    },
    {
      key: "days",
      label: "Time to sell",
      value: overview.avgDaysToSell === null ? "-" : plural(Math.round(overview.avgDaysToSell), "day"),
      basis: "Realized",
      caption: "Average, purchase to sale",
      href: sellHref("sold"),
    },
    {
      key: "costs",
      label: "Selling costs",
      value: money(sellingCosts),
      basis: "Realized",
      caption: "Fees and shipping to buyers",
      href: sellHref("sold"),
    },
    {
      key: "closed",
      label: "Returns and write-offs",
      value: money(closedResult),
      basis: "Realized",
      tone: toneOfAmount(closedResult),
      caption: `${closedTotals?.returned ?? 0} returned · ${closedTotals?.writtenOff ?? 0} written off`,
      href: sellHref("other"),
    },
    {
      key: "tied",
      label: "Money tied up",
      value: money(sum(overview.holding.costBasis)),
      basis: "Now",
      caption: `${plural(overview.holding.count, "item")} held - not a loss`,
      detail: {
        title: "Money tied up in stock",
        note: "What you paid (plus purchase costs) for items you still hold. Not a loss.",
        facts: [
          { label: `In stock, not listed (${stock.count})`, value: money(stock.amount) },
          { label: `Listed (${listed.count})`, value: money(listed.amount) },
          ...(overview.holding.oldestDays !== null ? [{ label: "Held longest", value: plural(overview.holding.oldestDays, "day") }] : []),
        ],
        links: [
          { label: "Holding", href: sellHref("holding") },
          { label: "Listings", href: sellHref("listed") },
        ],
      },
    },
  ];

  const overTime = profitOverTime(sold, p, currency, ctx.localeTag);
  const productRows = products.items
    .map((prod) => {
      const r = prod.realized.find((x) => x.currency === currency && x.comparableSales > 0) ?? null;
      const closedAmt = prod.closedResult.filter((m) => m.currency === currency).reduce((s, m) => s + m.amountMinor, 0);
      return { prod, r, closedAmt };
    })
    .filter((x) => x.r || x.closedAmt !== 0);
  const timedProducts = products.items.filter((prod) => prod.avgDaysToSell !== null).sort((a, b) => (b.avgDaysToSell ?? 0) - (a.avgDaysToSell ?? 0));
  const byMarketplace = sellingByMarketplace(sold, currency);
  const marketName = (k: string) => (k === "other" ? "Not recorded" : MARKETPLACE_LABEL[k as keyof typeof MARKETPLACE_LABEL]);
  const slow = slowSellers(held, TOP);
  const worstClosed = closed
    .map((i) => ({ i, r: itemRealized(i, currency) }))
    .sort((a, b) => (a.r ?? 0) - (b.r ?? 0))
    .slice(0, TOP);

  return (
    <div className={styles.stack}>
      {header}
      <p className={styles.muted}>
        {periodLabel(period, ctx.t)}. Realized = from sales, returns and write-offs you recorded ({currency}, other currencies are not converted). Stock figures are right now.
      </p>

      <section aria-labelledby="insight-numbers" className={styles.section}>
        <h2 id="insight-numbers" className="visually-hidden">
          Key numbers
        </h2>
        <KpiTiles id="insights-kpi" tiles={tiles} />
      </section>

      <Card title="Realized profit over time">
        {sold.length === 0 ? (
          <p className={styles.muted}>No sales in this period.</p>
        ) : (
          <ColumnChart
            id="profit-time"
            label={`Realized profit from sales over time, ${currency}`}
            series={[{ key: "profit", label: "Realized profit", tone: "profit", toneOf: (n) => (n < 0 ? "loss" : "profit") }]}
            formatTick={(n) => compactMoney(n, currency, ctx.localeTag)}
            buckets={overTime.map((b) => ({
              key: b.key,
              label: b.label,
              rangeLabel: b.rangeLabel,
              values: [{ amount: b.profit, value: b.sales > 0 ? money(b.profit) : "-" }],
              ...(b.sales > 0
                ? {
                    detail: {
                      title: b.rangeLabel,
                      facts: [
                        { label: "Sales", value: String(b.sales) },
                        { label: "Realized profit", value: money(b.profit) },
                      ],
                      links: [{ label: "Sold items", href: sellHref("sold") }],
                    },
                  }
                : {}),
            }))}
          />
        )}
      </Card>

      <section aria-labelledby="by-product" className={styles.section}>
        <h2 id="by-product" className={styles.heading}>
          Products
        </h2>
        <div className={styles.grid}>
          <Card title="Realized profit by product">
            {productRows.length === 0 ? (
              <p className={styles.muted}>No product sold in this period.</p>
            ) : (
              <BarList
                id="product-profit"
                label={`Realized profit by product, ${currency}`}
                bars={productRows.slice(0, 10).map(({ prod, r, closedAmt }): BarDatum => {
                  const profit = r?.realizedProfit.amountMinor ?? 0;
                  return {
                    key: prod.key,
                    label: prod.name,
                    sublabel: `${prod.sold} sold${prod.holding > 0 ? ` · ${prod.holding} held` : ""}`,
                    amount: profit,
                    value: r ? money(profit) : "-",
                    tone: profit < 0 ? "loss" : "profit",
                    detail: {
                      title: prod.name,
                      facts: [
                        { label: "Sold", value: `${prod.sold} of ${prod.bought} bought` },
                        { label: "Realized profit", value: r ? money(profit) : "-" },
                        ...(r?.marginPercent !== null && r?.marginPercent !== undefined ? [{ label: "Margin", value: `${r.marginPercent}%` }] : []),
                        ...(prod.avgDaysToSell !== null ? [{ label: "Time to sell", value: plural(Math.round(prod.avgDaysToSell), "day") }] : []),
                        ...(prod.returned + prod.writtenOff > 0
                          ? [{ label: `Returned / written off (${prod.returned + prod.writtenOff})`, value: money(closedAmt) }]
                          : []),
                      ],
                      // Sell has no product filter yet: the Sold section.
                      links: [{ label: "Sold items", href: sellHref("sold") }],
                    },
                  };
                })}
              />
            )}
          </Card>
          <Card title="Time to sell by product">
            {timedProducts.length === 0 ? (
              <p className={styles.muted}>No sales in this period.</p>
            ) : (
              <BarList
                id="product-days"
                label="Average days to sell by product, slowest first"
                bars={timedProducts.slice(0, 10).map((prod) => ({
                  key: prod.key,
                  label: prod.name,
                  sublabel: plural(prod.sold, "sale"),
                  amount: prod.avgDaysToSell ?? 0,
                  value: plural(Math.round(prod.avgDaysToSell ?? 0), "day"),
                  tone: "series1",
                  href: sellHref("sold"),
                }))}
              />
            )}
          </Card>
        </div>
      </section>

      <section aria-labelledby="by-marketplace" className={styles.section}>
        <h2 id="by-marketplace" className={styles.heading}>
          Marketplaces you sold on
        </h2>
        {byMarketplace.length === 0 ? (
          <p className={styles.muted}>No sales in this period.</p>
        ) : (
          <div className={styles.grid}>
            <Card title="Realized profit">
              <BarList
                id="market-profit"
                label={`Realized profit by marketplace sold on, ${currency}`}
                bars={byMarketplace.map((m) => ({
                  key: m.marketplace,
                  label: marketName(m.marketplace),
                  sublabel: plural(m.sales, "sale"),
                  amount: m.profit,
                  value: m.comparableSales > 0 ? money(m.profit) : "-",
                  tone: m.profit < 0 ? "loss" : "profit",
                  detail: {
                    title: marketName(m.marketplace),
                    facts: [
                      { label: "Sales", value: String(m.sales) },
                      { label: "Revenue", value: money(m.revenue) },
                      { label: "Fees", value: money(m.fees) },
                      { label: "All selling costs", value: money(m.sellingCosts) },
                      { label: "Realized profit", value: money(m.profit) },
                    ],
                    links: [{ label: "Sold items", href: sellHref("sold") }],
                  },
                }))}
              />
            </Card>
            <Card title="Time to sell">
              <BarList
                id="market-days"
                label="Average days to sell by marketplace"
                bars={byMarketplace.map((m) => ({
                  key: m.marketplace,
                  label: marketName(m.marketplace),
                  sublabel: plural(m.sales, "sale"),
                  amount: m.avgDaysToSell ?? 0,
                  value: m.avgDaysToSell === null ? "-" : plural(m.avgDaysToSell, "day"),
                  tone: "series1",
                  href: sellHref("sold"),
                }))}
              />
            </Card>
            <Card title="Fees">
              <BarList
                id="market-fees"
                label={`Marketplace and payment fees by marketplace, ${currency}`}
                bars={byMarketplace.map((m) => ({
                  key: m.marketplace,
                  label: marketName(m.marketplace),
                  sublabel: m.revenue > 0 ? `${Math.round((100 * m.fees) / m.revenue)}% of revenue` : plural(m.sales, "sale"),
                  amount: m.fees,
                  value: money(m.fees),
                  tone: "series1",
                  href: sellHref("sold"),
                }))}
              />
            </Card>
          </div>
        )}
      </section>

      <section aria-labelledby="stock" className={styles.section}>
        <h2 id="stock" className={styles.heading}>
          Stock and closed items
        </h2>
        <div className={styles.grid}>
          <Card title="Slow sellers" action={<Link href={sellHref("holding")} className={styles.link}>Holding</Link>}>
            {slow.length === 0 ? (
              <p className={styles.muted}>Nothing held right now.</p>
            ) : (
              <BarList
                id="slow"
                label="Items held longest, in days"
                bars={slow.map((i) => ({
                  key: i.id,
                  label: i.title,
                  sublabel: heldSublabel(i, currency, money),
                  amount: i.daysHeld,
                  value: plural(i.daysHeld, "day"),
                  tone: "series1",
                  href: itemHref(i.id),
                }))}
              />
            )}
          </Card>
          <Card title="Money tied up">
            <BarList
              id="tied-up"
              label={`Money tied up in stock, ${currency}`}
              bars={[
                { key: "holding", label: "In stock, not listed", sublabel: plural(stock.count, "item"), amount: stock.amount, value: money(stock.amount), tone: "series1", href: sellHref("holding") },
                { key: "listed", label: "Listed", sublabel: plural(listed.count, "item"), amount: listed.amount, value: money(listed.amount), tone: "series1", href: sellHref("listed") },
              ]}
            />
            {stock.excluded + listed.excluded > 0 && <p className={styles.small}>{plural(stock.excluded + listed.excluded, "item")} in another currency not included.</p>}
          </Card>
          <Card title="Returns and write-offs" action={<Link href={sellHref("other")} className={styles.link}>Other</Link>}>
            {worstClosed.length === 0 ? (
              <p className={styles.muted}>Nothing returned or written off in this period.</p>
            ) : (
              <BarList
                id="closed"
                label={`Realized result of returns and write-offs, ${currency}`}
                bars={worstClosed.map(({ i, r }) => ({
                  key: i.id,
                  label: i.title,
                  sublabel: i.status === "RETURNED" ? "Returned" : "Written off",
                  amount: r ?? 0,
                  value: r === null ? "-" : money(r),
                  tone: (r ?? 0) > 0 ? "profit" : "loss",
                  href: itemHref(i.id),
                }))}
              />
            )}
            {closed.length > TOP && <p className={styles.small}>Biggest {TOP} of {closed.length}.</p>}
          </Card>
        </div>
      </section>

      {partial && <p className={styles.small}>You have a lot of items: only the latest 1,000 per section are in these charts.</p>}
    </div>
  );
}

function heldSublabel(i: InventoryItem, currency: string, money: (n: number) => string): string {
  const basis = itemCostBasis(i, currency);
  const where = i.status === "LISTED" || i.sellListing?.status === "PUBLISHED" ? "Listed" : "In stock";
  return basis === null ? where : `${where} · ${money(basis)} tied up`;
}
