import { describe, expect, it } from "vitest";
import { GOODBYE_CLEAR_PATH, GOODBYE_PATH, wantsGoodbye } from "./goodbye";

describe("sign-out after deleting the account", () => {
  it("only then=goodbye ends on the goodbye page", () => {
    const form = (entries: Record<string, string>) => new URLSearchParams(entries);
    expect(wantsGoodbye(form({ then: "goodbye" }))).toBe(true);
    expect(wantsGoodbye(form({}))).toBe(false);
    expect(wantsGoodbye(form({ then: "https://evil.example" }))).toBe(false);
    expect(wantsGoodbye(null)).toBe(false);
  });

  it("stays on this site", () => {
    expect(GOODBYE_PATH).toBe("/goodbye");
    expect(GOODBYE_CLEAR_PATH.startsWith("/auth/")).toBe(true);
  });
});
