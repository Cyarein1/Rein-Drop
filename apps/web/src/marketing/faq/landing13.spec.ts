import { describe, expect, it } from "vitest";
import { potentialGrossUpsideUsd } from "../illustrative";
import { exampleFlip, realizedProfitUsd, totalCostsUsd } from "../outcomes/outcomes-story";
import { contactEmail, LEGAL_LINKS } from "../site-config";
import { FAQ } from "./faq";

describe("after the flip (illustrative)", () => {
  it("uses the app's realized-profit formula and shows estimate != actual", () => {
    // (415 - 31 - 13) - (300 + 8) = 63
    expect(realizedProfitUsd(exampleFlip)).toBe(63);
    expect(totalCostsUsd(exampleFlip)).toBe(52);
    expect(potentialGrossUpsideUsd(exampleFlip.estimate)).toBe(120);
    expect(realizedProfitUsd(exampleFlip)).toBeLessThan(potentialGrossUpsideUsd(exampleFlip.estimate));
  });
});

describe("FAQ", () => {
  it("covers every required topic", () => {
    expect(FAQ.map((f) => f.topic).sort()).toEqual(["availability", "buying", "cost", "estimates", "hunt", "marketplaces", "timing"]);
    expect(new Set(FAQ.map((f) => f.id)).size).toBe(FAQ.length);
  });

  it("answers honestly: no dates, prices, guarantees or 'live' claims", () => {
    const text = JSON.stringify(FAQ);
    expect(text).not.toMatch(/\b20\d\d\b|\$\d|per month|\/mo\b|free trial/i);
    expect(FAQ.find((f) => f.topic === "buying")!.answer).toMatch(/^No\./);
    expect(FAQ.find((f) => f.topic === "estimates")!.answer).toMatch(/^No\./);
    expect(FAQ.find((f) => f.topic === "timing")!.answer).toMatch(/can't promise instant/);
    expect(FAQ.find((f) => f.topic === "cost")!.answer).toMatch(/isn't final/);
    expect(FAQ.find((f) => f.topic === "marketplaces")!.answer).toMatch(/not live yet/);
  });
});

describe("footer config", () => {
  it("never invents a contact address", () => {
    expect(contactEmail({})).toBeNull();
    expect(contactEmail({ CONTACT_EMAIL: "not an email" })).toBeNull();
    expect(contactEmail({ CONTACT_EMAIL: " hello@example.com " })).toBe("hello@example.com");
  });

  it("links to the legal placeholder routes", () => {
    expect(LEGAL_LINKS.map((l) => l.href)).toEqual(["/privacy", "/terms"]);
  });
});
