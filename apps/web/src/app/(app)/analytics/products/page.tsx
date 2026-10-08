import type { Metadata } from "next";
import { huntFormContext, lossReview, periodLabel, productRowsView, type ProductRowView } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import styles from "../analytics.module.css";
import { AnalyticsNav, Bars, PeriodTabs, readPeriod, withPeriod } from "../parts";

export const metadata: Metadata = { title: "Product analytics" };

/** Product analytics (screen 26): best realized results, margin, velocity, and the loss review. */
export default function ProductAnalyticsPage({ searchParams }: PageProps<"/analytics/products">) {
  return (
    <Protected>
      <Page title="Product analytics" description="Which products actually make money, and how fast they sell.">
        <ProductsLoader searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

async function ProductsLoader({ searchParams }: { searchParams: PageProps<"/analytics/products">["searchParams"] }) {
  const period = readPeriod(await searchParams);
  const session = await verifySession();
  const ctx = huntFormContext(session.user.locale);
  const api = await getServerApiClient();
  const products = await api.getProductAnalytics({ period }).catch(() => null);

  const header = (
    <>
      <PeriodTabs path="/analytics/products" period={period} />
      <AnalyticsNav period={period} current="products" />
      <p className={styles.muted}>{periodLabel(period)}. Profit and margin are realized from recorded sales, after costs.</p>
    </>
  );
  if (!products) {
    return (
      <div className={styles.stack}>
        {header}
        <SystemBanner tone="error" title="Couldn't load product analytics" message="Try again in a moment." action={<ButtonLink href={withPeriod("/analytics/products", period)} variant="secondary">Try again</ButtonLink>} />
      </div>
    );
  }
  const rows = productRowsView(products.items, ctx);
  const losses = lossReview(products.items, ctx);
  const sold = rows.filter((r) => r.bar);

  return (
    <div className={styles.stack}>
      {header}
      {rows.length === 0 ? (
        <Card>
          <EmptyState title="No products yet" description="Products appear once you buy something - mark a deal Bought or add it from Inventory." action={<ButtonLink href="/deals">Go to deals</ButtonLink>} />
        </Card>
      ) : (
        <>
          {sold.length > 0 && (
            <Card title="Realized profit by product">
              <Bars bars={sold.map((r) => r.bar!)} label="Realized profit by product" />
            </Card>
          )}
          <section aria-labelledby="all-products" className={styles.section}>
            <h2 id="all-products" className={styles.heading}>
              All products
            </h2>
            <ProductList rows={rows} />
          </section>
          <section aria-labelledby="loss-review" className={styles.section}>
            <h2 id="loss-review" className={styles.heading}>
              Loss review
            </h2>
            {losses.length === 0 ? (
              <p className={styles.muted}>No product lost money in this period.</p>
            ) : (
              <>
                <p className={styles.small}>Sold for less than they cost after fees and costs - worst first.</p>
                <ProductList rows={losses} />
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ProductList({ rows }: { rows: ProductRowView[] }) {
  return (
    <ul className={styles.list}>
      {rows.map((r) => (
        <li key={r.key} className={styles.item}>
          <div className={styles.itemHead}>
            <span className={styles.itemTitle}>{r.name}</span>
            {r.realized ? (
              <span className={[styles.strong, styles[r.realized.tone]].join(" ")}>{r.realized.value}</span>
            ) : (
              <span className={styles.small}>Not sold yet</span>
            )}
          </div>
          <p className={styles.small}>{[r.counts, r.realized?.margin, r.avgDays].filter(Boolean).join(" · ")}</p>
        </li>
      ))}
    </ul>
  );
}
