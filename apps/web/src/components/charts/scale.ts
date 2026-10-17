import { currencyDigits } from "@rein-drop/client-core";

/**
 * Chart geometry (pure, unit-tested). Percentages are of the plot box. Every scale starts at zero
 * (bars never float), and a domain with negative values puts zero inside the box (diverging).
 */

/** The next "nice" number at or above |n| (1, 2, 2.5, 5 x 10^k), keeping the sign. */
export function niceCeil(n: number): number {
  if (n === 0) return 0;
  const abs = Math.abs(n);
  const pow = 10 ** Math.floor(Math.log10(abs));
  const nice = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s >= abs - 1e-9) ?? 10 * pow;
  return Math.sign(n) * nice;
}

export interface Domain {
  min: number;
  max: number;
  /** Where zero sits, 0-100 from the start (left / bottom). */
  zero: number;
}

/** A zero-based domain with nice ends. All zeros -> [0, 1] so nothing divides by zero. */
export function domainOf(values: readonly number[]): Domain {
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const min = rawMin < 0 ? niceCeil(rawMin) : 0;
  const max = rawMax > 0 ? niceCeil(rawMax) : rawMin < 0 ? 0 : 1;
  return { min, max, zero: min === 0 ? 0 : (100 * -min) / (max - min) };
}

/** One bar: offset of its start and its length, both 0-100. A non-zero value gets at least a sliver. */
export function barSpan(value: number, d: Domain): { start: number; size: number } {
  const range = d.max - d.min;
  const raw = (100 * Math.abs(value)) / range;
  const size = value === 0 ? 0 : Math.max(raw, 1);
  return { start: value >= 0 ? d.zero : d.zero - size, size };
}

/** Which of `count` axis labels to show so at most `max` appear, always including the last. */
export function labelIndexes(count: number, max = 6): Set<number> {
  if (count <= max) return new Set(Array.from({ length: count }, (_, i) => i));
  const every = Math.ceil(count / max);
  const shown = new Set<number>();
  for (let i = count - 1; i >= 0; i -= every) shown.add(i);
  return shown;
}

/** Compact money for axis ticks: "R 1,2 k" style per locale. `minor` is in minor units. */
export function compactMoney(minor: number, currency: string, localeTag: string): string {
  const major = minor / 10 ** currencyDigits(currency);
  try {
    return new Intl.NumberFormat(localeTag, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(major);
  } catch {
    return `${currency} ${major}`;
  }
}

/** Compact count for axis ticks. */
export function compactCount(n: number, localeTag: string): string {
  return new Intl.NumberFormat(localeTag, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** A DOM-id-safe token from any key. */
export const domId = (...parts: string[]) => parts.join("-").replace(/[^A-Za-z0-9_-]/g, "_");
