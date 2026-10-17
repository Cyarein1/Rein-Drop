import Link from "next/link";
import type { AnalyticsPeriod } from "@rein-drop/api-client";
import { ANALYTICS_PERIOD_OPTIONS, isAnalyticsPeriod } from "@rein-drop/client-core";
import styles from "./charts.module.css";

/** ?period= from the URL; unknown values fall back to the default. */
export function readPeriod(params: Record<string, string | string[] | undefined>): AnalyticsPeriod {
  return isAnalyticsPeriod(params.period) ? params.period : "30d";
}

/** `path` with the period (the default 30 days is left out of the URL). */
export const withPeriod = (path: string, period: AnalyticsPeriod) => (period === "30d" ? path : `${path}?period=${period}`);

/** The period selector shared by Analytics and Sell > Insights. One row, above everything it scopes. */
export function PeriodTabs({ path, period }: { path: string; period: AnalyticsPeriod }) {
  return (
    <nav aria-label="Period" className={styles.periodTabs}>
      {ANALYTICS_PERIOD_OPTIONS.map((o) => (
        <Link key={o.value} href={withPeriod(path, o.value)} className={styles.periodTab} aria-current={period === o.value ? "page" : undefined}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
