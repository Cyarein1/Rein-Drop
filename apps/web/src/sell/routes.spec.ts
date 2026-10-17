import { describe, expect, it } from "vitest";
import { itemHref, itemResultHref, itemSoldHref, LEGACY_REDIRECTS, listingHref, parseSellLocation, sectionForItem, sellHref } from "./routes";

/** Applies the first matching redirect the way Next.js does for these simple `:param` patterns. */
function redirect(path: string): string | null {
  for (const r of LEGACY_REDIRECTS) {
    const names: string[] = [];
    const pattern = new RegExp(`^${r.source.replace(/:(\w+)/g, (_, n: string) => (names.push(n), "([^/]+)"))}$`);
    const m = pattern.exec(path);
    if (!m) continue;
    return names.reduce((dest, n, i) => dest.replace(`:${n}`, m[i + 1]!), r.destination as string);
  }
  return null;
}

describe("Sell locations", () => {
  it("defaults to Holding and the Drafts tab", () => {
    expect(parseSellLocation({})).toEqual({ section: "holding", view: "drafts" });
  });

  it("reads section and view; ignores unknown values", () => {
    expect(parseSellLocation({ section: "listed", view: "discarded" })).toEqual({ section: "listed", view: "discarded" });
    expect(parseSellLocation({ section: "sold" }).section).toBe("sold");
    expect(parseSellLocation({ section: "nope", view: "closed" })).toEqual({ section: "holding", view: "drafts" });
    expect(parseSellLocation({ section: ["sold", "other"] }).section).toBe("holding");
  });

  it("maps the old Inventory ?status= filter", () => {
    expect(parseSellLocation({ status: "sold" }).section).toBe("sold");
    expect(parseSellLocation({ status: "closed" }).section).toBe("other");
    expect(parseSellLocation({ status: "all" }).section).toBe("holding");
    expect(parseSellLocation({ status: "sold", section: "other" }).section).toBe("other");
  });

  it("builds section links that parse back to the same place", () => {
    for (const section of ["holding", "listed", "sold", "other"] as const) {
      const url = new URL(sellHref(section), "https://x.test");
      expect(parseSellLocation(Object.fromEntries(url.searchParams)).section).toBe(section);
    }
    expect(sellHref("listed", "active")).toBe("/sell?section=listed&view=active");
    expect(sellHref("listed", "drafts")).toBe("/sell?section=listed");
  });

  it("item and listing links", () => {
    expect(itemHref("abc")).toBe("/sell/items/abc");
    expect(itemSoldHref("abc")).toBe("/sell/items/abc/sold");
    expect(itemResultHref("abc")).toBe("/sell/items/abc/result");
    expect(listingHref("l1")).toBe("/sell/l1");
  });
});

describe("sectionForItem (back link from the item page)", () => {
  const item = (status: Parameters<typeof sectionForItem>[0]["status"], listing: "DRAFT" | "PUBLISHED" | "ENDED" | "DISCARDED" | null = null) =>
    sectionForItem({ status, sellListing: listing ? ({ status: listing } as never) : null });

  it("follows the contract's section rules", () => {
    expect(item("IN_STOCK")).toBe("holding");
    expect(item("IN_STOCK", "DISCARDED")).toBe("holding");
    expect(item("IN_STOCK", "ENDED")).toBe("holding");
    expect(item("IN_STOCK", "DRAFT")).toBe("listed");
    expect(item("IN_STOCK", "PUBLISHED")).toBe("listed");
    expect(item("LISTED")).toBe("listed");
    expect(item("SOLD", "ENDED")).toBe("sold");
    expect(item("RETURNED")).toBe("other");
    expect(item("WRITTEN_OFF")).toBe("other");
    expect(item("CANCELLED")).toBe("other");
  });
});

describe("old Inventory URLs keep working", () => {
  it("redirect to the Sell area", () => {
    expect(redirect("/inventory")).toBe("/sell");
    expect(redirect("/inventory/0199-abc")).toBe("/sell/items/0199-abc");
    expect(redirect("/inventory/0199-abc/sell")).toBe("/sell/items/0199-abc/sold");
    expect(redirect("/inventory/0199-abc/result")).toBe("/sell/items/0199-abc/result");
    expect(redirect("/sell/items")).toBe("/sell");
  });

  it("never redirect the new pages", () => {
    for (const path of ["/sell", "/sell/items/new", "/sell/items/x", "/sell/insights", "/sell/l1"]) expect(redirect(path)).toBeNull();
  });
});
