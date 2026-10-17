import { describe, expect, it } from "vitest";
import { barSpan, compactMoney, domainOf, domId, labelIndexes, niceCeil } from "./scale";

describe("chart scales", () => {
  it("rounds axis ends up to nice numbers, keeping the sign", () => {
    expect(niceCeil(0)).toBe(0);
    expect(niceCeil(3)).toBe(5);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(180)).toBe(200);
    expect(niceCeil(2_400)).toBe(2_500);
    expect(niceCeil(-130)).toBe(-200);
    expect(niceCeil(1)).toBe(1);
  });

  it("always includes zero; an all-zero chart still has a range", () => {
    expect(domainOf([3, 7])).toEqual({ min: 0, max: 10, zero: 0 });
    expect(domainOf([0, 0])).toEqual({ min: 0, max: 1, zero: 0 });
    expect(domainOf([-50])).toEqual({ min: -50, max: 0, zero: 100 });
    expect(domainOf([150, -50])).toEqual({ min: -50, max: 200, zero: 20 });
  });

  it("places positive bars from zero up and negative bars from zero down", () => {
    const d = domainOf([150, -50]);
    expect(barSpan(100, d)).toEqual({ start: 20, size: 40 });
    expect(barSpan(-50, d)).toEqual({ start: 0, size: 20 });
    expect(barSpan(0, d)).toEqual({ start: 20, size: 0 });
    // A tiny non-zero value is still visible.
    expect(barSpan(1, domainOf([1000])).size).toBe(1);
  });

  it("thins axis labels but always keeps the last one", () => {
    expect([...labelIndexes(5)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    const many = labelIndexes(13, 6);
    expect(many.has(12)).toBe(true);
    expect(many.size).toBeLessThanOrEqual(6);
  });

  it("formats compact money in major units and safe DOM ids", () => {
    expect(compactMoney(150_000, "USD", "en-US")).toBe("$1.5K");
    expect(domId("missed", "2026-10-01", "a b")).toBe("missed-2026-10-01-a_b");
  });
});
