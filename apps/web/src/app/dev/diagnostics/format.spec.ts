import { describe, expect, it } from "vitest";
import { formatMs, formatStats, formatUsd, readWindow, share } from "./format";

describe("diagnostics formatting", () => {
  it("formats durations from ms to days", () => {
    expect(formatMs(null)).toBe("—");
    expect(formatMs(850.4)).toBe("850 ms");
    expect(formatMs(1600)).toBe("1.6 s");
    expect(formatMs(10 * 60_000)).toBe("10.0 min");
    expect(formatMs(5 * 3_600_000)).toBe("5.0 h");
    expect(formatMs(3 * 86_400_000)).toBe("3.0 d");
  });

  it("formats USD, marking estimates and keeping unknown distinct from free", () => {
    expect(formatUsd(null)).toBe("unknown");
    expect(formatUsd(0, true)).toBe("$0");
    expect(formatUsd(0.0155, true)).toBe("~$0.0155");
    expect(formatUsd(12.5)).toBe("$12.50");
  });

  it("formats shares and duration stats", () => {
    expect(share(1, 3)).toBe("33%");
    expect(share(1, 0)).toBe("—");
    expect(formatStats({ samples: 0, p50Ms: null, p95Ms: null, maxMs: null })).toBe("no samples");
    expect(formatStats({ samples: 2, p50Ms: 2800, p95Ms: 3880, maxMs: 4000 })).toBe("p50 2.8 s · p95 3.9 s · max 4.0 s (n=2)");
  });

  it("reads the window from the query, falling back to 24 hours", () => {
    expect(readWindow({})).toEqual({ hours: 24 });
    expect(readWindow({ hours: "168" })).toEqual({ hours: 168 });
    expect(readWindow({ hours: "0" })).toEqual({ hours: 24 });
    expect(readWindow({ hours: "abc" })).toEqual({ hours: 24 });
    expect(readWindow({ since: "2021-02-01T00:00:00Z", until: "2021-02-03T00:00:00Z" })).toEqual({ hours: 24, since: "2021-02-01T00:00:00Z", until: "2021-02-03T00:00:00Z" });
    expect(readWindow({ until: "2021-02-03T00:00:00Z" })).toEqual({ hours: 24 });
  });
});
