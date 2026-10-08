import { DIAGNOSTICS_MAX_HOURS, type DurationStats } from "@rein-drop/api-client";

/** Formatting for the internal diagnostics page (developer-facing, English, USD as reported). */

export const WINDOWS = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "24 hours" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
] as const;

const DASH = "—";

/** `?hours=` (whole hours, 1..max), or an explicit `?since=&until=` test window. */
export function readWindow(params: Record<string, string | string[] | undefined>): { hours: number; since?: string; until?: string } {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const hours = Number(one(params.hours));
  const since = one(params.since);
  const until = one(params.until);
  return {
    hours: Number.isInteger(hours) && hours >= 1 && hours <= DIAGNOSTICS_MAX_HOURS ? hours : 24,
    ...(since ? { since } : {}),
    ...(since && until ? { until } : {}),
  };
}

export function formatMs(ms: number | null): string {
  if (ms === null) return DASH;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} min`;
  if (ms < 48 * 3_600_000) return `${(ms / 3_600_000).toFixed(1)} h`;
  return `${(ms / 86_400_000).toFixed(1)} d`;
}

/** USD; sub-dollar amounts keep 4 decimals (per-request costs are fractions of a cent). */
export function formatUsd(usd: number | null, estimate = false): string {
  if (usd === null) return "unknown";
  const text = usd === 0 ? "$0" : usd < 1 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
  return estimate && usd !== 0 ? `~${text}` : text;
}

export function share(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : DASH;
}

export function formatStats(s: DurationStats): string {
  if (s.samples === 0) return "no samples";
  return `p50 ${formatMs(s.p50Ms)} · p95 ${formatMs(s.p95Ms)} · max ${formatMs(s.maxMs)} (n=${s.samples})`;
}

export function formatCount(n: number | null): string {
  return n === null ? DASH : n.toLocaleString("en-US");
}
