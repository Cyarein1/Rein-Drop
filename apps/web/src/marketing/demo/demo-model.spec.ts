import { afterEach, describe, expect, it, vi } from "vitest";
import { MARKETPLACES } from "../marketplaces";
import { productPhotos } from "../photos";
import { showcaseDeal } from "../intelligence/deal-showcase";
import { DEMO_DISCLAIMERS, DEMO_MARKETPLACES, DEMO_PRODUCTS, demoProduct, type DemoProductKey } from "./demo-fixtures";
import {
  checkListing,
  clampPrice,
  confidenceFor,
  DEMO_INITIAL_STATE,
  demoTransition,
  runDemo,
  scanProgress,
  type DemoEvent,
  type DemoState,
} from "./demo-model";

const KEYS: DemoProductKey[] = ["iphone", "playstation", "macbook"];
const configure = (product: DemoProductKey) => runDemo([{ type: "SELECT_PRODUCT", product }]);
const ticks = (n: number): DemoEvent[] => Array.from({ length: n }, () => ({ type: "SCAN_TICK" }));
const toCandidate = (product: DemoProductKey, extra: DemoEvent[] = []) =>
  runDemo([{ type: "SELECT_PRODUCT", product }, ...extra, { type: "START_SCAN" }, { type: "SCAN_COMPLETE" }]);
const stepOf = (s: DemoState) => s.step;
/** All visible strings in a value, for wording checks. */
const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Data invariants
// ---------------------------------------------------------------------------

describe("demo fixtures", () => {
  it("has exactly the three products, with unique keys", () => {
    expect(DEMO_PRODUCTS.map((p) => p.key)).toEqual(KEYS);
  });

  it("listing ids are unique and clearly demo ids", () => {
    const ids = DEMO_PRODUCTS.flatMap((p) => p.listings.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^demo-[a-z0-9]+-\d+$/);
  });

  it("uses only launch-target marketplaces from the roadmap (no implied extra sources)", () => {
    const launch = MARKETPLACES.filter((m) => m.status === "launch_target").map((m) => m.key);
    expect([...DEMO_MARKETPLACES].sort()).toEqual([...launch].sort());
    for (const p of DEMO_PRODUCTS) for (const l of p.listings) expect(DEMO_MARKETPLACES).toContain(l.marketplace);
  });

  it.each(DEMO_PRODUCTS.map((p) => [p.key, p] as const))("%s: figures are sane whole dollars", (_k, p) => {
    for (const r of Object.values(p.resale)) {
      expect(r.lowUsd).toBeLessThanOrEqual(r.typicalUsd);
      expect(r.typicalUsd).toBeLessThanOrEqual(r.highUsd);
      expect(r.comparableSales).toBeGreaterThan(0);
      for (const n of [r.lowUsd, r.typicalUsd, r.highUsd]) expect(Number.isInteger(n) && n > 0).toBe(true);
    }
    for (const l of p.listings) {
      expect(Number.isInteger(l.askingUsd) && l.askingUsd > 0).toBe(true);
      // Local pickup has a distance; shipped listings don't.
      expect(l.distanceMiles === null).toBe(l.marketplace === "ebay");
      expect(l.postedMinutesAgo).toBeGreaterThanOrEqual(0);
    }
    const { minUsd, maxUsd, stepUsd } = p.priceRange;
    expect(minUsd < maxUsd && (maxUsd - minUsd) % stepUsd === 0).toBe(true);
    expect(clampPrice(p, p.defaults.maxPriceUsd)).toBe(p.defaults.maxPriceUsd);
    expect(p.radiusOptions).toContain(p.defaults.radiusMiles);
    expect(p.defaults.marketplaces.length).toBeGreaterThan(0);
    expect(p.questionsForSeller.length).toBeGreaterThan(0);
    if (p.photo) expect(productPhotos[p.photo]).toBeDefined();
  });

  it.each(KEYS)("%s: the default Hunt finds a candidate with positive gross upside, and also filters something out", (key) => {
    const s = toCandidate(key);
    expect(s.step).toBe("candidate");
    if (s.step !== "candidate") return;
    expect(s.candidate.grossUpsideUsd).toBeGreaterThan(0);
    expect(s.scanned.some((x) => x.result !== "match")).toBe(true);
  });

  it("the PlayStation demo agrees with the deal-intelligence card (same asking / resale)", () => {
    const s = toCandidate("playstation");
    if (s.step !== "candidate") throw new Error(s.step);
    expect(s.candidate.listing.askingUsd).toBe(showcaseDeal.askingUsd);
    expect(s.candidate.resale.typicalUsd).toBe(showcaseDeal.estimatedResaleUsd);
  });

  it("disclaimers say demo / not live, estimate, and gross - not profit", () => {
    expect(DEMO_DISCLAIMERS.demo).toMatch(/Illustrative demo — not live listings/);
    expect(DEMO_DISCLAIMERS.estimate).toMatch(/estimates/);
    expect(DEMO_DISCLAIMERS.gross).toMatch(/gross/i);
    expect(DEMO_DISCLAIMERS.gross).toMatch(/not profit/);
  });

  it("no fixture text promises profit, speed or real availability", () => {
    const text = strings(DEMO_PRODUCTS).join("\n");
    expect(text).not.toMatch(/net profit|guarantee|instant|real-time|live listing/i);
  });
});

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

describe("demo transitions", () => {
  it("starts at choose; choosing a product copies its defaults into configure", () => {
    expect(DEMO_INITIAL_STATE).toEqual({ step: "choose" });
    const s = configure("iphone");
    expect(s).toEqual({ step: "configure", product: "iphone", config: demoProduct("iphone").defaults });
    if (s.step !== "configure") return;
    // A copy - changing it can never change the fixtures.
    expect(s.config).not.toBe(demoProduct("iphone").defaults);
    expect(s.config.marketplaces).not.toBe(demoProduct("iphone").defaults.marketplaces);
  });

  it("events that don't apply return the same state object", () => {
    const choose = DEMO_INITIAL_STATE;
    for (const e of [{ type: "START_SCAN" }, { type: "SCAN_TICK" }, { type: "VIEW_EVALUATION" }, { type: "BACK" }, { type: "RESTART" }, { type: "SET_MAX_PRICE", usd: 300 }] as DemoEvent[]) {
      expect(demoTransition(choose, e)).toBe(choose);
    }
    const conf = configure("iphone");
    for (const e of [{ type: "SCAN_TICK" }, { type: "SCAN_COMPLETE" }, { type: "VIEW_EVALUATION" }, { type: "SELECT_PRODUCT", product: "macbook" }] as DemoEvent[]) {
      expect(demoTransition(conf, e)).toBe(conf);
    }
    const scan = demoTransition(conf, { type: "START_SCAN" });
    for (const e of [{ type: "START_SCAN" }, { type: "SET_MAX_PRICE", usd: 300 }, { type: "VIEW_EVALUATION" }] as DemoEvent[]) expect(demoTransition(scan, e)).toBe(scan);
    const cand = toCandidate("iphone");
    for (const e of [{ type: "SCAN_TICK" }, { type: "START_SCAN" }, { type: "SET_CONDITION", condition: "new" }] as DemoEvent[]) expect(demoTransition(cand, e)).toBe(cand);
    const ev = demoTransition(cand, { type: "VIEW_EVALUATION" });
    for (const e of [{ type: "VIEW_EVALUATION" }, { type: "SCAN_TICK" }] as DemoEvent[]) expect(demoTransition(ev, e)).toBe(ev);
  });

  describe("configure", () => {
    it("max price is clamped to the product's range and snapped to its step", () => {
      const p = demoProduct("iphone");
      const at = (usd: number) => (runDemo([{ type: "SET_MAX_PRICE", usd }], configure("iphone")) as Extract<DemoState, { step: "configure" }>).config.maxPriceUsd;
      expect(at(503)).toBe(500);
      expect(at(507)).toBe(510);
      expect(at(10)).toBe(p.priceRange.minUsd);
      expect(at(99_999)).toBe(p.priceRange.maxUsd);
      expect(at(Number.NaN)).toBe(p.defaults.maxPriceUsd);
      // Same value -> same state object.
      const conf = configure("iphone");
      expect(demoTransition(conf, { type: "SET_MAX_PRICE", usd: p.defaults.maxPriceUsd })).toBe(conf);
    });

    it("condition and radius accept only offered values", () => {
      const conf = configure("iphone");
      const used = demoTransition(conf, { type: "SET_CONDITION", condition: "used" });
      expect(used.step === "configure" && used.config.condition).toBe("used");
      expect(demoTransition(conf, { type: "SET_CONDITION", condition: "refurbished" as never })).toBe(conf);
      const far = demoTransition(conf, { type: "SET_RADIUS", miles: 50 });
      expect(far.step === "configure" && far.config.radiusMiles).toBe(50);
      expect(demoTransition(conf, { type: "SET_RADIUS", miles: 37 })).toBe(conf);
    });

    it("marketplaces toggle in canonical order, and the last one can't be switched off", () => {
      const conf = configure("iphone");
      const ebayOnly = demoTransition(conf, { type: "TOGGLE_MARKETPLACE", marketplace: "facebook" });
      expect(ebayOnly.step === "configure" && ebayOnly.config.marketplaces).toEqual(["ebay"]);
      expect(demoTransition(ebayOnly, { type: "TOGGLE_MARKETPLACE", marketplace: "ebay" })).toBe(ebayOnly);
      const fbOnly = runDemo([{ type: "TOGGLE_MARKETPLACE", marketplace: "ebay" }], conf);
      const both = demoTransition(fbOnly, { type: "TOGGLE_MARKETPLACE", marketplace: "ebay" });
      expect(both.step === "configure" && both.config.marketplaces).toEqual(["ebay", "facebook"]);
    });

    it("never changes the fixtures", () => {
      const before = JSON.stringify(DEMO_PRODUCTS);
      runDemo([{ type: "SELECT_PRODUCT", product: "iphone" }, { type: "SET_MAX_PRICE", usd: 700 }, { type: "TOGGLE_MARKETPLACE", marketplace: "facebook" }, { type: "SET_CONDITION", condition: "new" }, { type: "START_SCAN" }, { type: "SCAN_COMPLETE" }]);
      expect(JSON.stringify(DEMO_PRODUCTS)).toBe(before);
    });

    it("BACK returns to choose", () => {
      expect(demoTransition(configure("macbook"), { type: "BACK" })).toEqual({ step: "choose" });
    });
  });

  describe("scan", () => {
    it("starts empty and checks one listing per tick, in fixture order", () => {
      let s = runDemo([{ type: "START_SCAN" }], configure("iphone"));
      expect(s.step === "scan" && scanProgress(s)).toEqual({ checked: 0, total: 4 });
      s = runDemo(ticks(2), s);
      if (s.step !== "scan") throw new Error(s.step);
      expect(scanProgress(s)).toEqual({ checked: 2, total: 4 });
      expect(s.scanned.map((x) => x.listing.id)).toEqual(["demo-iphone-1", "demo-iphone-2"]);
    });

    it("the last tick ends the scan - ticking and completing give the same result", () => {
      const conf = configure("iphone");
      const ticked = runDemo([{ type: "START_SCAN" }, ...ticks(4)], conf);
      const completed = runDemo([{ type: "START_SCAN" }, { type: "SCAN_COMPLETE" }], conf);
      expect(ticked.step).toBe("candidate");
      expect(ticked).toEqual(completed);
    });

    it("SCAN_COMPLETE mid-scan finishes at once (reduced motion)", () => {
      const s = runDemo([{ type: "START_SCAN" }, ...ticks(1), { type: "SCAN_COMPLETE" }], configure("macbook"));
      expect(s.step).toBe("candidate");
      if (s.step === "candidate") expect(s.scanned).toHaveLength(4);
    });

    it("explains every skipped listing with a fixed reason", () => {
      const s = toCandidate("iphone");
      if (s.step !== "candidate") throw new Error(s.step);
      expect(s.scanned.map((x) => [x.listing.id, x.result, x.note])).toEqual([
        ["demo-iphone-1", "over_max_price", "Over your max price ($450)"],
        ["demo-iphone-2", "match", "Fits your Hunt"],
        ["demo-iphone-3", "too_far", "38 mi away - outside 25 mi"],
        ["demo-iphone-4", "match", "Fits your Hunt"],
      ]);
    });

    it("checks in a fixed order: marketplace, condition, price, distance", () => {
      const l = demoProduct("playstation").listings[1]!; // new, $430, Facebook 4 mi
      const base = { maxPriceUsd: 350, condition: "used" as const, marketplaces: ["ebay" as const], radiusMiles: 1 };
      expect(checkListing(l, base).result).toBe("marketplace_off");
      expect(checkListing(l, { ...base, marketplaces: ["facebook"] }).result).toBe("condition");
      expect(checkListing(l, { ...base, marketplaces: ["facebook"], condition: "any" }).result).toBe("over_max_price");
      expect(checkListing(l, { ...base, marketplaces: ["facebook"], condition: "any", maxPriceUsd: 500 }).result).toBe("too_far");
      expect(checkListing(l, { ...base, marketplaces: ["facebook"], condition: "any", maxPriceUsd: 500, radiusMiles: 10 }).result).toBe("match");
    });

    it("BACK during the scan returns to configure with the same settings", () => {
      const conf = runDemo([{ type: "SET_MAX_PRICE", usd: 600 }], configure("iphone"));
      const back = runDemo([{ type: "START_SCAN" }, ...ticks(1), { type: "BACK" }], conf);
      expect(back).toEqual(conf);
    });
  });

  describe("candidate / no match", () => {
    it.each([
      ["iphone", "demo-iphone-4", 90],
      ["playstation", "demo-ps5-3", 120],
      ["macbook", "demo-macbook-3", 120],
    ] as const)("%s default Hunt: candidate %s with +$%i gross upside (the best match)", (key, id, upside) => {
      const s = toCandidate(key);
      if (s.step !== "candidate") throw new Error(s.step);
      expect(s.candidate.listing.id).toBe(id);
      expect(s.candidate.grossUpsideUsd).toBe(upside);
    });

    it("upside uses the estimate for the listing's own condition", () => {
      const s = toCandidate("iphone", [{ type: "SET_CONDITION", condition: "new" }, { type: "SET_MAX_PRICE", usd: 600 }]);
      if (s.step !== "candidate") throw new Error(s.step);
      expect(s.candidate.listing.id).toBe("demo-iphone-1");
      expect(s.candidate.resale).toBe(demoProduct("iphone").resale.new);
      expect(s.candidate.grossUpsideUsd).toBe(600 - 520);
    });

    it.each(KEYS)("%s: a too-tight Hunt ends in no_match, and BACK keeps the settings", (key) => {
      const p = demoProduct(key);
      const s = toCandidate(key, [{ type: "SET_MAX_PRICE", usd: p.priceRange.minUsd }]);
      expect(s.step).toBe("no_match");
      if (s.step !== "no_match") return;
      expect(s.scanned.every((x) => x.result !== "match")).toBe(true);
      const back = demoTransition(s, { type: "BACK" });
      expect(back).toEqual({ step: "configure", product: key, config: s.config });
    });

    it("candidate BACK returns to configure", () => {
      expect(stepOf(demoTransition(toCandidate("playstation"), { type: "BACK" }))).toBe("configure");
    });
  });

  describe("evaluation", () => {
    const evaluationOf = (key: DemoProductKey) => {
      const s = demoTransition(toCandidate(key), { type: "VIEW_EVALUATION" });
      if (s.step !== "evaluation") throw new Error(s.step);
      return s;
    };

    it.each(KEYS)("%s: figures add up and carry every disclaimer", (key) => {
      const { evaluation: e, candidate } = evaluationOf(key);
      expect(e.askingUsd).toBe(candidate.listing.askingUsd);
      expect(e.grossUpside.typicalUsd).toBe(e.estimatedResale.typicalUsd - e.askingUsd);
      expect(e.grossUpside.lowUsd).toBe(e.estimatedResale.lowUsd - e.askingUsd);
      expect(e.grossUpside.highUsd).toBe(e.estimatedResale.highUsd - e.askingUsd);
      expect(e.disclaimers).toEqual(DEMO_DISCLAIMERS);
      expect(e.costsBeforeProfit.length).toBeGreaterThan(0);
      expect(e.why.length).toBe(4);
      expect(e.questionsForSeller).toEqual(demoProduct(key).questionsForSeller);
    });

    it("strength and confidence follow the stated rules", () => {
      expect(evaluationOf("iphone").evaluation).toMatchObject({ strength: "Strong deal", confidence: { level: "high" } });
      expect(evaluationOf("playstation").evaluation).toMatchObject({ strength: "Strong deal", confidence: { level: "medium" } });
      expect(evaluationOf("macbook").evaluation).toMatchObject({ strength: "Worth a look", confidence: { level: "medium" } });
      expect([confidenceFor(10).level, confidenceFor(9).level, confidenceFor(5).level, confidenceFor(4).level]).toEqual(["high", "medium", "medium", "low"]);
    });

    it("explains why in plain words (price, condition, where, estimate)", () => {
      expect(evaluationOf("iphone").evaluation.why).toEqual([
        "Under your max price ($450)",
        "Used - you accept any condition",
        "Local pickup, 6 mi away",
        "Asking is $90 below the typical estimated resale for a used one",
      ]);
      expect(evaluationOf("playstation").evaluation.why[1]).toBe("Used, as you asked");
      expect(evaluationOf("playstation").evaluation.why[2]).toBe("Ships via eBay");
    });

    it("never calls anything profit except to say it isn't", () => {
      for (const key of KEYS) {
        const text = strings(evaluationOf(key).evaluation).filter((t) => !Object.values(DEMO_DISCLAIMERS).includes(t as never));
        for (const t of text) expect(t).not.toMatch(/profit/i);
      }
    });

    it("BACK returns to the candidate; RESTART from anywhere returns to choose", () => {
      const ev = evaluationOf("macbook");
      const back = demoTransition(ev, { type: "BACK" });
      expect(back).toEqual(toCandidate("macbook"));
      expect(demoTransition(ev, { type: "RESTART" })).toEqual({ step: "choose" });
      expect(demoTransition(configure("iphone"), { type: "RESTART" })).toEqual({ step: "choose" });
    });
  });

  it("is deterministic and pure: no clock, no randomness, no network", async () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Math.random used"); });
    const now = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("Date.now used"); });
    const fetchSpy = vi.fn(() => { throw new Error("fetch used"); });
    vi.stubGlobal("fetch", fetchSpy);
    const path: DemoEvent[] = [{ type: "SELECT_PRODUCT", product: "playstation" }, { type: "START_SCAN" }, ...ticks(4), { type: "VIEW_EVALUATION" }];
    const a = runDemo(path);
    const b = runDemo(path);
    expect(a).toEqual(b);
    expect(a.step).toBe("evaluation");
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
