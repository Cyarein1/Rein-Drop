import {
  createHuntRequestSchema,
  HUNT_RADIUS_KM_MAX,
  huntLiveReadinessProblems,
  kmToUnit,
  LOCAL_MARKETPLACES,
  unitToKm,
  type ApiErrorDetail,
  type CreateHuntRequest,
  type DistanceUnit,
  type GeoPoint,
  type HuntCondition,
  type MarketplaceKey,
  type SellerSnapshot,
  type UserLocale,
} from '@rein-drop/contracts';
import { formatMoney, moneyToInput, parseMoneyInput } from './money.js';

/**
 * Create Hunt form model shared by web and mobile. Inputs are kept as the text the
 * person typed; conversion to the API request (minor units, km) happens in one place.
 */

export type HuntTargetKind = 'none' | 'profit' | 'margin';

export interface HuntFormValues {
  /** The product or a natural-language description. */
  query: string;
  marketplaces: MarketplaceKey[];
  locationText: string;
  /**
   * Coordinates of the location (decision 0017): from a picked suggestion, "Use my area" or the
   * moved map pin. Cleared when the text is typed over; the API then places the text on save.
   */
  locationPoint: GeoPoint | null;
  /** In the user's distance unit. */
  radius: string;
  /** Empty = any condition. */
  conditions: HuntCondition[];
  /** Major units as typed, e.g. "2000" or "1999.99". */
  maxPrice: string;
  targetKind: HuntTargetKind;
  targetProfit: string;
  targetMargin: string;
  /** Comma- or line-separated words to ignore. */
  exclusions: string;
}

export type HuntFormField = keyof HuntFormValues;
export type HuntFormErrors = Partial<Record<HuntFormField | 'form', string>>;

/** Display context derived from the user's locale. */
export interface HuntFormContext {
  currency: string;
  distanceUnit: DistanceUnit;
  /** BCP 47 tag for number/currency formatting, e.g. "en-ZA". */
  localeTag: string;
}

/** A value pre-filled from the Seller Snapshot - always shown to the user, never locked. */
export interface PrefillNote {
  field: HuntFormField;
  note: string;
}

export const EMPTY_HUNT_FORM: HuntFormValues = {
  query: '',
  marketplaces: [],
  locationText: '',
  locationPoint: null,
  radius: '',
  conditions: [],
  maxPrice: '',
  targetKind: 'none',
  targetProfit: '',
  targetMargin: '',
  exclusions: '',
};

/** Currency when the user's locale is not known yet (fallback, not a product decision). */
export const FALLBACK_CURRENCY = 'USD';

export function huntFormContext(locale: UserLocale | null): HuntFormContext {
  return {
    currency: locale?.currency ?? FALLBACK_CURRENCY,
    distanceUnit: locale?.distanceUnit ?? 'km',
    localeTag: locale ? `${locale.language}-${locale.countryCode}` : 'en',
  };
}

const SOURCE_TO_MARKETPLACE: Partial<Record<string, MarketplaceKey>> = {
  facebook_marketplace: 'facebook',
  ebay: 'ebay',
};

const QUERY_EXAMPLES: Record<string, string> = {
  phones_tablets: 'iPhone 13 Pro 256GB',
  computers: 'MacBook Air M2',
  gaming: 'Nintendo Switch OLED',
  cameras: 'Sony A7 III body',
  sneakers_fashion: 'Jordan 1 Retro High',
  collectibles: 'Pokémon booster box',
  tools: 'Milwaukee M18 drill',
  auto_parts: 'BMW E46 headlights',
};

/** Example search terms for the query placeholder, based on what the seller hunts for. */
export function queryPlaceholder(snapshot: SellerSnapshot | null): string {
  const category = snapshot?.categories.find((c) => c in QUERY_EXAMPLES);
  return `e.g. ${category ? QUERY_EXAMPLES[category] : 'Nintendo Switch OLED, boxed'}`;
}

/**
 * Sensible starting values from the Seller Snapshot (Blueprint section 5: "Preselect based on
 * Seller Snapshot; user can change"). Every pre-filled field gets a visible note.
 */
export function huntFormDefaults(
  snapshot: SellerSnapshot | null,
  locale: UserLocale | null,
): { values: HuntFormValues; context: HuntFormContext; prefilled: PrefillNote[] } {
  const context = huntFormContext(locale);
  const values: HuntFormValues = { ...EMPTY_HUNT_FORM };
  const prefilled: PrefillNote[] = [];
  const usable = snapshot && snapshot.isReseller !== false;

  const fromSources = usable
    ? [...new Set(snapshot.sources.map((s) => SOURCE_TO_MARKETPLACE[s]).filter((m): m is MarketplaceKey => !!m))]
    : [];
  if (fromSources.length > 0) {
    values.marketplaces = fromSources.sort();
    prefilled.push({ field: 'marketplaces', note: 'From your Seller Snapshot (where you source)' });
  } else {
    values.marketplaces = ['ebay', 'facebook'];
  }

  const rule = usable ? snapshot.dealRule : null;
  if (rule?.criterion === 'min_profit' && rule.target?.currency === context.currency) {
    values.targetKind = 'profit';
    values.targetProfit = moneyToInput(rule.target);
    prefilled.push({ field: 'targetProfit', note: 'From your Seller Snapshot (minimum profit)' });
  } else if (rule?.criterion === 'min_margin' && rule.targetPercent !== null) {
    values.targetKind = 'margin';
    values.targetMargin = String(rule.targetPercent);
    prefilled.push({ field: 'targetMargin', note: 'From your Seller Snapshot (minimum margin)' });
  } else if (rule?.criterion === 'max_buy_price' && rule.target?.currency === context.currency) {
    values.maxPrice = moneyToInput(rule.target);
    prefilled.push({ field: 'maxPrice', note: 'From your Seller Snapshot (max buy price)' });
  }

  return { values, context, prefilled };
}

/** Whether to show location/radius: only where a local marketplace is chosen. */
export function needsLocation(values: Pick<HuntFormValues, 'marketplaces'>): boolean {
  return values.marketplaces.some((m) => LOCAL_MARKETPLACES.includes(m));
}

export function parseExclusions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const word = part.trim();
    if (word && !seen.has(word.toLowerCase())) {
      seen.add(word.toLowerCase());
      out.push(word);
    }
  }
  return out;
}

/**
 * Form -> `POST /hunts` body, validated with the same rules as the API. Location and radius
 * are only sent when a local marketplace is chosen.
 */
export function buildCreateHuntRequest(
  values: HuntFormValues,
  ctx: HuntFormContext,
): { ok: true; request: CreateHuntRequest } | { ok: false; errors: HuntFormErrors } {
  const errors: HuntFormErrors = {};

  const maxPrice = parseMoneyInput(values.maxPrice, ctx.currency);
  if (!maxPrice.ok) errors.maxPrice = maxPrice.message;

  let target: CreateHuntRequest['target'] = null;
  if (values.targetKind === 'profit') {
    const profit = parseMoneyInput(values.targetProfit, ctx.currency);
    if (!profit.ok) errors.targetProfit = profit.message;
    else if (!profit.money) errors.targetProfit = 'Enter the profit you want, or choose "No target"';
    else target = { kind: 'profit', amount: profit.money };
  } else if (values.targetKind === 'margin') {
    const percent = Number(values.targetMargin.replace('%', '').trim());
    if (!values.targetMargin.trim() || !Number.isInteger(percent)) {
      errors.targetMargin = 'Enter a whole percentage, e.g. 30';
    } else {
      target = { kind: 'margin', percent };
    }
  }

  let location: CreateHuntRequest['location'] = null;
  if (needsLocation(values)) {
    const text = values.locationText.trim();
    const radiusText = values.radius.trim();
    let radiusKm: number | null = null;
    if (radiusText) {
      const radius = Number(radiusText);
      const maxInUnit = kmToUnit(HUNT_RADIUS_KM_MAX, ctx.distanceUnit);
      if (!Number.isInteger(radius) || radius < 1 || radius > maxInUnit) {
        errors.radius = `Enter a whole number between 1 and ${maxInUnit} ${ctx.distanceUnit}`;
      } else {
        radiusKm = unitToKm(radius, ctx.distanceUnit);
      }
    }
    if (text) location = { text, radiusKm, point: values.locationPoint };
    else if (radiusText) errors.locationText = 'Add a location for the radius';
  }

  const parsed = createHuntRequestSchema.safeParse({
    query: values.query,
    // Canonical order (as the API returns them), whatever order the chips were tapped in.
    marketplaces: [...values.marketplaces].sort(),
    location,
    conditions: values.conditions,
    maxPrice: maxPrice.ok ? maxPrice.money : null,
    target,
    exclusions: parseExclusions(values.exclusions),
  });
  if (!parsed.success || Object.keys(errors).length > 0) {
    const schemaErrors = parsed.success
      ? {}
      : mapHuntErrors(
          parsed.error.issues.map((i) => ({ path: ['body', ...i.path.map(String)].join('.'), message: i.message })),
        );
    // Client-side parsing messages are more specific than schema messages for the same field.
    const merged: HuntFormErrors = { ...schemaErrors, ...errors };
    return { ok: false, errors: Object.keys(merged).length > 0 ? merged : { form: 'Please check the form' } };
  }
  return { ok: true, request: parsed.data };
}

/** API / schema error details (`body.location.radiusKm`...) -> form fields. */
export function mapHuntErrors(details: readonly ApiErrorDetail[]): HuntFormErrors {
  const errors: HuntFormErrors = {};
  const field = (path: string): HuntFormField | 'form' => {
    const p = path.replace(/^body\.?/, '');
    if (p.startsWith('query') || p.startsWith('name')) return 'query';
    if (p.startsWith('marketplaces')) return 'marketplaces';
    if (p.startsWith('location.radiusKm')) return 'radius';
    if (p.startsWith('location')) return 'locationText';
    if (p.startsWith('conditions')) return 'conditions';
    if (p.startsWith('maxPrice')) return 'maxPrice';
    if (p.startsWith('target.percent')) return 'targetMargin';
    if (p.startsWith('target')) return 'targetProfit';
    if (p.startsWith('exclusions')) return 'exclusions';
    return 'form';
  };
  for (const d of details) {
    const key = field(d.path);
    errors[key] ??= d.message;
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

const MARKETPLACE_LABEL: Record<MarketplaceKey, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };
const CONDITION_LABEL: Record<HuntCondition, string> = { new: 'new', used: 'used', refurbished: 'refurbished' };

export interface HuntReview {
  /** One plain-English paragraph. */
  sentence: string;
  /** Labelled facts for a checklist-style review. */
  items: { label: string; value: string }[];
  /** Things that will stop the hunt going live later (not blocking for a draft). */
  warnings: string[];
}

function joinWords(words: string[], last = 'and'): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} ${last} ${words.at(-1)}`;
}

/** Plain-English review of what Rein Drop will watch (Blueprint section 5: "Review"). */
export function huntReview(request: CreateHuntRequest, ctx: HuntFormContext): HuntReview {
  const where = joinWords(request.marketplaces.map((m) => MARKETPLACE_LABEL[m]));
  const location = request.location
    ? request.location.radiusKm
      ? `within ${kmToUnit(request.location.radiusKm, ctx.distanceUnit)} ${ctx.distanceUnit} of ${request.location.text}`
      : `around ${request.location.text}`
    : null;
  const conditionList = request.conditions.length
    ? joinWords(request.conditions.map((c) => CONDITION_LABEL[c]), 'or')
    : null;
  const condition = conditionList ? `${conditionList} condition` : 'any condition';
  const maxPrice = request.maxPrice ? formatMoney(request.maxPrice, ctx.localeTag) : null;
  const target =
    request.target?.kind === 'profit'
      ? `at least ${formatMoney(request.target.amount, ctx.localeTag)} profit`
      : request.target?.kind === 'margin'
        ? `at least ${request.target.percent}% margin`
        : null;

  const parts = [`Rein Drop will look for “${request.query}” on ${where}`];
  if (location) parts.push(location);
  parts.push(`in ${condition}`);
  let sentence = parts.join(' ');
  if (maxPrice) sentence += `, priced at ${maxPrice} or less`;
  sentence += '.';
  if (target) sentence += ` It will favour deals with ${target}.`;
  if (request.exclusions.length) sentence += ` Listings mentioning ${joinWords(request.exclusions.map((e) => `“${e}”`), 'or')} are ignored.`;

  const items = [
    { label: 'Hunting for', value: request.query },
    { label: 'Marketplaces', value: where },
    ...(location ? [{ label: 'Location', value: location.replace(/^within |^around /, '') }] : []),
    {
      label: 'Condition',
      value: conditionList ? conditionList.charAt(0).toUpperCase() + conditionList.slice(1) : 'Any condition',
    },
    { label: 'Max price', value: maxPrice ?? 'No limit' },
    { label: 'Target', value: target ? target.charAt(0).toUpperCase() + target.slice(1) : 'None' },
    { label: 'Ignoring', value: request.exclusions.length ? request.exclusions.join(', ') : 'Nothing' },
  ];

  return { sentence, items, warnings: huntLiveReadinessProblems(request) };
}
