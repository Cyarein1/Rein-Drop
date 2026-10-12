import { describe, expect, it } from "vitest";
import { comingSoon, exploring, MARKETPLACES, startingWith, type MarketplaceKey } from "../marketplaces";
import {
  EMPTY_INTEREST,
  INTEREST_COPY,
  interestFormFields,
  interestReducer,
  OTHER_TEXT_MAX,
  pickCount,
  pickSummary,
  REQUESTABLE_MARKETPLACES,
  type InterestAction,
  type MarketplaceInterest,
} from "./marketplace-interest";

const run = (actions: InterestAction[], from: MarketplaceInterest = EMPTY_INTEREST) => actions.reduce(interestReducer, from);

describe("marketplace requests", () => {
  it("only marketplaces that aren't available can be requested - never the launch targets", () => {
    expect([...REQUESTABLE_MARKETPLACES].sort()).toEqual([...comingSoon(), ...exploring()].map((m) => m.key).sort());
    for (const m of startingWith()) expect(REQUESTABLE_MARKETPLACES).not.toContain(m.key);
    expect(interestReducer(EMPTY_INTEREST, { type: "toggle", key: "ebay" as MarketplaceKey })).toBe(EMPTY_INTEREST);
    expect(interestReducer(EMPTY_INTEREST, { type: "toggle", key: "not-a-marketplace" as MarketplaceKey })).toBe(EMPTY_INTEREST);
  });

  it("toggles keep gallery order, whatever order they were picked in", () => {
    const s = run([{ type: "toggle", key: "vinted" }, { type: "toggle", key: "offerup" }, { type: "toggle", key: "mercari" }]);
    const order = MARKETPLACES.map((m) => m.key);
    expect(s.keys).toEqual(["offerup", "mercari", "vinted"]);
    expect(s.keys).toEqual([...s.keys].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(run([{ type: "toggle", key: "mercari" }], s).keys).toEqual(["offerup", "vinted"]);
  });

  it("'Other' can be picked and named; switching it off forgets the text", () => {
    let s = run([{ type: "setOtherText", text: "ignored" }]);
    expect(s).toBe(EMPTY_INTEREST); // no text without "Other" picked
    s = run([{ type: "toggleOther" }, { type: "setOtherText", text: "  Kijiji   Canada " }]);
    expect(s).toMatchObject({ other: true, otherText: "Kijiji Canada " });
    expect(run([{ type: "setOtherText", text: "x".repeat(200) }], s).otherText).toHaveLength(OTHER_TEXT_MAX);
    expect(run([{ type: "toggleOther" }], s)).toEqual(EMPTY_INTEREST);
  });

  it("clear empties everything; clearing nothing changes nothing", () => {
    expect(run([{ type: "toggle", key: "etsy" }, { type: "toggleOther" }, { type: "clear" }])).toEqual(EMPTY_INTEREST);
    expect(interestReducer(EMPTY_INTEREST, { type: "clear" })).toBe(EMPTY_INTEREST);
  });

  it("form fields: one entry per pick, 'other' plus its trimmed name when given", () => {
    expect(interestFormFields(EMPTY_INTEREST)).toEqual([]);
    const s = run([{ type: "toggle", key: "poshmark" }, { type: "toggleOther" }, { type: "setOtherText", text: "Kijiji " }]);
    expect(interestFormFields(s)).toEqual([
      { name: "requestedMarketplaces", value: "poshmark" },
      { name: "requestedMarketplaces", value: "other" },
      { name: "requestedMarketplaceOther", value: "Kijiji" },
    ]);
    expect(interestFormFields(run([{ type: "toggleOther" }]))).toEqual([{ name: "requestedMarketplaces", value: "other" }]);
  });

  it("summaries are about the visitor's own picks only", () => {
    expect(pickSummary(EMPTY_INTEREST)).toBe("Nothing picked yet");
    const s = run([{ type: "toggle", key: "depop" }, { type: "toggleOther" }]);
    expect(pickCount(s)).toBe(2);
    expect(pickSummary(s)).toBe("2 picked");
  });

  it("copy never promises delivery or shows totals", () => {
    const text = Object.values(INTEREST_COPY).join(" ");
    expect(text).toMatch(/don't guarantee a marketplace will be added/);
    // Apart from that disclaimer, nothing promises a marketplace or mentions counts.
    expect(text.replace("don't guarantee a marketplace will be added", "")).not.toMatch(/votes?|\d+ (people|resellers|others)|coming soon|will be added|we'll add|soon/i);
  });
});
