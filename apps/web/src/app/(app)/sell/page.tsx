import type { Metadata } from "next";
import Link from "next/link";
import { channelView, huntFormContext, SELL_LISTING_STATUS_LABEL, sellPriceText } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Badge, ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import styles from "./sell.module.css";

export const metadata: Metadata = { title: "Sell" };

/** Sell (decision 0019): every listing you've started, newest first. "List for sale" lives on each inventory item. */
export default function SellPage() {
  return (
    <Protected>
      <Page title="Sell" description="List what you bought - write it yourself or let AI draft it - and cross-list it on your marketplaces." width="narrow">
        <Listings />
      </Page>
    </Protected>
  );
}

async function Listings() {
  const [session, api] = await Promise.all([verifySession(), getServerApiClient()]);
  const listings = await api.listSellListings().catch(() => null);
  if (!listings) return <SystemBanner tone="error" title="Couldn't load your listings" message="Refresh the page to try again." />;
  const localeTag = huntFormContext(session.user.locale).localeTag;
  if (listings.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nothing listed yet"
          description="Open something you bought in Inventory and choose List for sale."
          action={<ButtonLink href="/inventory">Go to inventory</ButtonLink>}
        />
      </Card>
    );
  }
  return (
    <ul className={styles.list}>
      {listings.map((l) => {
        const status = SELL_LISTING_STATUS_LABEL[l.status];
        const cover = l.photos[0];
        const live = l.channels.map((c) => channelView(c, localeTag)).filter((c) => c.label !== "Ended");
        return (
          <li key={l.id}>
            <Link href={`/sell/${l.id}`} className={styles.row}>
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed / external photo URLs
                <img src={cover.url} alt="" className={styles.rowThumb} />
              ) : (
                <span className={styles.rowThumb} aria-hidden />
              )}
              <span className={styles.stack} style={{ gap: 4 }}>
                <span className={styles.rowTitle}>{l.title || "Untitled listing"}</span>
                <span className={styles.badges}>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {sellPriceText(l, localeTag) && <span className={styles.small}>{sellPriceText(l, localeTag)}</span>}
                  {live.map((c) => (
                    <span key={c.marketplace} className={styles.small}>
                      {c.name}: {c.label}
                    </span>
                  ))}
                  {l.missing.length > 0 && l.status === "DRAFT" && <span className={styles.small}>{l.missing.length} to do before publishing</span>}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
