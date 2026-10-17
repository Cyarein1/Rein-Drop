import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { huntFormContext, removeManuallyView, saleResultView } from "@rein-drop/client-core";
import { verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { mascotAssets } from "@/brand/assets";
import { ButtonLink, Card, EmptyState, Metric, Page, SystemBanner } from "@/components/ui";
import { loadInventoryItem } from "../../load-item";
import { itemHref, itemSoldHref, sellHref } from "@/sell/routes";
import styles from "../../items.module.css";

export const metadata: Metadata = { title: "Sale result" };

/** Sale result (screen 23): realized P/L first, then expected vs actual, one insight, Done. */
export default function SaleResultPage({ params }: PageProps<"/sell/items/[id]/result">) {
  return (
    <Protected>
      <Page>
        <ResultLoader params={params} />
      </Page>
    </Protected>
  );
}

async function ResultLoader({ params }: { params: PageProps<"/sell/items/[id]/result">["params"] }) {
  const { id } = await params;
  const session = await verifySession();
  const item = await loadInventoryItem(id);
  const context = huntFormContext(session.user.locale);
  const view = saleResultView(item, context);
  // The sale ended its listings; assisted ones (Facebook) must be taken down by the seller.
  const removal = removeManuallyView(item.sellListing?.removeManually ?? [], context.t);

  if (!view) {
    return (
      <Card>
        <EmptyState
          title="Not sold yet"
          description="The result appears once you mark this item sold. Until then it's neither a profit nor a loss."
          action={<ButtonLink href={itemSoldHref(item.id)}>Mark sold</ButtonLink>}
        />
      </Card>
    );
  }

  // Success / profit art only for money actually made (Mascot Usage Guide) - and only approved art.
  const art = view.celebrate ? mascotAssets.profit : null;

  return (
    <div className={styles.stack}>
      <Link href={itemHref(item.id)} className={styles.back}>
        ← {view.title}
      </Link>
      <h1 className={styles.title}>Sale result</h1>
      <p className={styles.meta}>{view.title}</p>
      {removal && (
        <SystemBanner
          tone="warning"
          title={removal.title}
          message={removal.body}
          action={<ButtonLink href={itemHref(item.id)} variant="secondary">Confirm it on the item page</ButtonLink>}
        />
      )}

      <div className={view.celebrate ? styles.celebrate : styles.preview}>
        {art && <Image src={art} alt="" width={96} height={Math.round((art.height / art.width) * 96)} />}
        <Metric label={view.headline} value={view.value} tone={view.tone} caption={view.summary ?? undefined} />
      </div>
      <p className={styles.insight}>{view.insight}</p>

      <Card title="Expected vs actual">
        {view.comparisons.length > 0 && (
          <table className={styles.compare}>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Measure</span>
                </th>
                <th scope="col">Expected</th>
                <th scope="col">Actual</th>
                <th scope="col">Difference</th>
              </tr>
            </thead>
            <tbody>
              {view.comparisons.map((c) => (
                <tr key={c.label}>
                  <th scope="row">
                    {c.label}
                    <br />
                    <span className={styles.small}>{c.expectedLabel}</span>
                  </th>
                  <td>{c.expected}</td>
                  <td>{c.actual}</td>
                  <td className={c.tone === "neutral" ? undefined : styles[c.tone]}>{c.difference ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className={styles.small}>{view.comparisonNote}</p>
      </Card>

      <Card title="How it adds up">
        <dl className={styles.rows}>
          {view.breakdown.map(([label, value], i) => (
            <div key={`${label}-${i}`} className={styles.row}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div className={[styles.row, styles.total].join(" ")}>
            <dt>{view.headline}</dt>
            <dd className={view.tone === "neutral" ? undefined : styles[view.tone]}>{view.value}</dd>
          </div>
        </dl>
      </Card>

      <div className={styles.actions}>
        <ButtonLink href={sellHref("sold")}>Done</ButtonLink>
        <ButtonLink href={itemSoldHref(item.id)} variant="text">
          Correct the sale
        </ButtonLink>
      </div>
    </div>
  );
}
