import { describe, expect, it } from "vitest";
import { DEMO_DISCLAIMERS, DEMO_LABEL } from "./demo-fixtures";
import { DEMO_INITIAL_STATE, demoTransition, runDemo, type DemoEvent, type DemoState } from "./demo-model";
import { DEMO_SCAN_TICK_MS, DEMO_STEPS, demoAnnouncement, demoHeading, demoStepIndex, demoStepText } from "./demo-view";

const ticks = (n: number): DemoEvent[] => Array.from({ length: n }, () => ({ type: "SCAN_TICK" }));
const configure = runDemo([{ type: "SELECT_PRODUCT", product: "iphone" }]);
const scan = demoTransition(configure, { type: "START_SCAN" });
const almost = runDemo(ticks(3), scan);
const candidate = demoTransition(almost, { type: "SCAN_TICK" });
const noMatchConfig = runDemo([{ type: "SET_MAX_PRICE", usd: 0 }], configure);
const noMatchAlmost = runDemo([{ type: "START_SCAN" }, ...ticks(3)], noMatchConfig);
const noMatch = demoTransition(noMatchAlmost, { type: "SCAN_TICK" });
const evaluation = demoTransition(candidate, { type: "VIEW_EVALUATION" });

describe("demo view", () => {
  it("the label is the obvious one asked for", () => {
    expect(DEMO_LABEL).toBe("Illustrative demo — not live listings");
    expect(DEMO_DISCLAIMERS.demo.startsWith(DEMO_LABEL)).toBe(true);
  });

  it("maps every state to one of four progress steps", () => {
    const states: [DemoState, number][] = [[DEMO_INITIAL_STATE, 0], [configure, 1], [scan, 2], [candidate, 2], [noMatch, 2], [evaluation, 3]];
    for (const [s, i] of states) expect(demoStepIndex(s)).toBe(i);
    expect(DEMO_STEPS.map((s) => s.label)).toEqual(["Product", "Hunt", "Scan", "Deal"]);
    expect(demoStepText(configure)).toBe("Step 2 of 4: Hunt");
  });

  it("gives each state its own heading", () => {
    expect(demoHeading(DEMO_INITIAL_STATE)).toBe("What should Rein Drop hunt for?");
    expect(demoHeading(configure)).toBe("Set up your iPhone 13 Pro Hunt");
    expect(demoHeading(scan)).toBe("Checking example listings for iPhone 13 Pro");
    expect(demoHeading(candidate)).toBe("Best match found");
    expect(demoHeading(noMatch)).toBe("Nothing fits this Hunt yet");
    expect(demoHeading(evaluation)).toBe("Why this deal was flagged");
  });

  it("announces the scan starting and its outcome, and nothing else", () => {
    expect(demoAnnouncement(configure, scan)).toBe("Checking 4 example listings. This takes a couple of seconds.");
    expect(demoAnnouncement(almost, candidate)).toBe(
      "Scan finished: 2 of 4 example listings fit your Hunt. Best match: iPhone 13 Pro 128GB Sierra Blue - upgrading, quick sale, asking $340, estimated gross upside +$90.",
    );
    expect(demoAnnouncement(noMatchAlmost, noMatch)).toBe("Scan finished: none of the 4 example listings fit your Hunt. Go back to change it.");
    // Ticks in between, step changes (focus handles those) and unchanged states: silent.
    expect(demoAnnouncement(scan, demoTransition(scan, { type: "SCAN_TICK" }))).toBeNull();
    expect(demoAnnouncement(DEMO_INITIAL_STATE, configure)).toBeNull();
    expect(demoAnnouncement(candidate, evaluation)).toBeNull();
    expect(demoAnnouncement(configure, configure)).toBeNull();
  });

  it("the outcome is announced for SCAN_COMPLETE (skip / reduced motion) too", () => {
    expect(demoAnnouncement(scan, demoTransition(scan, { type: "SCAN_COMPLETE" }))).toMatch(/^Scan finished: 2 of 4/);
  });

  it("stays fast: the whole scan takes about two seconds", () => {
    expect(DEMO_SCAN_TICK_MS * 4).toBeLessThanOrEqual(2000);
  });
});
