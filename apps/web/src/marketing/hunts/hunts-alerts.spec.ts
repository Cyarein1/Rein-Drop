import { describe, expect, it } from "vitest";
import { ALERT_POINTS, alertsCopy, exampleNotification } from "../alerts/alerts-story";
import { marketplaceByKey } from "../marketplaces";
import { CUSTOMIZE_BY, exampleHunt, huntsCopy } from "./hunts-story";

describe("hunt customization (illustrative)", () => {
  it("uses the build plan's copy", () => {
    expect(huntsCopy.headline).toBe("Your budget. Your area. Your kind of flip.");
  });

  it("never claims the controls create a real Hunt", () => {
    expect(huntsCopy.illustrationLabel).toMatch(/illustration, not a working form/);
    expect(exampleHunt.summary).toMatch(/not a working form/);
    expect(JSON.stringify([huntsCopy, exampleHunt, CUSTOMIZE_BY])).not.toMatch(/create (a|your) hunt (here|now|below)|hunt (is )?created|start watching now/i);
    // The only action is joining early access.
    expect(huntsCopy.cta).toMatch(/^Join early access/);
  });

  it("covers product, budget, condition, location and sources; selects launch targets only", () => {
    expect(CUSTOMIZE_BY.map((c) => c.key)).toEqual(["product", "budget", "condition", "location", "sources"]);
    for (const key of exampleHunt.sources) expect(marketplaceByKey(key).status).toBe("launch_target");
  });
});

describe("alerts", () => {
  it("uses the build plan's copy", () => {
    expect(alertsCopy.headline).toBe("Get a heads-up when something worth checking drops.");
  });

  it("only lists channels the product has (push + in-app), promises no speed, shows no timestamps", () => {
    const text = JSON.stringify([alertsCopy, exampleNotification, ALERT_POINTS]);
    expect(text).not.toMatch(/e-?mail|sms|text message/i);
    expect(text).not.toMatch(/instant|real-time|immediately|never miss|guarantee|\d+ ?(sec|min|minutes|hours)|\bago\b|\bnow\b/i);
    expect(ALERT_POINTS.map((p) => p.key)).toEqual(["push", "inbox", "choose", "once"]);
    expect(alertsCopy.caveat).toMatch(/not advice to buy/);
  });
});
