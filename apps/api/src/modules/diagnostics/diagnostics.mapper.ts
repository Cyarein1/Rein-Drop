import { HUNT_COST_ITEMS, type DurationStats, type HuntCost, type IngestionDiagnostics, type SourceDiagnostics } from '@rein-drop/contracts';
import type { AgeRow, AlertRow, AnalysisRow, DiagnosticsWindow, GroupRow, HuntCostRow, RejectionRow, RunRow, StatsRow } from './diagnostics.sql.js';

/** Shapes the diagnostics SQL rows into the contract. Pure: no database, no clock. */

export interface DiagnosticsRows {
  runs: RunRow[];
  rejections: RejectionRow[];
  analyses: AnalysisRow[];
  alerts: AlertRow[];
  ages: AgeRow[];
  hunts: HuntCostRow[];
}

const TOTAL = 'all';
const DAY_MS = 86_400_000;

/** Postgres bigint / numeric come back as bigint / string. */
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const nullableNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
/** USD amounts: 6 decimals (sub-cent costs per request are normal). */
export const usd = (v: number) => Math.round(v * 1e6) / 1e6;
/** Known cost / denominator; null when the cost is unknown or there is nothing to divide by. */
export const costPer = (cost: number | null, denominator: number): number | null => (cost === null || denominator <= 0 ? null : usd(cost / denominator));

const keyOf = (row: GroupRow) => (row.total === 1 ? `${TOTAL}|${TOTAL}` : `${row.marketplace}|${row.provider}`);

function durationStats<P extends string>(row: (StatsRow<P> & object) | undefined, prefix: P): DurationStats {
  const r = row as Record<string, unknown> | undefined;
  const ms = (k: string) => {
    const v = nullableNum(r?.[`${prefix}${k}`]);
    return v === null ? null : Math.round(v);
  };
  return { samples: num(r?.[`${prefix}Samples`]), p50Ms: ms('P50'), p95Ms: ms('P95'), maxMs: ms('Max') };
}

function indexBy<T extends GroupRow>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [keyOf(r), r]));
}

function sourceRow(
  marketplace: string,
  provider: string,
  parts: { run?: RunRow; analysis?: AnalysisRow; alert?: AlertRow; age?: AgeRow; rejections: RejectionRow[]; huntsServed: number },
  windowDays: number,
): SourceDiagnostics {
  const { run, analysis, alert, age } = parts;
  const runs = num(run?.runs);
  const providerUsd = run && run.costUsd !== null ? usd(num(run.costUsd)) : null;
  const newMatches = num(run?.newMatches);
  const alerts = num(alert?.alerts);
  const matched = num(run?.matched);
  const rejected = num(run?.rejected);
  return {
    marketplace,
    provider,
    runs: { total: runs, succeeded: num(run?.succeeded), failed: num(run?.failed), running: num(run?.running) },
    requests: num(run?.requests),
    huntsServed: parts.huntsServed,
    listings: {
      returned: num(run?.returned),
      new: num(run?.new),
      updated: num(run?.updated),
      duplicates: num(run?.duplicates),
      unreadable: num(run?.unreadable),
    },
    candidates: {
      evaluated: matched + rejected,
      matched,
      newMatches,
      rejected,
      rejectionReasons: parts.rejections
        .map((r) => ({ reason: r.reason, count: num(r.count) }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    },
    analysis: {
      analyzed: num(analysis?.analyzed),
      completed: num(analysis?.completed),
      failed: num(analysis?.failed),
      alertEligible: num(analysis?.alertEligible),
      aiProviders: [...(analysis?.aiProviders ?? [])].filter((p): p is string => typeof p === 'string').sort(),
      inputTokens: nullableNum(analysis?.inputTokens),
      outputTokens: nullableNum(analysis?.outputTokens),
      duration: durationStats(analysis, 'ai'),
    },
    alerts,
    latency: { request: durationStats(run, 'req'), run: durationStats(run, 'run') },
    listingAge: { discovered: num(age?.discovered), withPostedTime: num(age?.ageSamples), age: durationStats(age, 'age') },
    cost: {
      providerUsd,
      providerIsEstimate: run?.costIsEstimate === true,
      runsWithKnownCost: num(run?.costKnownRuns),
      runsWithUnknownCost: runs - num(run?.costKnownRuns),
      // Only what the AI provider reported (Foundry with FOUNDRY_PRICE_* set); the mock reports none.
      aiUsd: analysis?.aiCostUsd === null || analysis?.aiCostUsd === undefined ? null : usd(num(analysis.aiCostUsd)),
      perRunUsd: costPer(providerUsd, runs),
      perNewMatchUsd: costPer(providerUsd, newMatches),
      perAlertUsd: costPer(providerUsd, alerts),
      perHuntDayUsd: costPer(providerUsd, parts.huntsServed * windowDays),
    },
  };
}

export function toIngestionDiagnostics(rows: DiagnosticsRows, w: DiagnosticsWindow, generatedAt: Date): IngestionDiagnostics {
  const windowMs = w.until.getTime() - w.since.getTime();
  const windowDays = windowMs / DAY_MS;
  const runs = indexBy(rows.runs);
  const analyses = indexBy(rows.analyses);
  const alerts = indexBy(rows.alerts);
  const ages = indexBy(rows.ages);
  const rejections = new Map<string, RejectionRow[]>();
  for (const r of rows.rejections) rejections.set(keyOf(r), [...(rejections.get(keyOf(r)) ?? []), r]);

  const huntsPerSource = new Map<string, Set<string>>();
  const allHunts = new Set<string>();
  for (const h of rows.hunts) {
    const key = `${h.marketplace}|${h.provider}`;
    huntsPerSource.set(key, (huntsPerSource.get(key) ?? new Set()).add(h.huntId));
    allHunts.add(h.huntId);
  }

  // Every source with any activity in the window, even without searches (e.g. analyses only).
  const keys = new Set<string>();
  for (const map of [runs, analyses, alerts, ages]) for (const k of map.keys()) if (k !== `${TOTAL}|${TOTAL}`) keys.add(k);
  const parts = (key: string, huntsServed: number) => ({
    run: runs.get(key),
    analysis: analyses.get(key),
    alert: alerts.get(key),
    age: ages.get(key),
    rejections: rejections.get(key) ?? [],
    huntsServed,
  });

  const sources = [...keys]
    .map((key) => {
      const [marketplace = '', provider = ''] = key.split('|');
      return sourceRow(marketplace, provider, parts(key, huntsPerSource.get(key)?.size ?? 0), windowDays);
    })
    .sort((a, b) => a.marketplace.localeCompare(b.marketplace) || a.provider.localeCompare(b.provider));

  const hunts: HuntCost[] = rows.hunts
    .map((h) => {
      const costUsd = h.costUsd === null ? null : usd(num(h.costUsd));
      return {
        huntId: h.huntId,
        name: h.name ?? '(deleted Hunt)',
        status: h.status ?? 'DELETED',
        marketplace: h.marketplace,
        provider: h.provider,
        runs: num(h.runs),
        costUsd,
        perDayUsd: costPer(costUsd, windowDays),
      };
    })
    .sort((a, b) => (b.costUsd ?? -1) - (a.costUsd ?? -1) || b.runs - a.runs || a.huntId.localeCompare(b.huntId))
    .slice(0, HUNT_COST_ITEMS);

  return {
    window: { since: w.since.toISOString(), until: w.until.toISOString(), hours: Math.round((windowMs / 3_600_000) * 100) / 100 },
    sources,
    total: sourceRow(TOTAL, TOTAL, parts(`${TOTAL}|${TOTAL}`, allHunts.size), windowDays),
    hunts,
    generatedAt: generatedAt.toISOString(),
  };
}
