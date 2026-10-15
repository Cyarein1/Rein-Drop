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
import { translator, type MessageKey, type Translator } from '@rein-drop/i18n';
import type { HuntFormContext } from './hunt-form.js';
import { formatMoney, moneyToInput, parseMoneyInput } from './money.js';

/**
 * Deal feed + Deal Detail view model, shared by web and mobile: every label, tone and formatted
 * value comes from here, so both apps say the same thing. Estimates are always labelled as
 * estimates; nothing here ever presents an estimate as profit.
 *
 * Text goes through the translator (`ctx.t`, or a trailing `t` parameter that defaults to English).
 * The exported label constants below are English-only and will be removed in step 89 - use the
 * translated accessors next to them (`dealStatusLabel(status, t)`, `dealFilters(t)`, ...).
 */

/** Same names as the design-token tones (client-core doesn't depend on design-tokens). */
export type DealTone = 'neutral' | 'info' | 'action' | 'fresh' | 'profit' | 'loss';
export interface Labelled {
  label: string;
  tone: DealTone;
}

const EN = (): Translator => translator('en');

/** Marketplace names are never translated. */
export const MARKETPLACE_LABEL: Record<MarketplaceKey, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };

/** A label key + tone; `labelled(...)` renders it in the UI language. */
type KeyedLabel = { key: MessageKey; tone: DealTone };
const labelled = ({ key, tone }: KeyedLabel, t: Translator): Labelled => ({ label: t(key), tone });

const DEAL_STATUS: Record<DealStatus, KeyedLabel> = {
  new: { key: 'deals.statusNew', tone: 'fresh' },
  seen: { key: 'deals.statusSeen', tone: 'neutral' },
  saved: { key: 'deals.statusSaved', tone: 'info' },
  ignored: { key: 'deals.statusIgnored', tone: 'neutral' },
  bought: { key: 'deals.statusBought', tone: 'action' },
  unavailable: { key: 'deals.statusUnavailable', tone: 'loss' },
};
/** English only - use `dealStatusLabel(status, t)`; will be removed in step 89. */
export const DEAL_STATUS_LABEL: Record<DealStatus, Labelled> = {
  new: { label: 'New', tone: 'fresh' },
  seen: { label: 'Seen', tone: 'neutral' },
  saved: { label: 'Saved', tone: 'info' },
  ignored: { label: 'Ignored', tone: 'neutral' },
  bought: { label: 'Bought', tone: 'action' },
  unavailable: { label: 'No longer available', tone: 'loss' },
};
export function dealStatusLabel(status: DealStatus, t: Translator = EN()): Labelled {
  return labelled(DEAL_STATUS[status], t);
}

const DEAL_FILTER_KEYS: readonly { value: DealStatusFilter; key: MessageKey }[] = [
  { value: 'open', key: 'deals.filterOpen' },
  { value: 'saved', key: 'deals.filterSaved' },
  { value: 'bought', key: 'deals.filterBought' },
  { value: 'ignored', key: 'deals.filterIgnored' },
  { value: 'unavailable', key: 'deals.filterUnavailable' },
  { value: 'all', key: 'deals.filterAll' },
];
/** Feed tabs, in display order. English only - use `dealFilters(t)`; will be removed in step 89. */
export const DEAL_FILTERS: readonly { value: DealStatusFilter; label: string }[] = [
  { value: 'open', label: 'To review' },
  { value: 'saved', label: 'Saved' },
  { value: 'bought', label: 'Bought' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'all', label: 'All' },
];
/** Feed tabs, in display order, in the UI language. */
export function dealFilters(t: Translator = EN()): { value: DealStatusFilter; label: string }[] {
  return DEAL_FILTER_KEYS.map(({ value, key }) => ({ value, label: t(key) }));
}

const STRENGTH: Record<DealStrength, KeyedLabel> = {
  exceptional: { key: 'deals.strengthExceptional', tone: 'fresh' },
  strong: { key: 'deals.strengthStrong', tone: 'action' },
  moderate: { key: 'deals.strengthModerate', tone: 'info' },
  weak: { key: 'deals.strengthWeak', tone: 'neutral' },
};
/** English only - use `strengthLabel(strength, t)`; will be removed in step 89. */
export const STRENGTH_LABEL: Record<DealStrength, Labelled> = {
  exceptional: { label: 'Exceptional', tone: 'fresh' },
  strong: { label: 'Strong', tone: 'action' },
  moderate: { label: 'Worth a look', tone: 'info' },
  weak: { label: 'Weak', tone: 'neutral' },
};
export function strengthLabel(strength: DealStrength, t: Translator = EN()): Labelled {
  return labelled(STRENGTH[strength], t);
}

const CONFIDENCE: Record<DealConfidence, MessageKey> = {
  high: 'deals.confidenceHigh',
  medium: 'deals.confidenceMedium',
  low: 'deals.confidenceLow',
};
/** English only - use `confidenceLabel(confidence, t)`; will be removed in step 89. */
export const CONFIDENCE_LABEL: Record<DealConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};
export function confidenceLabel(confidence: DealConfidence, t: Translator = EN()): string {
  return t(CONFIDENCE[confidence]);
}

const COST: Record<string, MessageKey> = {
  selling_fees: 'deals.costSellingFees',
  payment_fees: 'deals.costPaymentFees',
  shipping_to_your_buyer: 'deals.costShippingToBuyer',
  repairs_and_prep: 'deals.costRepairsAndPrep',
};
const costLabel = (cost: string, t: Translator) => {
  const key = COST[cost];
  return key ? t(key) : cost.replaceAll('_', ' ');
};

const UNESTIMATED: Record<string, MessageKey> = {
  no_source: 'deals.unestimatedNoData',
  no_resale_estimate: 'deals.unestimatedNoData',
  too_few_sales: 'deals.unestimatedTooFewSales',
  other_currency: 'deals.unestimatedOtherCurrency',
  inconsistent: 'deals.unestimatedInconsistent',
  no_price: 'deals.unestimatedNoPrice',
  not_analyzed: 'deals.unestimatedAnalysing',
};
/** Why there's no estimate; an unknown reason falls back to the API's own detail. */
const unestimated = (reason: string, detail: string, t: Translator) => {
  const key = UNESTIMATED[reason];
  return key ? t(key) : detail;
};

const LISTING_GONE: Record<string, MessageKey> = { SOLD: 'deals.goneSold', ENDED: 'deals.goneEnded', REMOVED: 'deals.goneRemoved' };

// ---------------------------------------------------------------------------
// Small formatters
// ---------------------------------------------------------------------------

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function ageText(minutes: number, t: Translator = EN()): string {
  if (minutes < 1) return t('common.justNow');
  if (minutes < 60) return t('common.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t('common.hoursAgo', { count: hours });
  return t('common.daysAgo', { count: Math.floor(hours / 24) });
}

/** Posted within the last hour: the "Just dropped" freshness badge. */
export const JUST_DROPPED_MINUTES = 60;

export function freshnessText(f: DealFreshness, t: Translator = EN()): string {
  return t(f.basis === 'posted' ? 'deals.freshPosted' : 'deals.freshFound', { age: ageText(f.ageMinutes, t) });
}

/** "a, b and c" in the UI language. */
export function joinList(items: string[], t: Translator = EN()): string {
  if (items.length <= 1) return items.join('');
  return t('common.listAnd', { items: items.slice(0, -1).join(', '), last: items.at(-1) });
}

/** e.g. "Sold on eBay", "Couldn't check Facebook Marketplace on the last try", or null when all is well. */
export function sourceNote(source: DealSourceStatus, t: Translator = EN()): { text: string; tone: DealTone } | null {
  const name = MARKETPLACE_LABEL[source.marketplace];
  if (!source.available) return { text: t(LISTING_GONE[source.listingStatus] ?? 'deals.goneOther', { name }), tone: 'loss' };
  // The source's own state affects every deal from it: say so calmly, before this Hunt's last check.
  if (source.sourceHealth.status === 'down') return { text: t('deals.sourceDownNote', { name }), tone: 'fresh' };
  if (source.sourceHealth.status === 'degraded') return { text: t('deals.sourceSlowNote', { name }), tone: 'fresh' };
  if (source.lastCheck === 'failed') return { text: t('deals.sourceCheckFailedNote', { name }), tone: 'fresh' };
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
  const { t } = ctx;
  const { upside } = estimate;
  if (upside.status !== 'estimated') {
    return { value: t('deals.notEstimated'), estimated: false, caption: unestimated(upside.reason, upside.detail, t) };
  }
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const excludes = upside.excludes.map((c) => costLabel(c, t));
  const range = { low: fmt(upside.low), high: fmt(upside.high) };
  return {
    value: fmt(upside.typical),
    estimated: true,
    caption: excludes.length > 0 ? t('deals.rangeBefore', { ...range, costs: joinList(excludes, t) }) : t('deals.range', range),
  };
}

/**
 * Always shown next to estimates: they are never presented as guaranteed or realized profit.
 * English only - use `estimateNote(t)`; will be removed in step 89.
 */
export const ESTIMATE_NOTE = "Estimates, not guaranteed profit. Fees, condition and timing change what you actually make - check the listing before you buy.";
/** The estimate note in the UI language. */
export function estimateNote(t: Translator = EN()): string {
  return t('deals.estimateNote');
}

/** Estimated resale value from comparable sales, or why there is none. */
export function resaleView(estimate: DealEstimate, ctx: HuntFormContext): UpsideView {
  const { t } = ctx;
  const { resale } = estimate;
  if (resale.status !== 'estimated') return { value: t('deals.notEstimated'), estimated: false, caption: unestimated(resale.reason, resale.detail, t) };
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  return {
    value: fmt(resale.typical),
    estimated: true,
    caption: t('deals.resaleRange', { low: fmt(resale.low), high: fmt(resale.high), count: resale.sampleSize }),
  };
}

// ---------------------------------------------------------------------------
// Feed card
// ---------------------------------------------------------------------------

export interface DealCardView {
  id: string;
  title: string;
  huntName: string;
  /** Marketplace key (for its logo) and its display name. */
  marketplace: MarketplaceKey;
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
  const { t } = ctx;
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const status = dealStatusLabel(deal.status, t);
  const strength = deal.assessment.strength ? strengthLabel(deal.assessment.strength, t) : null;
  const confidence = deal.assessment.confidence ? confidenceLabel(deal.assessment.confidence, t) : null;
  const price = deal.price.asking ? fmt(deal.price.asking) : t('deals.noPrice');
  const upside = upsideView(deal.estimate, ctx);
  const analysisNote =
    deal.assessment.status === 'pending' ? t('deals.analysisPending') : deal.assessment.status === 'failed' ? t('deals.analysisFailed') : null;
  const view: Omit<DealCardView, 'accessibleSummary'> = {
    id: deal.id,
    title: deal.listing.title,
    huntName: deal.hunt.name,
    marketplace: deal.listing.marketplace,
    source: MARKETPLACE_LABEL[deal.listing.marketplace],
    freshness: freshnessText(deal.freshness, t),
    justDropped: deal.freshness.ageMinutes <= JUST_DROPPED_MINUTES && deal.source.available,
    price,
    priceExtra: deal.price.knownCosts ? t('deals.knownCostsExtra', { amount: fmt(deal.price.knownCosts) }) : null,
    upside,
    status,
    strength,
    confidence,
    analysisNote,
    reason: deal.reason,
    sourceNote: sourceNote(deal.source, t),
    exceptional: deal.assessment.strength === 'exceptional',
  };
  return {
    ...view,
    accessibleSummary: [
      view.title,
      `${view.source}, ${view.freshness}`,
      price,
      strength ? t('deals.a11yStrength', { strength: strength.label }) : analysisNote,
      confidence,
      upside.estimated ? t('deals.a11yUpside', { value: upside.value }) : t('deals.a11yNoUpside'),
      status.label,
    ]
      .filter(Boolean)
      .join('. '),
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

type NextStep = NonNullable<DealDetail['why']>['nextStep'];
const NEXT_STEP: Record<NextStep, KeyedLabel> = {
  review: { key: 'deals.nextReview', tone: 'action' },
  ask_seller: { key: 'deals.nextAskSeller', tone: 'info' },
  skip: { key: 'deals.nextSkip', tone: 'neutral' },
};
/** English only - use `nextStepLabel(step, t)`; will be removed in step 89. */
export const NEXT_STEP_LABEL: Record<NextStep, Labelled> = {
  review: { label: 'Worth reviewing now', tone: 'action' },
  ask_seller: { label: 'Ask the seller first', tone: 'info' },
  skip: { label: 'Probably skip', tone: 'neutral' },
};
export function nextStepLabel(step: NextStep, t: Translator = EN()): Labelled {
  return labelled(NEXT_STEP[step], t);
}

type RiskLevel = NonNullable<DealDetail['risk']>['level'];
const RISK_LEVEL: Record<RiskLevel, KeyedLabel> = {
  low: { key: 'deals.riskLow', tone: 'profit' },
  medium: { key: 'deals.riskMedium', tone: 'fresh' },
  high: { key: 'deals.riskHigh', tone: 'loss' },
  unknown: { key: 'deals.riskUnknown', tone: 'neutral' },
};
/** English only - use `riskLevelLabel(level, t)`; will be removed in step 89. */
export const RISK_LEVEL_LABEL: Record<RiskLevel, Labelled> = {
  low: { label: 'Low risk', tone: 'profit' },
  medium: { label: 'Some risk', tone: 'fresh' },
  high: { label: 'High risk', tone: 'loss' },
  unknown: { label: 'Risk unknown', tone: 'neutral' },
};
export function riskLevelLabel(level: RiskLevel, t: Translator = EN()): Labelled {
  return labelled(RISK_LEVEL[level], t);
}

export const SEVERITY_TONE: Record<'low' | 'medium' | 'high', DealTone> = { low: 'neutral', medium: 'fresh', high: 'loss' };

const CHECK: Record<string, MessageKey> = {
  availability: 'deals.checkAvailability',
  marketplace: 'deals.checkMarketplace',
  relevance: 'deals.checkRelevance',
  accessory: 'deals.checkAccessory',
  condition: 'deals.checkCondition',
  geography: 'deals.checkGeography',
  price: 'deals.checkPrice',
  exclusions: 'deals.checkExclusions',
  economics: 'deals.checkEconomics',
};
const checkLabel = (check: string, t: Translator) => {
  const key = CHECK[check];
  return key ? t(key) : check;
};

type CheckOutcome = DealDetail['matchChecks'][number]['outcome'];
const CHECK_OUTCOME: Record<CheckOutcome, KeyedLabel> = {
  pass: { key: 'deals.outcomePass', tone: 'profit' },
  fail: { key: 'deals.outcomeFail', tone: 'loss' },
  unverified: { key: 'deals.outcomeUnverified', tone: 'neutral' },
  not_applicable: { key: 'deals.outcomeNotApplicable', tone: 'neutral' },
};
/** English only - use `checkOutcomeLabel(outcome, t)`; will be removed in step 89. */
export const CHECK_OUTCOME_LABEL: Record<CheckOutcome, Labelled> = {
  pass: { label: 'Pass', tone: 'profit' },
  fail: { label: 'Fail', tone: 'loss' },
  unverified: { label: 'Not checked', tone: 'neutral' },
  not_applicable: { label: 'Not set', tone: 'neutral' },
};
export function checkOutcomeLabel(outcome: CheckOutcome, t: Translator = EN()): Labelled {
  return labelled(CHECK_OUTCOME[outcome], t);
}

type ReasonEffect = DealDetail['strengthReasons'][number]['effect'];
const REASON_EFFECT: Record<ReasonEffect, KeyedLabel> = {
  supports: { key: 'deals.effectSupports', tone: 'profit' },
  caps: { key: 'deals.effectCaps', tone: 'fresh' },
  blocks: { key: 'deals.effectBlocks', tone: 'loss' },
  note: { key: 'deals.effectNote', tone: 'neutral' },
};
/** English only - use `reasonEffectLabel(effect, t)`; will be removed in step 89. */
export const REASON_EFFECT_LABEL: Record<ReasonEffect, Labelled> = {
  supports: { label: 'In its favour', tone: 'profit' },
  caps: { label: 'Holds it back', tone: 'fresh' },
  blocks: { label: 'Rules it out', tone: 'loss' },
  note: { label: 'Note', tone: 'neutral' },
};
export function reasonEffectLabel(effect: ReasonEffect, t: Translator = EN()): Labelled {
  return labelled(REASON_EFFECT[effect], t);
}

export interface DealDetailView extends DealCardView {
  url: string;
  description: string | null;
  conditionText: string | null;
  locationText: string | null;
  /** Price breakdown lines, e.g. [["Asking price", "R4 000"], ["Shipping", "R150"], ["Known total", "R4 150"]]. */
  priceLines: [string, string][];
  /** Estimated resale value (comparable sales). */
  resale: UpsideView;
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
  const { t } = ctx;
  const fmt = (m: Money) => formatMoney(m, ctx.localeTag);
  const card = dealCardView(deal, ctx);
  const econ = deal.economics;
  // Cost labels (e.g. "Shipping") come from the API.
  const priceLines: [string, string][] = [[t('deals.askingPrice'), card.price]];
  for (const cost of econ?.knownCosts ?? []) priceLines.push([cost.label, cost.amount.amountMinor === 0 ? t('deals.free') : fmt(cost.amount)]);
  if (deal.price.knownTotal && econ && econ.knownCosts.length > 0) priceLines.push([t('deals.knownTotal'), fmt(deal.price.knownTotal)]);

  let maxPriceNote: string | null = null;
  const max = econ?.maxPrice;
  if (max?.status === 'unverified') maxPriceNote = t('deals.maxUnverified', { max: fmt(max.limit) });
  else if (max && max.headroom) {
    const under = max.headroom.amountMinor >= 0;
    const values = { amount: fmt({ ...max.headroom, amountMinor: Math.abs(max.headroom.amountMinor) }), max: fmt(max.limit) };
    maxPriceNote = under
      ? t(econ!.knownCosts.length > 0 ? 'deals.maxUnderWithCosts' : 'deals.maxUnder', values)
      : max.status === 'within'
        ? t('deals.maxWithinThenOver', values)
        : t('deals.maxOver', values);
  }

  const alert = deal.alert;
  // Rule details come from the API (English until the API is translated).
  const alertNote = !alert
    ? null
    : alert.eligible
      ? alert.kind === 'exceptional'
        ? t('deals.alertExceptional')
        : t('deals.alertYes')
      : t('deals.alertNo', {
          reasons: alert.rules
            .filter((r) => !r.passed)
            .map((r) => r.detail.charAt(0).toLowerCase() + r.detail.slice(1))
            .join('; '),
        });

  const decisions: string[] = [];
  const d = deal.decision;
  const when = (iso: string) => ageText(Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000)), t);
  if (d.boughtAt) decisions.push(t('deals.decidedBought', { when: when(d.boughtAt) }));
  if (d.ignoredAt) decisions.push(d.ignoreReason ? t('deals.decidedIgnoredReason', { when: when(d.ignoredAt), reason: d.ignoreReason }) : t('deals.decidedIgnored', { when: when(d.ignoredAt) }));
  if (d.savedAt && !d.boughtAt) decisions.push(t('deals.decidedSaved', { when: when(d.savedAt) }));

  return {
    ...card,
    url: deal.listing.url,
    description: deal.listing.description,
    conditionText: deal.listing.conditionText,
    locationText: deal.listing.locationText,
    priceLines,
    resale: resaleView(deal.estimate, ctx),
    notIncluded: econ && econ.notIncluded.length > 0 ? t('deals.notIncluded', { costs: joinList(econ.notIncluded.map((c) => costLabel(c, t)), t) }) : null,
    maxPriceNote,
    targetNote: econ?.target ? econ.target.detail : null,
    checks: deal.matchChecks.map((c) => ({ label: checkLabel(c.check, t), outcome: checkOutcomeLabel(c.outcome, t), detail: c.detail })),
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

export function buildIgnoreRequest(reasonText: string, t: Translator = EN()): { ok: true; request: IgnoreDealRequest } | { ok: false; error: string } {
  const reason = reasonText.trim();
  if (reason.length > IGNORE_REASON_MAX) return { ok: false, error: t('deals.ignoreTooLong', { max: IGNORE_REASON_MAX }) };
  return { ok: true, request: reason ? { reason } : {} };
}

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
  t: Translator = EN(),
): { ok: true; request: MarkDealBoughtRequest } | { ok: false; error: string; field?: 'price' | 'shipping' } {
  const parsed = parseMoneyInput(priceText, currency, t);
  if (!parsed.ok) return { ok: false, error: parsed.message, field: 'price' };
  if (!parsed.money && !asking) return { ok: false, error: t('deals.enterPaid'), field: 'price' };
  if (parsed.money && parsed.money.amountMinor <= 0) return { ok: false, error: t('deals.enterPaid'), field: 'price' };
  const shipping = parseMoneyInput(shippingText, currency, t);
  if (!shipping.ok) return { ok: false, error: shipping.message, field: 'shipping' };
  const request: MarkDealBoughtRequest = parsed.money ? { price: parsed.money } : {};
  if (shipping.money && shipping.money.amountMinor > 0) request.costs = [{ category: 'SHIPPING', amount: shipping.money }];
  return { ok: true, request };
}
