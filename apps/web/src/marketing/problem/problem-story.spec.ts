import { describe, expect, it } from "vitest";
import { marketplaceByKey } from "../marketplaces";
import { afterStory, beforeStory, problemCopy } from "./problem-story";

const allText = JSON.stringify([problemCopy, beforeStory, afterStory]);

describe("problem story", () => {
  it("uses the spec's headline", () => {
    expect(problemCopy.headline).toBe("Great flips don't wait for your next refresh.");
  });

  it("makes no performance or speed claims and shows no live activity", () => {
    expect(allText).not.toMatch(/%|hours?\b|minutes?\b|\bmins?\b|ago\b|instant|real-time|guarantee|never miss|faster than|\bsaves?\b/i);
  });

  it("is a before / after story with three short points each", () => {
    for (const story of [beforeStory, afterStory]) {
      expect(story.points).toHaveLength(3);
      for (const p of story.points) expect(p.length).toBeLessThanOrEqual(60);
      expect(story.summary.startsWith("Illustration:")).toBe(true);
    }
  });

  it("only uses launch-target marketplaces in the saved Hunt", () => {
    for (const key of afterStory.hunt.marketplaces) expect(marketplaceByKey(key).status).toBe("launch_target");
  });
});
