import type { Metadata } from "next";
import Link from "next/link";
import type { InventoryCounts, InventoryItem, InventorySection } from "@rein-drop/api-client";
import { huntFormContext, inventoryEmptyText, inventoryRowView, inventorySections, plainContext, sellListingViews, type HuntFormContext } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import { ADD_ITEM_HREF, parseSellLocation, SELL_INSIGHTS_HREF, sellHref, type ListingView, type SellLocation } from "@/sell/routes";
import { ItemList } from "./ItemList";
import { ItemRow } from "./ItemRow";
import { ListingRows } from "./ListingRows";
import itemStyles from "./items/items.module.css";
import styles from "./sell.module.css";

export const metadata: Metadata = { title: "Sell" };

const PAGE_SIZE = 20;

/**
 * Sell (decision 0021, step 91): Inventory merged into one area. Sections: Holding · Listings
 * (Drafts / Active, Discarded under a filter) · Sold · Other (returned / written off / cancelled) ·
 * Insights. Every item opens the same item page; "Add item" covers things bought elsewhere.
 */
export default function SellPage({ searchParams }: PageProps<"/sell">) {
  return (
    <Protected>
      <Page
        title="Sell"
        description="Everything you bought, from in stock to listed and sold. Nothing is ever deleted - endings are kept in your history."
        actions={<ButtonLink href={ADD_ITEM_HREF}>Add item</ButtonLink>}
      >
        <SellLoader searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

async function SellLoader({ searchParams }: { searchParams: PageProps<"/sell">["searchParams"] }) {
  const location = parseSellLocation(await searchParams);
  const [session, api] = await Promise.all([verifySession(), getServerApiClient()]);
  const context = huntFormContext(session.user.locale);
  const counts = await api.getInventoryCounts().catch(() => null);
  return (
    <>
      <SectionNav location={location} counts={counts} context={context} />
      {location.section === "listed" ? <ListingsSection view={location.view} counts={counts} context={context} /> : <ItemsSection section={location.section} context={context} />}
    </>
  );
}

function SectionNav({ location, counts, context }: { location: SellLocation; counts: InventoryCounts | null; context: HuntFormContext }) {
  return (
    <nav aria-label="Sell sections" className={itemStyles.tabs}>
      {inventorySections(context.t, counts ?? undefined).map((s) => (
        <Link key={s.value} href={sellHref(s.value)} className={itemStyles.tab} aria-current={location.section === s.value ? "page" : undefined}>
          {s.label}
        </Link>
      ))}
      <Link href={SELL_INSIGHTS_HREF} className={itemStyles.tab}>
        Insights
      </Link>
    </nav>
  );
}

const LIST_LABEL: Record<Exclude<InventorySection, "listed">, string> = {
  holding: "In stock, newest purchase first",
  sold: "Sold, newest purchase first",
  other: "Returned, written off and cancelled, newest purchase first",
};

async function ItemsSection({ section, context }: { section: Exclude<InventorySection, "listed">; context: HuntFormContext }) {
  const api = await getServerApiClient();
  const page = await api.listInventory({ section, limit: PAGE_SIZE }).catch(() => null);

  if (!page) {
    return (
      <SystemBanner
        tone="error"
        title="Couldn't load your items"
        message="Rein Drop couldn't reach its server. Nothing you recorded is lost - try again in a moment."
        action={<ButtonLink href={sellHref(section)} variant="secondary">Try again</ButtonLink>}
      />
    );
  }

  if (page.items.length === 0) {
    if (section === "other") {
      return (
        <Card>
          <EmptyState
            title="Nothing here"
            description="Items you return, write off or mark as bought by mistake move here. They stay in your history - nothing is deleted."
            action={<ButtonLink href={sellHref("holding")} variant="secondary">See what you&apos;re holding</ButtonLink>}
          />
        </Card>
      );
    }
    const empty = inventoryEmptyText(section === "sold" ? "sold" : "holding", context.t);
    return (
      <Card>
        <EmptyState
          title={empty.title}
          description={empty.body}
          // The approved "holding box" mascot explains purchase tracking - only when there's nothing yet.
          mascot={section === "sold" ? undefined : "inventory"}
          action={
            section === "sold" ? (
              <ButtonLink href={sellHref("holding")} variant="secondary">See what you&apos;re holding</ButtonLink>
            ) : (
              <span className={itemStyles.actions}>
                <ButtonLink href="/deals">Go to deals</ButtonLink>
                <ButtonLink href={ADD_ITEM_HREF} variant="secondary">Add something you bought elsewhere</ButtonLink>
              </span>
            )
          }
        />
      </Card>
    );
  }

  return <ItemList key={section} label={LIST_LABEL[section]} initial={page} query={{ section, limit: PAGE_SIZE }} context={plainContext(context)} />;
}

/** Listings: Drafts / Active tabs (Discarded under a filter link), plus items listed by hand elsewhere. */
async function ListingsSection({ view, counts, context }: { view: ListingView; counts: InventoryCounts | null; context: HuntFormContext }) {
  const api = await getServerApiClient();
  const [listings, byHand] = await Promise.all([
    api.listSellListings({ view }).catch(() => null),
    // "I listed it elsewhere" items have no Rein Drop listing - shown under Active.
    view === "active"
      ? api
          .listInventory({ section: "listed", limit: 100 })
          .then((p) => p.items.filter(listedByHand))
          .catch(() => [] as InventoryItem[])
      : Promise.resolve([] as InventoryItem[]),
  ]);
  const tabs = sellListingViews(context.t, counts?.listings).filter((v) => v.value === "drafts" || v.value === "active");
  const discarded = counts?.listings.discarded ?? null;

  return (
    <>
      <nav aria-label="Listing tabs" className={styles.subTabs}>
        {tabs.map((tab) => (
          <Link key={tab.value} href={sellHref("listed", tab.value as ListingView)} className={itemStyles.tab} aria-current={view === tab.value ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
        {view === "discarded" ? (
          <Link href={sellHref("listed", "drafts")} className={styles.filterLink} aria-current="page">
            Showing discarded drafts · back to drafts
          </Link>
        ) : (
          <Link href={sellHref("listed", "discarded")} className={styles.filterLink}>
            {discarded === null ? "Show discarded drafts" : `Show discarded drafts (${discarded})`}
          </Link>
        )}
      </nav>

      {!listings ? (
        <SystemBanner tone="error" title="Couldn't load your listings" message="Refresh the page to try again." />
      ) : listings.length === 0 && byHand.length === 0 ? (
        <Card>
          <EmptyState
            title={view === "discarded" ? "No discarded drafts" : view === "active" ? "Nothing live right now" : "No drafts"}
            description={
              view === "discarded"
                ? "Drafts you discard show here, and you can restore them any time."
                : "Open something you're holding and choose List for sale - write it yourself or let AI draft it."
            }
            action={<ButtonLink href={sellHref("holding")} variant="secondary">See what you&apos;re holding</ButtonLink>}
          />
        </Card>
      ) : (
        <ListingRows listings={listings} context={context} label={view === "discarded" ? "Discarded drafts" : view === "active" ? "Active listings" : "Draft listings"} />
      )}

      {byHand.length > 0 && (
        <section aria-labelledby="listed-by-hand" className={itemStyles.stack}>
          <h2 id="listed-by-hand" className={itemStyles.cardTitle}>
            Listed elsewhere by you
          </h2>
          <ul className={itemStyles.list}>
            {byHand.map((item) => (
              <li key={item.id}>
                <ItemRow view={inventoryRowView(item, context)} headingLevel={3} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const listedByHand = (item: InventoryItem) => item.status === "LISTED" && item.sellListing?.status !== "DRAFT" && item.sellListing?.status !== "PUBLISHED";
