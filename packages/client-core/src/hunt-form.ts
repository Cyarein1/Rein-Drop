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
import { resolveLanguage, translator, type Language, type MessageKey, type Translator } from '@rein-drop/i18n';
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
  /** UI language and its translator (@rein-drop/i18n) - every user-facing string goes through `t`. */
  language: Language;
  t: Translator;
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

/** A display context from explicit values (tests, previews); English unless a language is given. */
export function displayContext(base: Pick<HuntFormContext, 'currency' | 'distanceUnit' | 'localeTag'>, language: Language = 'en'): HuntFormContext {
  return { ...base, language, t: translator(language) };
}

/**
 * The context without its translator - what a Next.js server page passes to a client component
 * (functions can't cross that boundary). `t?: never` makes passing a full context a type error.
 */
export type PlainContext = Omit<HuntFormContext, 't'> & { t?: never };

export function plainContext({ currency, distanceUnit, localeTag, language }: HuntFormContext): PlainContext {
  return { currency, distanceUnit, localeTag, language };
}

const withT = new WeakMap<PlainContext, HuntFormContext>();
/** Client side: the plain context plus its translator (the same object for the same input, so it is safe in hook deps). */
export function withTranslator(plain: PlainContext): HuntFormContext {
  let ctx = withT.get(plain);
  if (!ctx) {
    ctx = { ...plain, t: translator(plain.language) };
    withT.set(plain, ctx);
  }
  return ctx;
}

/**
 * Display context for a signed-in person: currency, distance unit, number formatting and UI
 * language from their locale. `fallbackLanguage` (e.g. the device / browser language) applies when
 * no locale is stored yet.
 */
export function huntFormContext(locale: UserLocale | null, fallbackLanguage?: string | null): HuntFormContext {
  const language = resolveLanguage(locale?.language ?? fallbackLanguage);
  return {
    currency: locale?.currency ?? FALLBACK_CURRENCY,
    distanceUnit: locale?.distanceUnit ?? 'km',
    localeTag: locale ? `${locale.language}-${locale.countryCode}` : language,
    language,
    t: translator(language),
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
export function queryPlaceholder(snapshot: SellerSnapshot | null, t: Translator = translator('en')): string {
  const category = snapshot?.categories.find((c) => c in QUERY_EXAMPLES);
  return t('hunts.queryPlaceholder', { example: category ? QUERY_EXAMPLES[category] : t('hunts.queryExampleDefault') });
}

/**
 * Sensible starting values from the Seller Snapshot (Blueprint section 5: "Preselect based on
 * Seller Snapshot; user can change"). Every pre-filled field gets a visible note, in the context's
 * language (`fallbackLanguage` as in `huntFormContext`).
 */
export function huntFormDefaults(
  snapshot: SellerSnapshot | null,
  locale: UserLocale | null,
  fallbackLanguage?: string | null,
): { values: HuntFormValues; context: HuntFormContext; prefilled: PrefillNote[] } {
  const context = huntFormContext(locale, fallbackLanguage);
  const { t } = context;
  const values: HuntFormValues = { ...EMPTY_HUNT_FORM };
  const prefilled: PrefillNote[] = [];
  const usable = snapshot && snapshot.isReseller !== false;

  const fromSources = usable
    ? [...new Set(snapshot.sources.map((s) => SOURCE_TO_MARKETPLACE[s]).filter((m): m is MarketplaceKey => !!m))]
    : [];
  if (fromSources.length > 0) {
    values.marketplaces = fromSources.sort();
    prefilled.push({ field: 'marketplaces', note: t('hunts.prefillSources') });
  } else {
    values.marketplaces = ['ebay', 'facebook'];
  }

  const rule = usable ? snapshot.dealRule : null;
  if (rule?.criterion === 'min_profit' && rule.target?.currency === context.currency) {
    values.targetKind = 'profit';
    values.targetProfit = moneyToInput(rule.target);
    prefilled.push({ field: 'targetProfit', note: t('hunts.prefillMinProfit') });
  } else if (rule?.criterion === 'min_margin' && rule.targetPercent !== null) {
    values.targetKind = 'margin';
    values.targetMargin = String(rule.targetPercent);
    prefilled.push({ field: 'targetMargin', note: t('hunts.prefillMinMargin') });
  } else if (rule?.criterion === 'max_buy_price' && rule.target?.currency === context.currency) {
    values.maxPrice = moneyToInput(rule.target);
    prefilled.push({ field: 'maxPrice', note: t('hunts.prefillMaxBuyPrice') });
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
  const { t } = ctx;
  const errors: HuntFormErrors = {};

  const maxPrice = parseMoneyInput(values.maxPrice, ctx.currency, t);
  if (!maxPrice.ok) errors.maxPrice = maxPrice.message;

  let target: CreateHuntRequest['target'] = null;
  if (values.targetKind === 'profit') {
    const profit = parseMoneyInput(values.targetProfit, ctx.currency, t);
    if (!profit.ok) errors.targetProfit = profit.message;
    else if (!profit.money) errors.targetProfit = t('hunts.errorTargetProfit');
    else target = { kind: 'profit', amount: profit.money };
  } else if (values.targetKind === 'margin') {
    const percent = Number(values.targetMargin.replace('%', '').trim());
    if (!values.targetMargin.trim() || !Number.isInteger(percent)) {
      errors.targetMargin = t('hunts.errorTargetMargin');
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
        errors.radius = t('hunts.errorRadius', { max: maxInUnit, unit: ctx.distanceUnit });
      } else {
        radiusKm = unitToKm(radius, ctx.distanceUnit);
      }
    }
    if (text) location = { text, radiusKm, point: values.locationPoint };
    else if (radiusText) errors.locationText = t('location.errorRadiusNeedsLocation');
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
    return { ok: false, errors: Object.keys(merged).length > 0 ? merged : { form: t('hunts.errorCheckForm') } };
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

/** Marketplace names are never translated. */
const MARKETPLACE_LABEL: Record<MarketplaceKey, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };
const CONDITION_KEY: Record<HuntCondition, MessageKey> = { new: 'hunts.conditionNew', used: 'hunts.conditionUsed', refurbished: 'hunts.conditionRefurbished' };

export interface HuntReview {
  /** One plain-language paragraph in the UI language. */
  sentence: string;
  /** Labelled facts for a checklist-style review. */
  items: { label: string; value: string }[];
  /** Things that will stop the hunt going live later (not blocking for a draft). From the API contracts (English). */
  warnings: string[];
}

/** "a, b and c" / "a, b or c" in the UI language. */
function joinWords(words: string[], t: Translator, last: 'and' | 'or' = 'and'): string {
  if (words.length <= 1) return words[0] ?? '';
  return t(last === 'and' ? 'common.listAnd' : 'common.listOr', { items: words.slice(0, -1).join(', '), last: words.at(-1) });
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Plain-language review of what Rein Drop will watch (Blueprint section 5: "Review"). */
export function huntReview(request: CreateHuntRequest, ctx: HuntFormContext): HuntReview {
  const { t } = ctx;
  const where = joinWords(request.marketplaces.map((m) => MARKETPLACE_LABEL[m]), t);
  const radius = request.location?.radiusKm ? `${kmToUnit(request.location.radiusKm, ctx.distanceUnit)} ${ctx.distanceUnit}` : null;
  const conditionList = request.conditions.length ? joinWords(request.conditions.map((c) => t(CONDITION_KEY[c])), t, 'or') : null;
  const maxPrice = request.maxPrice ? formatMoney(request.maxPrice, ctx.localeTag) : null;
  const targetAmount = request.target?.kind === 'profit' ? formatMoney(request.target.amount, ctx.localeTag) : null;
  const targetPercent = request.target?.kind === 'margin' ? request.target.percent : null;

  const sentences = [
    t('hunts.reviewSentence', {
      query: request.query,
      where,
      place: request.location ? (radius ? 'within' : 'around') : 'none',
      radius,
      location: request.location?.text,
      hasConditions: conditionList ? 'yes' : 'no',
      conditions: conditionList,
      hasMax: maxPrice ? 'yes' : 'no',
      maxPrice,
    }),
  ];
  if (targetAmount) sentences.push(t('hunts.reviewTargetProfit', { amount: targetAmount }));
  if (targetPercent !== null) sentences.push(t('hunts.reviewTargetMargin', { percent: targetPercent }));
  if (request.exclusions.length) {
    sentences.push(t('hunts.reviewExclusions', { words: joinWords(request.exclusions.map((text) => t('common.quoted', { text })), t, 'or') }));
  }

  const target =
    targetAmount !== null
      ? t('hunts.reviewTargetProfitValue', { amount: targetAmount })
      : targetPercent !== null
        ? t('hunts.reviewTargetMarginValue', { percent: targetPercent })
        : t('hunts.reviewNone');
  const items = [
    { label: t('hunts.reviewHuntingFor'), value: request.query },
    { label: t('hunts.reviewMarketplaces'), value: where },
    ...(request.location
      ? [{ label: t('hunts.reviewLocation'), value: radius ? t('hunts.reviewLocationWithin', { radius, location: request.location.text }) : request.location.text }]
      : []),
    { label: t('hunts.reviewCondition'), value: conditionList ? capitalize(conditionList) : t('hunts.reviewAnyCondition') },
    { label: t('hunts.reviewMaxPrice'), value: maxPrice ?? t('common.noLimit') },
    { label: t('hunts.reviewTarget'), value: target },
    { label: t('hunts.reviewIgnoring'), value: request.exclusions.length ? request.exclusions.join(', ') : t('hunts.reviewNothing') },
  ];

  return { sentence: sentences.join(' '), items, warnings: huntLiveReadinessProblems(request) };
}
