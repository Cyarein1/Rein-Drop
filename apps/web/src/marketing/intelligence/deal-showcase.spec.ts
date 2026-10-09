import { describe, expect, it } from "vitest";
import { ILLUSTRATIVE_LABEL, potentialGrossUpsideUsd, signedUsd, usd } from "../illustrative";
import { marketplaceByKey } from "../marketplaces";
import { intelligenceCopy, showcaseDeal, showcaseNotes } from "./deal-showcase";

const allText = JSON.stringify([intelligenceCopy, showcaseDeal, showcaseNotes]);

describe("deal intelligence showcase (illustrative)", () => {
  it("computes a positive GROSS upside = estimated resale - asking", () => {
    expect(potentialGrossUpsideUsd(showcaseDeal)).toBe(120);
    expect(signedUsd(potentialGrossUpsideUsd(showcaseDeal))).toBe("+$120");
  });

  it("never claims net profit, invents cost amounts or uses confidence percentages", () => {
    expect(allText).not.toMatch(/net profit|\bnet\b|guaranteed|%/i);
    const costs = showcaseNotes.find((n) => n.key === "costs")!;
    for (const item of costs.items) expect(item).not.toMatch(/\$|\d/);
    expect(costs.note).toMatch(/gross/i);
  });

  it("explains why, what to ask and the costs - with a caution about too-good prices", () => {
    expect(showcaseNotes.map((n) => n.title)).toEqual(["Why it was flagged", "Questions to ask the seller", "Before you count it as profit"]);
    expect(showcaseNotes[1].caution).toMatch(/red flag/i);
  });

  it("uses a launch-target marketplace and the shared illustrative label", () => {
    expect(marketplaceByKey(showcaseDeal.marketplace).status).toBe("launch_target");
    expect(ILLUSTRATIVE_LABEL).toBe("Illustrative example");
    expect(usd(showcaseDeal.askingUsd)).toBe("$300");
  });
});
