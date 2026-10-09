import { describe, expect, it } from "vitest";
import { NAV_LINKS, PRIMARY_CTA, LANDING_SECTIONS } from "../sections";
import { isScrolled, menuKeyAction } from "./menu-focus";

describe("mobile menu keyboard", () => {
  const COUNT = 6; // menu button + 4 links + sign in

  it("Escape closes from anywhere", () => {
    expect(menuKeyAction("Escape", false, 3, COUNT)).toEqual({ type: "close" });
    expect(menuKeyAction("Escape", false, -1, COUNT)).toEqual({ type: "close" });
  });

  it("Tab wraps from the last item to the menu button, Shift+Tab the other way", () => {
    expect(menuKeyAction("Tab", false, COUNT - 1, COUNT)).toEqual({ type: "focus", index: 0 });
    expect(menuKeyAction("Tab", true, 0, COUNT)).toEqual({ type: "focus", index: COUNT - 1 });
  });

  it("leaves ordinary Tab moves inside the menu to the browser", () => {
    expect(menuKeyAction("Tab", false, 2, COUNT)).toBeNull();
    expect(menuKeyAction("Tab", true, 3, COUNT)).toBeNull();
    expect(menuKeyAction("Enter", false, 2, COUNT)).toBeNull();
  });

  it("pulls stray focus back into the open menu", () => {
    expect(menuKeyAction("Tab", false, -1, COUNT)).toEqual({ type: "focus", index: 0 });
    expect(menuKeyAction("Tab", true, -1, COUNT)).toEqual({ type: "focus", index: COUNT - 1 });
  });
});

describe("navigation content", () => {
  it("has the build plan's items, each pointing at a real section", () => {
    expect(NAV_LINKS.map((l) => l.label)).toEqual(["How it works", "Features", "Marketplaces", "FAQ"]);
    const ids = new Set(LANDING_SECTIONS.map((s) => s.id));
    for (const link of [...NAV_LINKS, PRIMARY_CTA]) expect(ids.has(link.section)).toBe(true);
  });

  it("sends the primary call to action to the waitlist", () => {
    expect(PRIMARY_CTA).toEqual({ label: "Join early access", section: "waitlist" });
  });

  it("only turns the bar solid after a real scroll", () => {
    expect(isScrolled(0)).toBe(false);
    expect(isScrolled(8)).toBe(false);
    expect(isScrolled(9)).toBe(true);
  });
});
