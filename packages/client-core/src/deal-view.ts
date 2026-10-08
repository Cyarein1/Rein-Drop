import type {
  DealConfidence,
  DealDetail,
  DealEstimate,
  DealFreshness,
  DealSourceStatus,
  DealStatus,
  DealStatusFilter,
  DealStrength,
  DealSummary,
  IgnoreDealRequest,
  MarkDealBoughtRequest,
  MarketplaceKey,
  Money,
} from '@rein-drop/contracts';
import type { HuntFormContext } from './hunt-form.js';
import { formatMoney, moneyToInput, parseMoneyInput } from './money.js';

/**
 * Deal feed + Deal Detail view model, shared by web and mobile: every label, tone and formatted
 * value comes from here, so both apps say the same thing. Estimates are always labelled as
 * estimates; nothing here ever presents an estimate as profit.
 */

/** Same names as the design-token tones (client-core doesn't depend on design-tokens). */
export type DealTone = 'neutral' | 'info' | 'action' | 'fresh' | 'profit' | 'loss';
export interface Labelled {
  label: string;
  tone: DealTone;
}

export const MARKETPLACE_LABEL: Record<MarketplaceKey, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };

export const DEAL_STATUS_LABEL: Record<DealStatus, Labelled> = {
  new: { label: 'New', tone: 'fresh' },
  seen: { label: 'Seen', tone: 'neutral' },
  saved: { label: 'Saved', tone: 'info' },
  ignored: { label: 'Ignored', tone: 'neutral' },
  bought: { label: 'Bought', tone: 'action' },
  unavailable: { label: 'No longer available', tone: 'loss' },
};

/** Feed tabs, in display order. */
export const DEAL_FILTERS: readonly { value: DealStatusFilter; label: string }[] = [
  { value: 'open', label: 'To review' },
  { value: 'saved', label: 'Saved' },
  { value: 'bought', label: 'Bought' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'all', label: 'All' },
];

export const STRENGTH_LABEL: Record<DealStrength, Labelled> = {
  exceptional: { label: 'Exceptional', tone: 'fresh' },
  strong: { label: 'Strong', tone: 'action' },
  moderate: { label: 'Worth a look', tone: 'info' },
  weak: { label: 'Weak', tone: 'neutral' },
};

export const CONFIDENCE_LABEL: Record<DealConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

const COST_LABEL: Record<string, string> = {
  selling_fees: 'selling fees',
  payment_fees: 'payment fees',
  shipping_to_your_buyer: 'shipping to your buyer',
  repairs_and_prep: 'repairs and prep',
};

const UNESTIMATED: Record<string, string> = {
  no_source: 'No resale price data yet',
  no_resale_estimate: 'No resale price data yet',
  too_few_sales: 'Not enough comparable sales',
  other_currency: 'Comparable sales are in another currency',
  inconsistent: 'Comparable sales disagree',
  no_price: 'No asking price to compare',
  not_analyzed: 'Being analysed',
};

const LISTING_GONE: Record<string, string> = { SOLD: 'Sold', ENDED: 'Listing ended', REMOVED: 'Listing removed' };

// ---------------------------------------------------------------------------
// Small formatters
// ---------------------------------------------------------------------------

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function ageText(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** Posted within the last hour: the "Just dropped" freshness badge. */
export const JUST_DROPPED_MINUTES = 60;

export function freshnessText(f: DealFreshness): string {
  return `${f.basis === 'posted' ? 'Posted' : 'Found'} ${ageText(f.ageMinutes)}`;
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** e.g. "Sold on eBay", "Couldn't check Facebook Marketplace on the last try", or null when all is well. */
export function sourceNote(source: DealSourceStatus): { text: string; tone: DealTone } | null {
  const name = MARKETPLACE_LABEL[source.marketplace];
  if (!source.available) return { text: `${LISTING_GONE[source.listingStatus] ?? 'No longer listed'} on ${name}`, tone: 'loss' };
  // The source's own state affects every deal from it: say so calmly, before this Hunt's last check.
  if (source.sourceHealth.status === 'down') return { text: `${name} isn't responding right now - this listing may have changed`, tone: 'fresh' };
  if (source.sourceHealth.status === 'degraded') return { text: `${name} is slow right now - updates may be late`, tone: 'fresh' };
  if (source.lastCheck === 'failed') return { text: `Couldn't check ${name} on the last try`, tone: 'fresh' };
  return null;
}

export interface UpsideView {
  /** Formatted typical upside, or "Not estimated". */
  value: string;
  /** True only for a real estimate - render the "Estimated" label. */
  estimated: boolean;
  /** Range and what's excluded, or why there's no estimate. */
  caption: string;
}

export function upsideView(estimate: DealEstimate, ctx: HuntFormContext): UpsideView {
  const { upside } = estimate;
  if (upside.status !== 'estimated') {
    return { value: 'Not estimated', estimated: false, caption: UNESTIMATED[upside.reason] ?? upside.detail };
  }
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const excludes = upside.excludes.map((c) => COST_LABEL[c] ?? c.replaceAll('_', ' '));
  return {
    value: fmt(upside.typical),
    estimated: true,
    caption: [`Range ${fmt(upside.low)} to ${fmt(upside.high)}`, excludes.length > 0 ? `before ${joinList(excludes)}` : '']
      .filter(Boolean)
      .join(', '),
  };
}

// ---------------------------------------------------------------------------
// Feed card
// ---------------------------------------------------------------------------

export interface DealCardView {
  id: string;
  title: string;
  huntName: string;
  source: string;
  freshness: string;
  justDropped: boolean;
  price: string;
  /** e.g. "+ R150 known costs" - null when none are known. */
  priceExtra: string | null;
  upside: UpsideView;
  status: Labelled;
  strength: Labelled | null;
  confidence: string | null;
  /** Pending / failed analysis, in words. */
  analysisNote: string | null;
  reason: string | null;
  sourceNote: { text: string; tone: DealTone } | null;
  exceptional: boolean;
  /** One sentence for screen readers / accessible names. */
  accessibleSummary: string;
}

export function dealCardView(deal: DealSummary, ctx: HuntFormContext): DealCardView {
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const status = DEAL_STATUS_LABEL[deal.status];
  const strength = deal.assessment.strength ? STRENGTH_LABEL[deal.assessment.strength] : null;
  const confidence = deal.assessment.confidence ? CONFIDENCE_LABEL[deal.assessment.confidence] : null;
  const price = deal.price.asking ? fmt(deal.price.asking) : 'No price shown';
  const upside = upsideView(deal.estimate, ctx);
  const analysisNote =
    deal.assessment.status === 'pending' ? 'Rein Drop is still analysing this listing' : deal.assessment.status === 'failed' ? "Analysis didn't finish - Rein Drop will retry" : null;
  const view: Omit<DealCardView, 'accessibleSummary'> = {
    id: deal.id,
    title: deal.listing.title,
    huntName: deal.hunt.name,
    source: MARKETPLACE_LABEL[deal.listing.marketplace],
    freshness: freshnessText(deal.freshness),
    justDropped: deal.freshness.ageMinutes <= JUST_DROPPED_MINUTES && deal.source.available,
    price,
    priceExtra: deal.price.knownCosts ? `+ ${fmt(deal.price.knownCosts)} known costs` : null,
    upside,
    status,
    strength,
    confidence,
    analysisNote,
    reason: deal.reason,
    sourceNote: sourceNote(deal.source),
    exceptional: deal.assessment.strength === 'exceptional',
  };
  return {
    ...view,
    accessibleSummary: [
      view.title,
      `${view.source}, ${view.freshness}`,
      price,
      strength ? `${strength.label} deal` : analysisNote,
      confidence,
      upside.estimated ? `estimated upside ${upside.value}` : `upside not estimated`,
      status.label,
    ]
      .filter(Boolean)
      .join('. '),
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export const NEXT_STEP_LABEL: Record<NonNullable<DealDetail['why']>['nextStep'], Labelled> = {
  review: { label: 'Worth reviewing now', tone: 'action' },
  ask_seller: { label: 'Ask the seller first', tone: 'info' },
  skip: { label: 'Probably skip', tone: 'neutral' },
};

export const RISK_LEVEL_LABEL: Record<NonNullable<DealDetail['risk']>['level'], Labelled> = {
  low: { label: 'Low risk', tone: 'profit' },
  medium: { label: 'Some risk', tone: 'fresh' },
  high: { label: 'High risk', tone: 'loss' },
  unknown: { label: 'Risk unknown', tone: 'neutral' },
};

export const SEVERITY_TONE: Record<'low' | 'medium' | 'high', DealTone> = { low: 'neutral', medium: 'fresh', high: 'loss' };

const CHECK_LABEL: Record<string, string> = {
  availability: 'Availability',
  marketplace: 'Marketplace',
  relevance: 'Matches your search',
  accessory: 'Not an accessory',
  condition: 'Condition',
  geography: 'Location',
  price: 'Max price',
  exclusions: 'Words to ignore',
  economics: 'Profit target',
};

export const CHECK_OUTCOME_LABEL: Record<DealDetail['matchChecks'][number]['outcome'], Labelled> = {
  pass: { label: 'Pass', tone: 'profit' },
  fail: { label: 'Fail', tone: 'loss' },
  unverified: { label: 'Not checked', tone: 'neutral' },
  not_applicable: { label: 'Not set', tone: 'neutral' },
};

export const REASON_EFFECT_LABEL: Record<DealDetail['strengthReasons'][number]['effect'], Labelled> = {
  supports: { label: 'In its favour', tone: 'profit' },
  caps: { label: 'Holds it back', tone: 'fresh' },
  blocks: { label: 'Rules it out', tone: 'loss' },
  note: { label: 'Note', tone: 'neutral' },
};

export interface DealDetailView extends DealCardView {
  url: string;
  description: string | null;
  conditionText: string | null;
  locationText: string | null;
  /** Price breakdown lines, e.g. [["Asking price", "R4 000"], ["Shipping", "R150"], ["Known total", "R4 150"]]. */
  priceLines: [string, string][];
  /** Costs never included yet, in words. */
  notIncluded: string | null;
  /** e.g. "R350 under your max, including known costs". */
  maxPriceNote: string | null;
  targetNote: string | null;
  checks: { label: string; outcome: Labelled; detail: string }[];
  /** Plain-English alert outcome, e.g. "Rein Drop would alert you about this deal." */
  alertNote: string | null;
  decisions: string[];
}

export function dealDetailView(deal: DealDetail, ctx: HuntFormContext): DealDetailView {
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const card = dealCardView(deal, ctx);
  const econ = deal.economics;
  const priceLines: [string, string][] = [['Asking price', card.price]];
  for (const cost of econ?.knownCosts ?? []) priceLines.push([cost.label, cost.amount.amountMinor === 0 ? 'Free' : fmt(cost.amount)]);
  if (deal.price.knownTotal && econ && econ.knownCosts.length > 0) priceLines.push(['Known total', fmt(deal.price.knownTotal)]);

  let maxPriceNote: string | null = null;
  const max = econ?.maxPrice;
  if (max?.status === 'unverified') maxPriceNote = `Couldn't compare with your max of ${fmt(max.limit)}`;
  else if (max && max.headroom) {
    const under = max.headroom.amountMinor >= 0;
    const amount = fmt({ ...max.headroom, amountMinor: Math.abs(max.headroom.amountMinor) });
    maxPriceNote = under
      ? `${amount} under your max of ${fmt(max.limit)}${econ!.knownCosts.length > 0 ? ', including known costs' : ''}`
      : max.status === 'within'
        ? `Within your max of ${fmt(max.limit)}, but ${amount} over once known costs are added`
        : `${amount} over your max of ${fmt(max.limit)}`;
  }

  const alert = deal.alert;
  const alertNote = !alert
    ? null
    : alert.eligible
      ? alert.kind === 'exceptional'
        ? 'Rein Drop would send an exceptional-deal alert for this.'
        : 'Rein Drop would alert you about this deal.'
      : `No alert: ${alert.rules
          .filter((r) => !r.passed)
          .map((r) => r.detail.charAt(0).toLowerCase() + r.detail.slice(1))
          .join('; ')}.`;

  const decisions: string[] = [];
  const d = deal.decision;
  const when = (iso: string) => ageText(Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000)));
  if (d.boughtAt) decisions.push(`You marked it bought ${when(d.boughtAt)}.`);
  if (d.ignoredAt) decisions.push(`You ignored it ${when(d.ignoredAt)}${d.ignoreReason ? `: "${d.ignoreReason}"` : ''}.`);
  if (d.savedAt && !d.boughtAt) decisions.push(`You saved it ${when(d.savedAt)}.`);

  return {
    ...card,
    url: deal.listing.url,
    description: deal.listing.description,
    conditionText: deal.listing.conditionText,
    locationText: deal.listing.locationText,
    priceLines,
    notIncluded: econ && econ.notIncluded.length > 0 ? `Not included: ${joinList(econ.notIncluded.map((c) => COST_LABEL[c] ?? c.replaceAll('_', ' ')))}.` : null,
    maxPriceNote,
    targetNote: econ?.target ? econ.target.detail : null,
    checks: deal.matchChecks.map((c) => ({ label: CHECK_LABEL[c.check] ?? c.check, outcome: CHECK_OUTCOME_LABEL[c.outcome], detail: c.detail })),
    alertNote,
    decisions,
  };
}

/** Which actions make sense for a deal in its current state. */
export function dealActions(deal: Pick<DealSummary, 'status' | 'isSaved'>) {
  const bought = deal.status === 'bought';
  return {
    canSave: !bought && !deal.isSaved,
    canUnsave: !bought && deal.isSaved,
    canIgnore: !bought && deal.status !== 'ignored',
    canUnignore: deal.status === 'ignored',
    canBuy: !bought,
  };
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export const IGNORE_REASON_MAX = 200;

export function buildIgnoreRequest(reasonText: string): { ok: true; request: IgnoreDealRequest } | { ok: false; error: string } {
  const reason = reasonText.trim();
  if (reason.length > IGNORE_REASON_MAX) return { ok: false, error: `Keep it under ${IGNORE_REASON_MAX} characters` };
  return { ok: true, request: reason ? { reason } : {} };
}

/** What the Bought form starts with: the asking price, editable. */
/** Defaults from the listing (asking price, the shipping it states) - both editable. */
export function boughtFormDefaults(deal: Pick<DealSummary, 'price'>, ctx: HuntFormContext): { price: string; currency: string; shipping: string } {
  const asking = deal.price.asking;
  const known = deal.price.knownCosts;
  return {
    price: asking ? moneyToInput(asking) : '',
    currency: asking?.currency ?? ctx.currency,
    shipping: known && known.amountMinor > 0 && (!asking || known.currency === asking.currency) ? moneyToInput(known) : '',
  };
}

/**
 * Empty price = "what it was listed for" (only when it shows a price). Optional shipping to you
 * becomes a purchase cost; more costs can be added in Inventory.
 */
export function buildBoughtRequest(
  priceText: string,
  currency: string,
  asking: Money | null,
  shippingText = '',
): { ok: true; request: MarkDealBoughtRequest } | { ok: false; error: string; field?: 'price' | 'shipping' } {
  const parsed = parseMoneyInput(priceText, currency);
  if (!parsed.ok) return { ok: false, error: parsed.message, field: 'price' };
  if (!parsed.money && !asking) return { ok: false, error: 'Enter what you paid', field: 'price' };
  if (parsed.money && parsed.money.amountMinor <= 0) return { ok: false, error: 'Enter what you paid', field: 'price' };
  const shipping = parseMoneyInput(shippingText, currency);
  if (!shipping.ok) return { ok: false, error: shipping.message, field: 'shipping' };
  const request: MarkDealBoughtRequest = parsed.money ? { price: parsed.money } : {};
  if (shipping.money && shipping.money.amountMinor > 0) request.costs = [{ category: 'SHIPPING', amount: shipping.money }];
  return { ok: true, request };
}
