import { describe, expect, it } from "vitest";
import { capabilitiesFor } from "@rein-drop/api-client";
import { BOTTOM_ITEMS, isActive, NAV, SIDEBAR_ITEMS, TOP_BAR_ITEMS } from "./nav";

describe("isActive", () => {
  it("matches the page itself and its sub-pages", () => {
    expect(isActive("/hunts", NAV.hunts)).toBe(true);
    expect(isActive("/hunts/", NAV.hunts)).toBe(true);
    expect(isActive("/hunts/0199-abc", NAV.hunts)).toBe(true);
  });

  it("gives /hunts/new to Create Hunt, not Hunts", () => {
    expect(isActive("/hunts/new", NAV.hunts)).toBe(false);
    expect(isActive("/hunts/new", NAV.createHunt)).toBe(true);
  });

  it("does not match lookalike prefixes", () => {
    expect(isActive("/huntsman", NAV.hunts)).toBe(false);
    expect(isActive("/homepage", NAV.home)).toBe(false);
  });

  it("marks exactly one destination active per primary route", () => {
    const all = Object.values(NAV);
    for (const path of ["/home", "/hunts", "/hunts/new", "/deals", "/analytics", "/settings", "/sell", "/sell/items/x", "/sell/insights", "/inventory", "/inventory/x/sell"]) {
      expect(all.filter((item) => isActive(path, item))).toHaveLength(1);
    }
  });

  it("the whole Sell area (and the old Inventory URLs) is one destination", () => {
    for (const path of ["/sell", "/sell/items/new", "/sell/items/abc", "/sell/items/abc/result", "/sell/l1", "/sell/insights", "/inventory", "/inventory/abc/result"]) {
      expect(isActive(path, NAV.sell), path).toBe(true);
      expect(isActive(path, NAV.analytics), path).toBe(false);
    }
    expect(isActive("/inventoryx", NAV.sell)).toBe(false);
  });

  it("there is no separate Inventory entry", () => {
    expect(Object.values(NAV).map((i) => i.label)).not.toContain("Inventory");
  });
});

describe("platform capabilities (decision 0018)", () => {
  const web = capabilitiesFor({ platform: "web", flags: [], entitlements: null, environment: "production" });

  it("every web destination is a feature available on the web - the web stays the complete platform", () => {
    for (const item of Object.values(NAV)) expect(web[item.feature], item.label).toEqual({ available: true, reason: null });
  });

  it("web keeps analytics, the Home dashboard and billing (web-only features)", () => {
    for (const feature of ["analytics", "home.dashboard", "billing.checkout", "billing.manage"] as const) expect(web[feature].available).toBe(true);
  });
});

describe("navigation layout", () => {
  it("mobile bottom bar is Home, Hunts, Create, Deals, Analytics", () => {
    expect(BOTTOM_ITEMS.map((i) => i.label)).toEqual(["Home", "Hunts", "Create Hunt", "Deals", "Analytics"]);
  });

  it("every destination is reachable on both layouts", () => {
    // Desktop: sidebar + persistent Create Hunt button. Mobile: bottom bar + Settings in the top bar.
    const desktop = [...SIDEBAR_ITEMS, NAV.createHunt].map((i) => i.href).sort();
    const mobile = [...BOTTOM_ITEMS, ...TOP_BAR_ITEMS].map((i) => i.href).sort();
    const all = Object.values(NAV).map((i) => i.href).sort();
    expect(desktop).toEqual(all);
    expect(mobile).toEqual(all);
  });
});
