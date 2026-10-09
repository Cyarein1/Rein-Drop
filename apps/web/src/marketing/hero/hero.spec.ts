import { describe, expect, it } from "vitest";
import { marketplaceByKey } from "../marketplaces";
import { storeLink, storeLinks } from "../store-links";
import { heroExample, ILLUSTRATIVE_LABEL, potentialGrossUpsideUsd, signedUsd, usd } from "./hero-example";

describe("hero sample deal (illustrative)", () => {
  it("is labelled illustrative and its upside is resale minus asking (gross)", () => {
    expect(ILLUSTRATIVE_LABEL).toBe("Illustrative example");
    expect(potentialGrossUpsideUsd(heroExample)).toBe(heroExample.estimatedResaleUsd - heroExample.askingUsd);
    expect(potentialGrossUpsideUsd(heroExample)).toBeGreaterThan(0);
  });

  it("uses only launch-target marketplaces and the app's strength wording", () => {
    expect(marketplaceByKey(heroExample.marketplace).status).toBe("launch_target");
    expect(heroExample.strength).toBe("Strong deal");
  });

  it("formats whole US dollars", () => {
    expect(usd(380)).toBe("$380");
    expect(usd(1234.4)).toBe("$1,234");
    expect(signedUsd(140)).toBe("+$140");
    expect(signedUsd(-25)).toBe("-$25");
  });
});

describe("store links", () => {
  it("are 'coming soon' until a real store URL is configured", () => {
    expect(storeLinks({})).toEqual([
      { store: "appStore", status: "coming_soon" },
      { store: "googlePlay", status: "coming_soon" },
    ]);
  });

  it("accept only https links on the stores' own hosts", () => {
    expect(storeLink("appStore", "https://apps.apple.com/us/app/rein-drop/id123")).toEqual({ store: "appStore", status: "available", href: "https://apps.apple.com/us/app/rein-drop/id123" });
    expect(storeLink("googlePlay", "https://play.google.com/store/apps/details?id=com.reindrop.app").status).toBe("available");
    for (const bad of ["http://apps.apple.com/x", "https://evil.example/apps.apple.com", "https://play.google.com.evil.example/x", "not a url", "  "]) {
      expect(storeLink("appStore", bad).status).toBe("coming_soon");
      expect(storeLink("googlePlay", bad).status).toBe("coming_soon");
    }
  });
});
