import type { HuntTarget, Money } from '@rein-drop/ai-core';
import type { ScoringPolicy } from './policy.js';

/**
 * Hard deal economics - deterministic arithmetic on known numbers only (integer minor units, one
 * currency). The AI never computes or changes these; it may only explain them.
 *
 * ESTIMATED vs REALIZED: everything here is about a listing nobody has bought yet. The only
 * forward-looking amount is `estimatedUpside`, always marked `basis: 'estimate'` and only present
 * when real comparable sales were supplied. Realized profit / loss exists only for an actual
 * purchase + sale recorded by the user (Outcomes: InventoryItem, Sale, Cost) and is never
 * computed here. A deal that wasn't bought is "missed potential", never a loss.
 */

export const ECONOMICS_VERSION = 1;

/** Signed amount (an upside can be negative). Integer minor units. */
export interface Amount {
  amountMinor: number;
  currency: string;
}

/** A cost of buying the listing that the listing itself states (e.g. its shipping charge). */
export interface KnownCost {
  kind: 'shipping';
  label: string;
  amount: Money;
}

/** Costs that are real but not known yet, so they are never silently treated as zero. */
export const COSTS_NOT_INCLUDED = ['selling_fees', 'payment_fees', 'shipping_to_your_buyer', 'repairs_and_prep'] as const;
export type CostNotIncluded = (typeof COSTS_NOT_INCLUDED)[number];

/**
 * Summary of recent comparable SOLD prices for the same product, from a real pricing source.
 * TODO(data): no comparables source exists yet (Blueprint section 22), so callers pass null.
 */
export interface ComparableSales {
  /** Which source produced it, e.g. a provider id. */
  source: string;
  sampleSize: number;
  low: Money;
  typical: Money;
  high: Money;
  /** When the sales were collected (ISO). */
  asOf: string;
}

export interface EconomicsInput {
  /** Asking price; null when the listing shows none. */
  asking: Money | null;
  knownCosts: KnownCost[];
  maxPrice: Money | null;
  target: HuntTarget | null;
  comparables: ComparableSales | null;
}

export type MaxPriceCheck =
  | { status: 'unverified'; limit: Money; reason: 'no_price' | 'other_currency' }
  | {
      /** The asking price against the limit (the same rule the hunt matcher applies). */
      status: 'within' | 'above';
      limit: Money;
      /** Asking price + known costs against the limit. */
      withKnownCosts: 'within' | 'above';
      /** Limit minus (asking + known costs); negative when over. */
      headroom: Amount;
    };

export type ResaleEstimate =
  | {
      status: 'estimated';
      basis: 'comparable_sales';
      low: Money;
      typical: Money;
      high: Money;
      sampleSize: number;
      source: string;
      asOf: string;
    }
  | { status: 'unavailable'; reason: 'no_source' | 'too_few_sales' | 'other_currency' | 'inconsistent'; detail: string };

export type EstimatedUpside =
  | {
      status: 'estimated';
      /** Never realized profit - see the file comment. */
      basis: 'estimate';
      /** Resale estimate minus (asking + known costs), at the low / typical / high resale estimate. */
      low: Amount;
      typical: Amount;
      high: Amount;
      /** Typical upside as a whole percent of the typical resale price. */
      typicalMarginPercent: number | null;
      /** Costs the estimate does NOT subtract yet. */
      excludes: CostNotIncluded[];
    }
  | { status: 'unavailable'; reason: 'no_resale_estimate' | 'no_price'; detail: string };

export type TargetCheck =
  | { status: 'unverified'; target: HuntTarget; detail: string }
  | {
      status: 'met' | 'not_met';
      target: HuntTarget;
      /** Whether even the low end of the estimate meets the target. */
      metAtLowEnd: boolean;
      detail: string;
    };

export interface DealEconomics {
  version: number;
  asking: Money | null;
  /** Known costs in the asking price's currency (others are listed in `ignoredCosts`). */
  knownCosts: KnownCost[];
  ignoredCosts: { cost: KnownCost; reason: 'other_currency' | 'no_price' }[];
  /** Asking price + known costs: what buying it is known to cost so far. */
  knownTotalCost: Money | null;
  /** Always listed until Rein Drop can price them. */
  notIncluded: CostNotIncluded[];
  maxPrice: MaxPriceCheck | null;
  resale: ResaleEstimate;
  estimatedUpside: EstimatedUpside;
  /** Null when the hunt has no profit / margin target. */
  target: TargetCheck | null;
}

const money = (amountMinor: number, currency: string) => ({ amountMinor, currency });

export function computeEconomics(input: EconomicsInput, policy: Pick<ScoringPolicy, 'minComparableSales'>): DealEconomics {
  const { asking } = input;
  const knownCosts: KnownCost[] = [];
  const ignoredCosts: DealEconomics['ignoredCosts'] = [];
  for (const cost of input.knownCosts) {
    if (!asking) ignoredCosts.push({ cost, reason: 'no_price' });
    else if (cost.amount.currency !== asking.currency) ignoredCosts.push({ cost, reason: 'other_currency' });
    else knownCosts.push(cost);
  }
  const knownTotalCost = asking ? money(asking.amountMinor + knownCosts.reduce((sum, c) => sum + c.amount.amountMinor, 0), asking.currency) : null;

  const resale = resaleEstimate(input.comparables, asking, policy.minComparableSales);
  const estimatedUpside = upside(resale, knownTotalCost);
  return {
    version: ECONOMICS_VERSION,
    asking,
    knownCosts,
    ignoredCosts,
    knownTotalCost,
    notIncluded: [...COSTS_NOT_INCLUDED],
    maxPrice: input.maxPrice ? maxPriceCheck(input.maxPrice, asking, knownTotalCost) : null,
    resale,
    estimatedUpside,
    target: input.target ? targetCheck(input.target, estimatedUpside, resale) : null,
  };
}

function maxPriceCheck(limit: Money, asking: Money | null, total: Money | null): MaxPriceCheck {
  if (!asking || !total) return { status: 'unverified', limit, reason: 'no_price' };
  if (asking.currency !== limit.currency) return { status: 'unverified', limit, reason: 'other_currency' };
  return {
    status: asking.amountMinor <= limit.amountMinor ? 'within' : 'above',
    limit,
    withKnownCosts: total.amountMinor <= limit.amountMinor ? 'within' : 'above',
    headroom: money(limit.amountMinor - total.amountMinor, limit.currency),
  };
}

function resaleEstimate(comparables: ComparableSales | null, asking: Money | null, minSales: number): ResaleEstimate {
  if (!comparables) {
    return { status: 'unavailable', reason: 'no_source', detail: 'No resale price source is connected yet' };
  }
  const { low, typical, high } = comparables;
  if (comparables.sampleSize < minSales) {
    return { status: 'unavailable', reason: 'too_few_sales', detail: `Only ${comparables.sampleSize} comparable sales (need ${minSales})` };
  }
  const currencies = new Set([low.currency, typical.currency, high.currency, ...(asking ? [asking.currency] : [])]);
  if (currencies.size > 1) {
    return { status: 'unavailable', reason: 'other_currency', detail: 'Comparable sales are in a different currency' };
  }
  if (!(low.amountMinor <= typical.amountMinor && typical.amountMinor <= high.amountMinor)) {
    return { status: 'unavailable', reason: 'inconsistent', detail: 'Comparable sales range is inconsistent' };
  }
  return { status: 'estimated', basis: 'comparable_sales', low, typical, high, sampleSize: comparables.sampleSize, source: comparables.source, asOf: comparables.asOf };
}

function upside(resale: ResaleEstimate, total: Money | null): EstimatedUpside {
  if (!total) return { status: 'unavailable', reason: 'no_price', detail: 'No asking price to compare with' };
  if (resale.status !== 'estimated') return { status: 'unavailable', reason: 'no_resale_estimate', detail: resale.detail };
  const minus = (m: Money) => money(m.amountMinor - total.amountMinor, total.currency);
  const typical = minus(resale.typical);
  return {
    status: 'estimated',
    basis: 'estimate',
    low: minus(resale.low),
    typical,
    high: minus(resale.high),
    typicalMarginPercent: marginPercent(typical, resale.typical),
    excludes: [...COSTS_NOT_INCLUDED],
  };
}

/**
 * Margin = estimated upside as a percent of the estimated resale price.
 * TODO(product): confirm this definition (vs. return on cost) when the deal UI shows margins.
 */
function targetCheck(target: HuntTarget, up: EstimatedUpside, resale: ResaleEstimate): TargetCheck {
  if (up.status !== 'estimated') {
    return { status: 'unverified', target, detail: "Can't check your target without a resale estimate" };
  }
  if (target.kind === 'profit') {
    if (target.amount.currency !== up.typical.currency) {
      return { status: 'unverified', target, detail: `Your target is in ${target.amount.currency}, the estimate in ${up.typical.currency}` };
    }
    const met = up.typical.amountMinor >= target.amount.amountMinor;
    return {
      status: met ? 'met' : 'not_met',
      target,
      metAtLowEnd: up.low.amountMinor >= target.amount.amountMinor,
      detail: met ? 'Estimated upside meets your profit target' : 'Estimated upside is below your profit target',
    };
  }
  if (up.typicalMarginPercent === null || resale.status !== 'estimated') {
    return { status: 'unverified', target, detail: 'No margin can be estimated' };
  }
  const met = up.typicalMarginPercent >= target.percent;
  const lowMargin = marginPercent(up.low, resale.low);
  return {
    status: met ? 'met' : 'not_met',
    target,
    metAtLowEnd: lowMargin !== null && lowMargin >= target.percent,
    detail: met ? 'Estimated margin meets your target' : 'Estimated margin is below your target',
  };
}

/** Whole percent, rounded down (never flatters a deal). Null when the resale price is zero. */
function marginPercent(upsideAmount: Amount, resalePrice: Money): number | null {
  return resalePrice.amountMinor > 0 ? Math.floor((100 * upsideAmount.amountMinor) / resalePrice.amountMinor) : null;
}
