import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { comingSoon, exploring, MARKETPLACE_STATUS_INFO, MARKETPLACE_STATUSES, MARKETPLACES, startingWith, type MarketplaceEntry } from "./marketplaces";

const webRoot = path.resolve(__dirname, "../..");
const names = (list: readonly MarketplaceEntry[]) => list.map((m) => m.name);

describe("marketplace roadmap", () => {
  it("has the build plan's statuses", () => {
    expect(names(startingWith())).toEqual(["eBay", "Facebook Marketplace"]);
    expect(startingWith().every((m) => m.status === "launch_target")).toBe(true);
    expect(names(comingSoon())).toEqual(["OfferUp", "Craigslist", "Mercari", "Poshmark"]);
    expect(MARKETPLACE_STATUS_INFO.coming_soon.label).toBe("Coming soon / Exploring");
    expect(names(exploring())).toEqual(["Depop", "StockX", "GOAT", "Grailed", "Reverb", "Swappa", "Etsy", "Whatnot", "Vinted", "Amazon", "Walmart Marketplace"]);
    expect(MARKETPLACES).toHaveLength(17);
  });

  it("labels nothing Live or Beta - and never without recorded proof", () => {
    for (const m of MARKETPLACES as readonly MarketplaceEntry[]) {
      expect(["live", "beta"]).not.toContain(m.status);
      if (m.status === "live" || m.status === "beta") expect(m.proof.verifiedAt && m.proof.evidence).toBeTruthy();
    }
  });

  it("defines a label and plain-language meaning for every status", () => {
    for (const s of MARKETPLACE_STATUSES) {
      expect(MARKETPLACE_STATUS_INFO[s].label.length).toBeGreaterThan(0);
      expect(MARKETPLACE_STATUS_INFO[s].meaning).toMatch(/\.$/);
    }
    // No dates or guarantees in the meanings.
    for (const s of MARKETPLACE_STATUSES) expect(MARKETPLACE_STATUS_INFO[s].meaning).not.toMatch(/\b20\d\d\b|guarantee|soon as/i);
  });

  it("has unique keys / names and an existing, correctly sized official file for every logo", () => {
    expect(new Set(MARKETPLACES.map((m) => m.key)).size).toBe(MARKETPLACES.length);
    expect(new Set(MARKETPLACES.map((m) => m.name)).size).toBe(MARKETPLACES.length);
    for (const m of MARKETPLACES as readonly MarketplaceEntry[]) {
      if (!m.logo) continue;
      const file = path.join(webRoot, "public", m.logo.src);
      expect(existsSync(file), m.key).toBe(true);
      expect(m.logo.src).toMatch(/^\/assets\/third-party\/marketplaces\//);
      const b = readFileSync(file);
      if (m.logo.src.endsWith(".png")) expect({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) }).toEqual({ w: m.logo.width, h: m.logo.height });
      if (m.logo.src.endsWith(".svg")) expect(b.toString("utf8")).not.toMatch(/<script|on\w+=|javascript:/i);
    }
  });

  it("falls back to the name (no substitute art) where no official file was obtainable", () => {
    expect(MARKETPLACES.filter((m) => m.logo === null).map((m) => m.key)).toEqual(["offerup", "goat", "swappa", "etsy"]);
  });
});
