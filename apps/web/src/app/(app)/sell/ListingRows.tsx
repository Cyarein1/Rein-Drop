import Link from "next/link";
import type { SellListing } from "@rein-drop/api-client";
import { channelView, inventoryStatusLabel, MARKETPLACE_NAME, sellListingStatusLabel, sellPriceText, type HuntFormContext } from "@rein-drop/client-core";
import { Badge } from "@/components/ui";
import { listingHref } from "@/sell/routes";
import styles from "./sell.module.css";

/** Listing rows (Listings section): cover, title, status, price, where it's live, what's still missing. */
export function ListingRows({ listings, context, label }: { listings: SellListing[]; context: HuntFormContext; label: string }) {
  const { t, localeTag } = context;
  return (
    <ul className={styles.list} aria-label={label}>
      {listings.map((l) => {
        const status = sellListingStatusLabel(l.status, t);
        const cover = l.photos[0];
        const price = sellPriceText(l, localeTag);
        const live = l.channels.map((c) => channelView(c, localeTag, t)).filter((c) => c.canEnd);
        return (
          <li key={l.id}>
            <Link href={listingHref(l.id)} className={styles.row}>
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
                  {l.itemStatus !== "IN_STOCK" && l.itemStatus !== "LISTED" && <Badge tone={inventoryStatusLabel(l.itemStatus, t).tone}>{inventoryStatusLabel(l.itemStatus, t).label}</Badge>}
                  {price && <span className={styles.small}>{price}</span>}
                  {live.map((c) => (
                    <span key={c.marketplace} className={styles.small}>
                      {c.name}: {c.label}
                    </span>
                  ))}
                  {l.missing.length > 0 && l.status === "DRAFT" && <span className={styles.small}>{l.missing.length} to do before publishing</span>}
                  {l.removeManually.length > 0 && (
                    <span className={styles.small}>Remove it on {l.removeManually.map((m) => MARKETPLACE_NAME[m]).join(", ")} yourself</span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
