import Image from "next/image";
import Link from "next/link";
import type { AnalyticsPeriod, DealStatusFilter, MarketplaceKey } from "@rein-drop/api-client";
import { analyticsTargetPath, formatMoney, type AnalyticsRecommendation } from "@rein-drop/client-core";
import { mascotAssets } from "@/brand/assets";
import { withPeriod } from "@/components/charts";
import { ButtonLink } from "@/components/ui";
import styles from "./analytics.module.css";

export { PeriodTabs, readPeriod, withPeriod } from "@/components/charts";

/** Overview / Hunts / Missed potential, plus the way to the selling side (Sell > Insights). */
export function AnalyticsNav({ period, current }: { period: AnalyticsPeriod; current: "overview" | "hunts" | "missed" }) {
  const links = [
    ["overview", "/analytics", "Overview"],
    ["hunts", "/analytics/hunts", "Hunts"],
    ["missed", "/analytics/missed", "Missed potential"],
  ] as const;
  return (
    <nav aria-label="Analytics views" className={styles.subnav}>
      {links.map(([key, path, label]) => (
        <Link key={key} href={withPeriod(path, period)} className={styles.link} aria-current={current === key ? "page" : undefined}>
          {label}
        </Link>
      ))}
      <Link href={withPeriod("/sell/insights", period)} className={styles.link}>
        Selling insights
      </Link>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Drill-down URLs (the details live in Deals, Hunts and Sell - decision 0021)
// ---------------------------------------------------------------------------

/** The Deals list with its existing filters (?status, ?hunt, ?source). It has no date filter. */
export function dealsHref(f: { status?: DealStatusFilter; huntId?: string; marketplace?: MarketplaceKey }): string {
  const q = new URLSearchParams();
  if (f.status && f.status !== "open") q.set("status", f.status);
  if (f.huntId) q.set("hunt", f.huntId);
  if (f.marketplace) q.set("source", f.marketplace);
  const s = q.toString();
  return s ? `/deals?${s}` : "/deals";
}

/** A Sell-area section (Holding / Listings / Sold / Other). It has no product, Hunt or date filter. */
export const sellHref = (section: "holding" | "listed" | "sold" | "other") => `/sell?section=${section}`;
export const itemHref = (id: string) => `/sell/items/${id}`;
export const dealHref = (id: string) => `/deals/${id}`;
export const huntHref = (id: string) => `/hunts/${id}`;

/** Money formatter in the user's locale for one chart currency (minor units in). */
export function moneyIn(currency: string, localeTag: string) {
  return (amountMinor: number) => formatMoney({ amountMinor, currency }, localeTag);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const toneOfAmount = (n: number) => (n > 0 ? "profit" : n < 0 ? "loss" : "neutral") as "profit" | "loss" | "neutral";

/**
 * The one recommendation. The thinking / idea mascot may appear only here (Mascot Usage Guide) -
 * and only approved art (the `suggestion` token).
 */
export function RecommendationBox({ recommendation, period }: { recommendation: AnalyticsRecommendation; period: AnalyticsPeriod }) {
  const art = mascotAssets.suggestion;
  // Inventory and product insights moved into Sell (decision 0021); the shared path still names the old screens.
  const { target } = recommendation;
  const href =
    target.kind === "inventory" ? sellHref("holding") : target.kind === "products" ? withPeriod("/sell/insights", period) : analyticsTargetPath(target, period);
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
          <ButtonLink href={href} variant="secondary">
            {recommendation.actionLabel}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
