import { z } from 'zod';
import { idSchema, isoDateTimeSchema, marketplaceKeySchema, moneySchema } from './common.js';

/**
 * Period analytics, computed live from PostgreSQL aggregates (no warehouse).
 *
 * Rules (decision 0008):
 * - Money is grouped per currency and never converted.
 * - Realized profit / margin come only from recorded sales (same formula as `realizedResult`);
 *   a sale whose purchase / costs are in another currency is counted but left out of profit.
 * - Held inventory is a point-in-time snapshot (now), never a loss.
 * - Missed potential is a separate endpoint and is never part of profit or loss.
 * - Item lifecycle (decision 0021): CANCELLED items (bought by mistake) are left out of every
 *   figure. RETURNED / WRITTEN_OFF items count as bought (and spent) and, by the date they were
 *   closed, have a realized result without a sale: refund - cost basis / - cost basis (`closed`).
 *   `realized` stays the result of SALES; `netRealized` adds the closed results to it.
 * - Period = rolling window ending now. Counts are by each event's own date ("activity in the
 *   period"), not by the cohort of deals found in the period.
 */

export const ANALYTICS_PERIODS = ['7d', '30d', '90d', '365d', 'all'] as const;
export const analyticsPeriodSchema = z.enum(ANALYTICS_PERIODS);
export type AnalyticsPeriod = z.infer<typeof analyticsPeriodSchema>;
/** Days in each rolling window; null = all time. */
export const ANALYTICS_PERIOD_DAYS: Record<AnalyticsPeriod, number | null> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365, all: null };

export const analyticsQuerySchema = z.object({ period: analyticsPeriodSchema.default('30d') });
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsQueryInput = z.input<typeof analyticsQuerySchema>;

export const analyticsPeriodInfoSchema = z.object({
  key: analyticsPeriodSchema,
  /** Start of the window; null for all time. */
  since: isoDateTimeSchema.nullable(),
  until: isoDateTimeSchema,
});
export type AnalyticsPeriodInfo = z.infer<typeof analyticsPeriodInfoSchema>;

/** Realized results of sales, in one currency. */
export const realizedByCurrencySchema = z.object({
  currency: z.string(),
  /** Sale prices of every sale in this currency. */
  revenue: moneySchema,
  /** Sales whose profit could be calculated (purchase + every cost in this currency). */
  comparableSales: z.number().int().nonnegative(),
  /** Sales left out of profit because something was in another currency. */
  excludedSales: z.number().int().nonnegative(),
  /** Sale price - selling costs - purchase price - purchase costs, comparable sales only. */
  realizedProfit: moneySchema,
  /** Realized profit / revenue of the comparable sales, whole percent toward zero. */
  marginPercent: z.number().int().nullable(),
});
export type RealizedByCurrency = z.infer<typeof realizedByCurrencySchema>;

/** Items returned or written off in the period, in one currency (their realized result without a sale). */
export const closedByCurrencySchema = z.object({
  currency: z.string(),
  returned: z.number().int().nonnegative(),
  writtenOff: z.number().int().nonnegative(),
  /** Purchase price + purchase costs of the comparable ones. */
  costBasis: moneySchema,
  /** Refunds received (returns); write-offs recover nothing. */
  recovered: moneySchema,
  /** recovered - costBasis: a realized loss when negative. */
  realizedResult: moneySchema,
  /** Left out of the amounts because a purchase cost was in another currency. */
  excluded: z.number().int().nonnegative(),
});
export type ClosedByCurrency = z.infer<typeof closedByCurrencySchema>;

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export const analyticsOverviewSchema = z.object({
  period: analyticsPeriodInfoSchema,
  /** Items bought in the period (cancelled purchases left out). */
  buys: z.number().int().nonnegative(),
  /** Items sold in the period. */
  sells: z.number().int().nonnegative(),
  /** Capital deployed: purchase price + purchase costs of items bought in the period, per currency. */
  spent: z.array(moneySchema),
  /** Selling costs (fees, shipping to buyers) of sales in the period, per currency. */
  sellingCosts: z.array(moneySchema),
  /** Realized results of SALES in the period. */
  realized: z.array(realizedByCurrencySchema),
  /** Returns and write-offs in the period (by the date they were closed), per currency. */
  closed: z.array(closedByCurrencySchema),
  /** Realized profit of sales + realized results of returns / write-offs, per currency. Realized only - never estimates. */
  netRealized: z.array(moneySchema),
  /** Average days from purchase to sale, sales in the period; null without sales. */
  avgDaysToSell: z.number().nullable(),
  /** Right now (not period-based): items bought and not sold yet. Never counted as a loss. */
  holding: z.object({
    count: z.number().int().nonnegative(),
    /** Purchase price + purchase costs tied up in them, per currency. */
    costBasis: z.array(moneySchema),
    /** Days the longest-held item has been held; null when nothing is held. */
    oldestDays: z.number().int().nullable(),
  }),
  generatedAt: isoDateTimeSchema,
});
export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>;

// ---------------------------------------------------------------------------
// Hunt funnel
// ---------------------------------------------------------------------------

export const huntFunnelSchema = z.object({
  huntId: idSchema,
  name: z.string(),
  status: z.string(),
  /** Deals the Hunt found (matches) in the period. */
  found: z.number().int().nonnegative(),
  alerted: z.number().int().nonnegative(),
  /** Deals opened for the first time in the period. */
  viewed: z.number().int().nonnegative(),
  saved: z.number().int().nonnegative(),
  ignored: z.number().int().nonnegative(),
  bought: z.number().int().nonnegative(),
  sold: z.number().int().nonnegative(),
  realized: z.array(realizedByCurrencySchema),
  /** ignored / viewed, whole percent; null when nothing was viewed. */
  ignoreRatePercent: z.number().int().nullable(),
  /** bought / alerted, whole percent; null without alerts. */
  alertToBuyPercent: z.number().int().nullable(),
});
export type HuntFunnel = z.infer<typeof huntFunnelSchema>;
export const huntAnalyticsSchema = z.object({ period: analyticsPeriodInfoSchema, items: z.array(huntFunnelSchema), generatedAt: isoDateTimeSchema });
export type HuntAnalytics = z.infer<typeof huntAnalyticsSchema>;

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const productPerformanceSchema = z.object({
  /** Grouping key (lower-cased product name). */
  key: z.string(),
  /** The AI-normalized product name when known, otherwise the item title. */
  name: z.string(),
  bought: z.number().int().nonnegative(),
  sold: z.number().int().nonnegative(),
  /** Right now, not period-based. */
  holding: z.number().int().nonnegative(),
  /** Capital deployed on this product in the period, per currency. */
  spent: z.array(moneySchema),
  realized: z.array(realizedByCurrencySchema),
  avgDaysToSell: z.number().nullable(),
  /** Returned / written off in the period. */
  returned: z.number().int().nonnegative(),
  writtenOff: z.number().int().nonnegative(),
  /** Realized result of those returns / write-offs, per currency (usually a loss). */
  closedResult: z.array(moneySchema),
});
export type ProductPerformance = z.infer<typeof productPerformanceSchema>;
export const productAnalyticsSchema = z.object({
  period: analyticsPeriodInfoSchema,
  /** Best realized profit first; products with a realized loss last (loss review). */
  items: z.array(productPerformanceSchema),
  generatedAt: isoDateTimeSchema,
});
export type ProductAnalytics = z.infer<typeof productAnalyticsSchema>;

// ---------------------------------------------------------------------------
// Marketplaces
// ---------------------------------------------------------------------------

export const marketplaceContributionSchema = z.object({
  /** "other" = bought or sold outside the known marketplaces (or not through a Hunt). */
  marketplace: z.union([marketplaceKeySchema, z.literal('other')]),
  /** What this marketplace sourced: deals found, alerts, purchases, and how they sold. */
  sourced: z.object({
    found: z.number().int().nonnegative(),
    alerted: z.number().int().nonnegative(),
    bought: z.number().int().nonnegative(),
    sold: z.number().int().nonnegative(),
    realized: z.array(realizedByCurrencySchema),
  }),
  /** What sold on this marketplace (wherever it was bought). */
  soldHere: z.object({ sales: z.number().int().nonnegative(), revenue: z.array(moneySchema) }),
});
export type MarketplaceContribution = z.infer<typeof marketplaceContributionSchema>;
export const marketplaceAnalyticsSchema = z.object({ period: analyticsPeriodInfoSchema, items: z.array(marketplaceContributionSchema), generatedAt: isoDateTimeSchema });
export type MarketplaceAnalytics = z.infer<typeof marketplaceAnalyticsSchema>;

// ---------------------------------------------------------------------------
// Missed potential - never profit or loss
// ---------------------------------------------------------------------------

export const MISSED_REASONS = ['gone', 'ignored'] as const;
export const missedDealSchema = z.object({
  dealId: idSchema,
  title: z.string(),
  hunt: z.object({ id: idSchema, name: z.string() }),
  marketplace: marketplaceKeySchema,
  /** gone = sold / removed / expired before you bought it; ignored = you passed on it. */
  reason: z.enum(MISSED_REASONS),
  strength: z.string(),
  /** ESTIMATED upside at the time - only when comparable sales supported one. */
  estimatedUpside: moneySchema.nullable(),
  foundAt: isoDateTimeSchema,
});
export type MissedDeal = z.infer<typeof missedDealSchema>;
export const missedPotentialSchema = z.object({
  period: analyticsPeriodInfoSchema,
  /** Strong / exceptional deals found in the period that were never bought and are no longer open. */
  count: z.number().int().nonnegative(),
  gone: z.number().int().nonnegative(),
  ignored: z.number().int().nonnegative(),
  /** How many of them had an estimate (the rest can't be valued). */
  withEstimate: z.number().int().nonnegative(),
  /** Sum of ESTIMATED upside per currency. Potential, not a loss: never part of realized results. */
  estimatedPotential: z.array(moneySchema),
  /** Most valuable first (estimate), then newest; at most 20. */
  items: z.array(missedDealSchema),
  generatedAt: isoDateTimeSchema,
});
export type MissedPotential = z.infer<typeof missedPotentialSchema>;
