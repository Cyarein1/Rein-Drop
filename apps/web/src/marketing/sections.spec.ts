import { describe, expect, it } from "vitest";
import { LANDING_SECTIONS, sectionHref } from "./sections";

describe("landing sections", () => {
  it("has the build plan's section ids, in narrative order", () => {
    expect(LANDING_SECTIONS.map((s) => s.id)).toEqual([
      "hero",
      "marketplaces",
      "problem",
      "how-it-works",
      "demo",
      "intelligence",
      "hunts",
      "alerts",
      "outcomes",
      "faq",
      "waitlist",
    ]);
  });

  it("uses unique ids that are valid URL fragments", () => {
    const ids = LANDING_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z-]*$/);
    expect(sectionHref("how-it-works")).toBe("/#how-it-works");
  });
});
