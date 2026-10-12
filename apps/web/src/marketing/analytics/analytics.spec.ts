import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_INTEREST, interestReducer, newlyRequested } from "../marketplaces/marketplace-interest";
import { privacySignal, PROVIDERS, resolveProvider, trackWith, type AnalyticsContext, type AnalyticsProvider } from "./analytics";
import { LANDING_EVENTS, sanitizeLandingEvent } from "./landing-events";

afterEach(() => vi.restoreAllMocks());

function recorder(requiresConsent = false) {
  const sent: [string, Record<string, string | number>][] = [];
  const provider: AnalyticsProvider = { id: "test", requiresConsent, send: (n, p) => sent.push([n, p]) };
  return { provider, sent };
}
const ctx = (provider: AnalyticsProvider, over: Partial<AnalyticsContext> = {}): AnalyticsContext => ({ provider, optedOut: false, consented: false, ...over });

describe("landing analytics", () => {
  it("has exactly the five landing events", () => {
    expect(Object.keys(LANDING_EVENTS)).toEqual(["hero_cta_clicked", "demo_started", "demo_completed", "marketplace_requested", "waitlist_succeeded"]);
  });

  it("sends catalog events with exactly their properties", () => {
    const { provider, sent } = recorder();
    expect(trackWith(ctx(provider), "hero_cta_clicked", { cta: "join_early_access" })).toBe("sent");
    expect(trackWith(ctx(provider), "demo_started", { product: "playstation" })).toBe("sent");
    expect(trackWith(ctx(provider), "demo_completed", { product: "macbook" })).toBe("sent");
    expect(trackWith(ctx(provider), "marketplace_requested", { marketplace: "other" })).toBe("sent");
    expect(trackWith(ctx(provider), "waitlist_succeeded", { requested: 2 })).toBe("sent");
    expect(sent).toEqual([
      ["hero_cta_clicked", { cta: "join_early_access" }],
      ["demo_started", { product: "playstation" }],
      ["demo_completed", { product: "macbook" }],
      ["marketplace_requested", { marketplace: "other" }],
      ["waitlist_succeeded", { requested: 2 }],
    ]);
  });

  it("never passes personal data: extra properties are dropped; free text or unknown values are refused", () => {
    expect(sanitizeLandingEvent("waitlist_succeeded", { requested: 1, email: "sam@example.com", ip: "203.0.113.7", sessionId: "abc" })).toEqual({ requested: 1 });
    expect(sanitizeLandingEvent("marketplace_requested", { marketplace: "Kijiji" })).toBeNull();
    expect(sanitizeLandingEvent("marketplace_requested", { marketplace: "ebay" })).toBeNull(); // launch targets aren't requestable
    expect(sanitizeLandingEvent("hero_cta_clicked", { cta: "sam@example.com" })).toBeNull();
    expect(sanitizeLandingEvent("waitlist_succeeded", { requested: 99 })).toBeNull();
    expect(sanitizeLandingEvent("waitlist_succeeded", { requested: 1.5 })).toBeNull();
    expect(sanitizeLandingEvent("page_viewed", {})).toBeNull();
    expect(sanitizeLandingEvent("demo_started", null)).toBeNull();
    const { provider, sent } = recorder();
    expect(trackWith(ctx(provider), "marketplace_requested", { marketplace: "Kijiji" })).toBe("invalid");
    expect(sent).toEqual([]);
  });

  it("respects Global Privacy Control and Do Not Track", () => {
    expect(privacySignal({ globalPrivacyControl: true })).toBe(true);
    expect(privacySignal({ doNotTrack: "1" })).toBe(true);
    expect(privacySignal({ doNotTrack: "0" })).toBe(false);
    expect(privacySignal({})).toBe(false);
    expect(privacySignal(undefined)).toBe(false);
    const { provider, sent } = recorder();
    expect(trackWith(ctx(provider, { optedOut: true }), "demo_started", { product: "iphone" })).toBe("opted_out");
    expect(sent).toEqual([]);
  });

  it("a provider that needs consent stays off until consent is given (no consent UI exists yet)", () => {
    const { provider, sent } = recorder(true);
    expect(trackWith(ctx(provider), "demo_started", { product: "iphone" })).toBe("no_consent");
    expect(sent).toEqual([]);
    expect(trackWith(ctx(provider, { consented: true }), "demo_started", { product: "iphone" })).toBe("sent");
  });

  it("provider config: console in development, none in production, unknown names never send", () => {
    expect(resolveProvider(undefined, "development").id).toBe("console");
    expect(resolveProvider(undefined, "production").id).toBe("none");
    expect(resolveProvider("console", "production").id).toBe("console");
    expect(resolveProvider(" NONE ", "development").id).toBe("none");
    expect(resolveProvider("some-vendor", "production").id).toBe("none");
    // The built-in providers set nothing and need no consent.
    for (const p of Object.values(PROVIDERS)) expect(p.requiresConsent).toBe(false);
  });

  it("console mode logs the sanitized event; a failing provider never breaks the page", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(trackWith(ctx(PROVIDERS.console!), "hero_cta_clicked", { cta: "see_how_it_works", extra: "x" })).toBe("sent");
    expect(info).toHaveBeenCalledWith("[landing-analytics]", "hero_cta_clicked", { cta: "see_how_it_works" });
    const broken: AnalyticsProvider = { id: "broken", requiresConsent: false, send: () => { throw new Error("blocked by an ad blocker"); } };
    expect(trackWith(ctx(broken), "demo_started", { product: "iphone" })).toBe("failed");
  });

  it("marketplace requests are counted once per new pick (keys and 'other', never the typed name)", () => {
    const a = interestReducer(EMPTY_INTEREST, { type: "toggle", key: "etsy" });
    expect(newlyRequested(EMPTY_INTEREST, a)).toEqual(["etsy"]);
    const b = interestReducer(a, { type: "toggleOther" });
    expect(newlyRequested(a, b)).toEqual(["other"]);
    const c = interestReducer(b, { type: "setOtherText", text: "Kijiji" });
    expect(newlyRequested(b, c)).toEqual([]);
    expect(newlyRequested(c, interestReducer(c, { type: "toggle", key: "etsy" }))).toEqual([]); // un-pick
  });

  it("is write-only: nothing in the app reads analytics back or shows a count", () => {
    const src = path.resolve(__dirname, "..");
    const files = readdirSync(src, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".spec.ts"))
      .map((e) => readFileSync(path.join(e.parentPath, e.name), "utf8"));
    const analytics = readFileSync(path.join(__dirname, "analytics.ts"), "utf8");
    expect(analytics).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB|crypto\.randomUUID|Date\.now|fetch\(/);
    expect(files.join("\n")).not.toMatch(/\b(getEvents|readAnalytics|eventCount|signupCount|waitlistCount)\b/);
  });
});
