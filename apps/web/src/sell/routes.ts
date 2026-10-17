import type { InventoryItem, InventorySection } from "@rein-drop/contracts";

/**
 * URLs of the one Sell area (decision 0021, step 91). Inventory was merged into Sell:
 *   /sell?section=holding|listed|sold|other   sections (holding is the default)
 *   /sell?section=listed&view=drafts|active|discarded   listing tabs (Discarded is a filter)
 *   /sell/insights                             Insights (its own page)
 *   /sell/items/new                            Add item
 *   /sell/items/:id                            the one item page (timeline + actions)
 *   /sell/items/:id/sold | /result             Mark sold / correct the sale, sale result
 *   /sell/:listingId                           the listing editor
 * Old /inventory URLs redirect here (LEGACY_REDIRECTS, used by next.config.ts).
 *
 * No runtime imports: next.config.ts loads this file.
 */

export const SELL_SECTIONS = ["holding", "listed", "sold", "other"] as const satisfies readonly InventorySection[];
/** Listing tabs shown in the Listings section; "discarded" is reached through a filter link. */
export const LISTING_VIEWS = ["drafts", "active", "discarded"] as const;
export type ListingView = (typeof LISTING_VIEWS)[number];

export interface SellLocation {
  section: InventorySection;
  /** Listings section only. */
  view: ListingView;
}

/** The old Inventory filter (?status=) -> a Sell section, for links made before the merge. */
const LEGACY_STATUS: Record<string, InventorySection> = { holding: "holding", sold: "sold", closed: "other", all: "holding" };

type Params = Record<string, string | string[] | undefined>;
const one = (params: Params, key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

/** Reads ?section= (or the old ?status=) and ?view=; anything unknown falls back to the defaults. */
export function parseSellLocation(params: Params): SellLocation {
  const raw = one(params, "section");
  const legacy = one(params, "status");
  const section: InventorySection = (SELL_SECTIONS as readonly string[]).includes(raw ?? "")
    ? (raw as InventorySection)
    : legacy && LEGACY_STATUS[legacy]
      ? LEGACY_STATUS[legacy]
      : "holding";
  const rawView = one(params, "view");
  const view: ListingView = (LISTING_VIEWS as readonly string[]).includes(rawView ?? "") ? (rawView as ListingView) : "drafts";
  return { section, view };
}

export function sellHref(section: InventorySection = "holding", view?: ListingView): string {
  if (section === "holding") return "/sell";
  if (section === "listed" && view && view !== "drafts") return `/sell?section=listed&view=${view}`;
  return `/sell?section=${section}`;
}

export const SELL_INSIGHTS_HREF = "/sell/insights";
export const ADD_ITEM_HREF = "/sell/items/new";
export const itemHref = (id: string) => `/sell/items/${encodeURIComponent(id)}`;
export const itemSoldHref = (id: string) => `${itemHref(id)}/sold`;
export const itemResultHref = (id: string) => `${itemHref(id)}/result`;
export const listingHref = (id: string) => `/sell/${encodeURIComponent(id)}`;

/**
 * The section an item is shown in (the contract's definition, for the item page's back link):
 * sold; other = returned / written off / cancelled; listed = a draft or live listing, or listed by
 * hand; holding = the rest.
 */
export function sectionForItem(item: Pick<InventoryItem, "status" | "sellListing">): InventorySection {
  if (item.status === "SOLD") return "sold";
  if (item.status === "RETURNED" || item.status === "WRITTEN_OFF" || item.status === "CANCELLED") return "other";
  if (item.status === "LISTED") return "listed";
  const listing = item.sellListing?.status;
  return listing === "DRAFT" || listing === "PUBLISHED" ? "listed" : "holding";
}

/** Old Inventory URLs -> the Sell area (query strings, e.g. ?status=sold, are passed through). */
export const LEGACY_REDIRECTS = [
  { source: "/inventory", destination: "/sell", permanent: false },
  { source: "/inventory/:id", destination: "/sell/items/:id", permanent: false },
  { source: "/inventory/:id/sell", destination: "/sell/items/:id/sold", permanent: false },
  { source: "/inventory/:id/result", destination: "/sell/items/:id/result", permanent: false },
  { source: "/sell/items", destination: "/sell", permanent: false },
] as const;
