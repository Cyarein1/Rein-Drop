import Image from "next/image";
import Link from "next/link";
import type { AnalyticsPeriod } from "@rein-drop/api-client";
import {
  ANALYTICS_PERIOD_OPTIONS,
  analyticsTargetPath,
  isAnalyticsPeriod,
  type AnalyticsRecommendation,
  type Bar,
  type MetricCard,
} from "@rein-drop/client-core";
import { mascotAssets } from "@/brand/assets";
import { ButtonLink } from "@/components/ui";
import styles from "./analytics.module.css";

/** ?period= from the URL; unknown values fall back to the default. */
export function readPeriod(params: Record<string, string | string[] | undefined>): AnalyticsPeriod {
  return isAnalyticsPeriod(params.period) ? params.period : "30d";
}

export const withPeriod = (path: string, period: AnalyticsPeriod) => (period === "30d" ? path : `${path}?period=${period}`);

export function PeriodTabs({ path, period }: { path: string; period: AnalyticsPeriod }) {
  return (
    <nav aria-label="Period" className={styles.tabs}>
      {ANALYTICS_PERIOD_OPTIONS.map((o) => (
        <Link key={o.value} href={withPeriod(path, o.value)} className={styles.tab} aria-current={period === o.value ? "page" : undefined}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** Overview / Hunts / Products / Missed potential. */
export function AnalyticsNav({ period, current }: { period: AnalyticsPeriod; current: "overview" | "hunts" | "products" | "missed" }) {
  const links = [
    ["overview", "/analytics", "Overview"],
    ["hunts", "/analytics/hunts", "Hunts"],
    ["products", "/analytics/products", "Products"],
    ["missed", "/analytics/missed", "Missed potential"],
  ] as const;
  return (
    <nav aria-label="Analytics views" className={styles.subnav}>
      {links.map(([key, path, label]) => (
        <Link key={key} href={withPeriod(path, period)} className={styles.link} aria-current={current === key ? "page" : undefined}>
          {label}
        </Link>
      ))}
      <Link href="/inventory" className={styles.link}>
        Inventory
      </Link>
    </nav>
  );
}

/** A labelled number. The basis (Realized / Estimated / Now / Activity) is always visible. */
export function MetricTile({ card }: { card: MetricCard }) {
  return (
    <div className={styles.card}>
      <p className={styles.cardLabel}>
        {card.label}
        <span className={[styles.basis, card.basis === "Estimated" ? styles.basisEstimated : ""].join(" ")}>{card.basis}</span>
      </p>
      <p className={[styles.cardValue, card.tone === "neutral" ? "" : styles[card.tone]].join(" ")}>{card.value}</p>
      {card.caption && <p className={styles.small}>{card.caption}</p>}
    </div>
  );
}

/** Horizontal bars. The text (label + value) carries the meaning; the bar is decoration. */
export function Bars({ bars, label }: { bars: Bar[]; label: string }) {
  return (
    <ul className={styles.bars} aria-label={label}>
      {bars.map((b) => (
        <li key={b.label} className={styles.barRow}>
          <span className={styles.barLabel} title={b.label}>
            {b.label}
          </span>
          <span className={styles.barTrack} aria-hidden="true">
            <span className={[styles.bar, styles[`bar_${b.tone}`]].join(" ")} style={{ width: `${b.widthPercent}%`, display: "block" }} />
          </span>
          <span className={styles.barValue}>{b.value}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The one recommendation. The thinking / idea mascot may appear only here (Mascot Usage Guide) -
 * and only approved art, which doesn't exist yet, so nothing renders in its place.
 */
export function RecommendationBox({ recommendation, period }: { recommendation: AnalyticsRecommendation; period: AnalyticsPeriod }) {
  const art = mascotAssets.suggestion;
  return (
    <section aria-labelledby="recommendation" className={styles.recommendation}>
      {art && <Image src={art} alt="" width={64} height={Math.round((art.height / art.width) * 64)} />}
      <div className={styles.recommendationBody}>
        <p className={styles.small}>Based on your numbers</p>
        <h2 id="recommendation" className={styles.heading}>
          {recommendation.title}
        </h2>
        <p>{recommendation.body}</p>
        <div>
          <ButtonLink href={analyticsTargetPath(recommendation.target, period)} variant="secondary">
            {recommendation.actionLabel}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
