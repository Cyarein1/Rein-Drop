import { describe, expect, it } from "vitest";
import { HOW_IT_WORKS_STEPS, howItWorksCopy, youDecide } from "./how-it-works-story";

const allText = JSON.stringify([howItWorksCopy, HOW_IT_WORKS_STEPS, youDecide]);

describe("how it works", () => {
  it("has the three steps from the build plan, in order", () => {
    expect(HOW_IT_WORKS_STEPS.map((s) => s.title)).toEqual(["Tell us what you want", "Rein Drop keeps looking", "You check promising deals"]);
  });

  it("says the reseller evaluates and decides - Rein Drop never buys", () => {
    expect(HOW_IT_WORKS_STEPS[2].text).toMatch(/you decide whether to buy/i);
    expect(youDecide.text).toMatch(/never buys anything for you/i);
    // Nothing suggests Rein Drop buys on the reseller's behalf.
    expect(allText).not.toMatch(/auto-?buy|we buy|automatic(ally)? purchas|on your behalf|checkout for you/i);
  });

  it("promises no speed, frequency or bargains", () => {
    expect(allText).not.toMatch(/instant|real-time|every \d|\d+ ?(min|minutes|hours)|guarantee(d|s)? (a )?(deal|profit|bargain)|always find|never miss/i);
  });

  it("summarises every illustration in words", () => {
    for (const s of HOW_IT_WORKS_STEPS) expect(s.summary.startsWith("Illustration:")).toBe(true);
  });
});
