import { classifyCondition, significantTokens, tokenize } from '@rein-drop/matching';
import { factValue } from '../facts.js';
import type {
  AIProvider,
  AIResult,
  ConditionRiskInput,
  DealExplanationInput,
  ListingFacts,
  Money,
  ProductExtractionInput,
} from '../provider.js';
import {
  AI_SCHEMA_VERSION,
  type AIResultMeta,
  type ConditionRiskAssessment,
  type DealExplanation,
  type Evidence,
  type ExplanationPoint,
  type ProductExtraction,
} from '../schemas.js';

/**
 * Deterministic, rule-based stand-in for an AI model, for local development and tests. Same input,
 * same output; no network. It only reports what it can quote from the listing - it never makes
 * up seller history, market values or comparable sales. Use it through `createMockAIProvider()`,
 * which adds the shared output validation.
 */
export const MOCK_MODEL = { model: 'mock-rules', modelVersion: '1.0.0' } as const;

const TASK_VERSIONS = {
  extractProduct: 'product-extraction@1',
  assessConditionRisk: 'condition-risk@1',
  explainDeal: 'deal-explanation@1',
} as const;

type TextField = 'title' | 'description' | 'conditionText';
interface Found {
  value: string;
  evidence: Evidence;
}

/** First match of `pattern` in the title, then the description: the quote is verbatim. */
function find(listing: ListingFacts, pattern: RegExp, fields: TextField[] = ['title', 'description']): Found | null {
  for (const field of fields) {
    const text = listing[field];
    const match = text ? pattern.exec(text) : null;
    if (match) return { value: match[0].replace(/\s+/g, ' ').trim(), evidence: { source: 'text', field, quote: match[0] } };
  }
  return null;
}

const BRANDS: readonly [string, RegExp][] = [
  ['Apple', /\b(apple|iphone|ipad|macbook|airpods)\b/i],
  ['Samsung', /\b(samsung|galaxy)\b/i],
  ['Google', /\b(google|pixel)\b/i],
  ['Sony', /\b(sony|playstation|ps5)\b/i],
  ['Nintendo', /\bnintendo\b/i],
  ['Microsoft', /\b(microsoft|xbox)\b/i],
  ['DJI', /\bdji\b/i],
  ['GoPro', /\bgopro\b/i],
];

const MODELS: readonly [ProductExtraction['category'], RegExp][] = [
  ['phone', /\biPhone\s?\d{1,2}(?:\s?(?:Pro Max|Pro|Plus|Mini))?\b/i],
  ['phone', /\bGalaxy\s?(?:[SAZ]\d{1,2}|Note\s?\d{1,2})(?:\s?(?:Ultra|FE))?\b/i],
  ['phone', /\bPixel\s?\d{1,2}(?:\s?(?:Pro|a))?\b/i],
  ['tablet', /\biPad(?:\s(?:Pro|Air|Mini))?(?:\s\d{1,2}(?:st|nd|rd|th)\sGen)?\b/i],
  ['console', /\b(?:PlayStation\s?5|PS5)\b/i],
  ['console', /\bSwitch(?:\s(?:OLED|Lite))?\b/i],
  ['console', /\bXbox Series [XS]\b/i],
  ['audio', /\bAirPods(?:\sPro|\sMax)?\b/i],
  ['audio', /\bWH-\d{4}XM\d\b/i],
  ['computer', /\bMacBook\s(?:Air|Pro)(?:\sM\d)?\b/i],
  ['camera', /\bHERO\s?\d{1,2}(?:\sBlack)?\b/i],
  ['camera', /\bMini\s?\d\b/i],
];

/** Other names of a model, so a hunt for "PS5" fits a listing titled "PlayStation 5". */
const MODEL_ALIASES: readonly [RegExp, readonly string[]][] = [
  [/\b(?:PlayStation\s?5|PS5)\b/i, ['ps5', 'playstation', '5']],
  [/\bXbox Series X\b/i, ['xsx']],
];

const CATEGORY_WORDS: readonly [NonNullable<ProductExtraction['category']>, RegExp][] = [
  ['phone', /\b(phone|smartphone)\b/i],
  ['tablet', /\btablet\b/i],
  ['console', /\bconsole\b/i],
  ['audio', /\b(headphones|earbuds|speaker)\b/i],
  ['computer', /\b(laptop|notebook)\b/i],
  ['camera', /\b(camera|drone)\b/i],
];

/** First rule that matches, trying every rule on the title before looking at the description. */
function firstRule<T>(listing: ListingFacts, rules: readonly [T, RegExp][]): { tag: T; found: Found } | null {
  for (const field of ['title', 'description'] as const) {
    for (const [tag, pattern] of rules) {
      const found = find(listing, pattern, [field]);
      if (found) return { tag, found };
    }
  }
  return null;
}

function extract(listing: ListingFacts, query: string): ProductExtraction {
  const brandHit = firstRule(listing, BRANDS);
  const brand = brandHit ? { value: brandHit.tag, evidence: brandHit.found.evidence } : null;
  const modelHit = firstRule(listing, MODELS);
  const model = modelHit?.found ?? null;

  const attributes: ProductExtraction['attributes'] = [];
  const sizes = listing.title.match(/\b\d+\s?(?:GB|TB)\b/gi) ?? [];
  if (sizes.length >= 2) attributes.push({ name: 'memory', value: sizes[0]!, evidence: { source: 'text', field: 'title', quote: sizes[0]! } });
  if (sizes.length >= 1) {
    const storage = sizes.at(-1)!;
    attributes.push({ name: 'storage', value: storage, evidence: { source: 'text', field: 'title', quote: storage } });
  }
  for (const [name, pattern] of [
    ['connectivity', /\b(?:5G|Wi-?Fi|Cellular|LTE)\b/i],
    ['edition', /\b(?:Disc Edition|Digital Edition|Fly More Combo)\b/i],
  ] as const) {
    const hit = find(listing, pattern, ['title']);
    if (hit) attributes.push({ name, ...hit });
  }

  const category =
    modelHit?.tag ?? CATEGORY_WORDS.find(([, pattern]) => find(listing, pattern))?.[0] ?? (brand ? 'other' : null);
  const nameParts = [
    brand?.value,
    model?.value,
    ...attributes.filter((a) => a.name === 'edition' || a.name === 'storage').map((a) => a.value),
  ].filter((p): p is string => Boolean(p));
  const normalizedName = nameParts.length > 0 ? nameParts.join(' ') : null;

  const wanted = significantTokens(query);
  const aliases = model ? MODEL_ALIASES.filter(([pattern]) => pattern.test(model.value)).flatMap(([, names]) => names) : [];
  const have = new Set([...tokenize(normalizedName ?? ''), ...tokenize(listing.title), ...aliases]);
  const has = (w: string) => [...have].some((h) => h === w || (!/\d/.test(w) && w.length >= 3 && h.startsWith(w)));
  const missing = wanted.filter((w) => !has(w));
  const queryFit: ProductExtraction['queryFit'] =
    wanted.length > 0 && missing.length === 0 ? 'matches' : missing.some((w) => /\d/.test(w)) && model ? 'conflicts' : 'unclear';

  return {
    category,
    brand,
    model,
    attributes,
    normalizedName,
    queryFit,
    queryFitNote:
      queryFit === 'matches'
        ? 'Listing names the product you are hunting for'
        : queryFit === 'conflicts'
          ? `Listing names a different model (no ${missing.join(', ')})`
          : missing.length > 0
            ? `Listing doesn't clearly say ${missing.join(', ')}`
            : 'Nothing specific to compare',
    confidence: brand && model ? 'high' : brand || model ? 'medium' : 'low',
  };
}

const RISK_RULES: readonly [ConditionRiskAssessment['riskFactors'][number]['code'], 'low' | 'medium' | 'high', RegExp, string][] = [
  ['not_working', 'high', /\b(?:not working|does(?:n't| not) (?:power|turn) on|won'?t turn on|for parts)\b/i, 'Described as faulty or for parts'],
  ['locked_or_blacklisted', 'high', /\b(?:icloud locked|activation lock(?:ed)?|blacklisted|blocked imei|network locked|carrier locked)\b/i, 'Mentions a lock or blacklist'],
  ['damage_mentioned', 'medium', /\b(?:cracked|cracks?|broken|shattered|water damage|dented|dents?)\b/i, 'Mentions damage'],
  ['damage_mentioned', 'low', /\b(?:scratch(?:es|ed)?|scuff(?:s|ed)?|signs of use|wear)\b/i, 'Mentions cosmetic wear'],
  ['sold_as_is', 'medium', /\b(?:sold as is|as-is|no returns)\b/i, 'Sold as is / no returns'],
  ['missing_accessories', 'low', /\b(?:no (?:charger|box|cable|accessories)|(?:charger|box|cable) not included|(?:phone|console|unit) only)\b/i, 'Accessories missing'],
];

const STALE_AFTER_DAYS = 30;
const MIN_DESCRIPTION_CHARS = 40;

function assessRisk(listing: ListingFacts, asOf: string): ConditionRiskAssessment {
  const fields: TextField[] = ['title', 'description', 'conditionText'];
  const factors: ConditionRiskAssessment['riskFactors'] = [];
  for (const [code, severity, pattern, note] of RISK_RULES) {
    if (factors.some((f) => f.code === code)) continue; // first (most severe) wording wins
    const hit = find(listing, pattern, fields);
    if (hit) factors.push({ code, severity, note: `${note}: "${hit.value}"`, evidence: hit.evidence });
  }
  const fact = (field: 'price' | 'listedAt' | 'photoCount' | 'description'): Evidence => ({
    source: 'listing_field',
    field,
    value: factValue(listing, field),
  });
  if ((listing.description?.trim().length ?? 0) < MIN_DESCRIPTION_CHARS) {
    factors.push({ code: 'vague_description', severity: 'low', note: 'Very little description', evidence: fact('description') });
  }
  if (listing.photoCount === 0) factors.push({ code: 'no_photos', severity: 'medium', note: 'No photos', evidence: fact('photoCount') });
  if (!listing.price) factors.push({ code: 'no_price', severity: 'low', note: 'No price shown', evidence: fact('price') });
  if (listing.listedAt) {
    const days = Math.floor((Date.parse(asOf) - Date.parse(listing.listedAt)) / 86_400_000);
    if (days > STALE_AFTER_DAYS) {
      factors.push({ code: 'stale_listing', severity: 'low', note: `Listed ${days} days ago`, evidence: fact('listedAt') });
    }
  }

  const classified = classifyCondition(listing.conditionText);
  const faulty = factors.find((f) => f.code === 'not_working');
  const conditionCategory = classified ?? (faulty ? 'for_parts' : 'unknown');
  const conditionEvidence: Evidence | null = classified
    ? { source: 'text', field: 'conditionText', quote: listing.conditionText! }
    : faulty
      ? faulty.evidence
      : null;

  const severities = new Set(factors.map((f) => f.severity));
  const riskLevel: ConditionRiskAssessment['riskLevel'] = severities.has('high')
    ? 'high'
    : severities.has('medium')
      ? 'medium'
      : listing.description === null && listing.conditionText === null
        ? 'unknown'
        : 'low';

  const text = [listing.title, listing.description ?? '', listing.conditionText ?? ''].join(' ');
  const category = extract(listing, '').category;
  const portable = category === 'phone' || category === 'tablet' || category === 'computer' || category === 'audio';
  const questions: ConditionRiskAssessment['missingInformation'] = [];
  if (listing.photoCount === 0) questions.push({ topic: 'photos', question: 'Can you send photos of the front, back and screen?' });
  if (conditionCategory === 'unknown') questions.push({ topic: 'condition', question: 'What condition is it in - any scratches, dents or faults?' });
  if (portable && !/\bbattery\b/i.test(text)) questions.push({ topic: 'battery', question: 'What is the battery health, or how long does it last?' });
  if ((category === 'phone' || category === 'tablet') && !/\b(unlocked|icloud|activation|signed out)\b/i.test(text)) {
    questions.push({ topic: 'lock_status', question: 'Is it unlocked and signed out of all accounts?' });
  }
  if (!/\b(charger|cable|box|controller|accessor\w*|included)\b/i.test(text)) {
    questions.push({ topic: 'accessories', question: "What's included (charger, cable, box)?" });
  }
  if (!listing.price) questions.push({ topic: 'price', question: 'What price are you asking?' });
  if (factors.some((f) => f.code === 'stale_listing')) questions.push({ topic: 'availability', question: 'Is it still available?' });

  return {
    conditionCategory,
    conditionEvidence,
    riskLevel,
    riskFactors: factors,
    missingInformation: questions,
    seller: { status: 'not_available', note: "Seller history isn't available from this source yet" },
  };
}

const POSITIVE_TEXT: Readonly<Record<string, string>> = {
  relevance: "Matches what you're hunting for",
  price: 'At or under your max price',
  condition: 'In a condition you accept',
  geography: 'Within your search area',
  exclusions: 'None of your ignored words',
};

function formatMoney(money: Money): string {
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency: money.currency }).resolvedOptions().maximumFractionDigits ?? 2;
    return new Intl.NumberFormat('en', { style: 'currency', currency: money.currency }).format(money.amountMinor / 10 ** digits);
  } catch {
    return `${money.currency} ${money.amountMinor}`;
  }
}

function explain(input: DealExplanationInput): DealExplanation {
  const { listing, product, risk } = input;
  const name = product.normalizedName ?? listing.title;
  const price = listing.price ? formatMoney(listing.price) : 'no price shown';

  const positives: ExplanationPoint[] = input.matchChecks
    .filter((c) => c.outcome === 'pass' && POSITIVE_TEXT[c.check])
    .map((c) => ({ text: POSITIVE_TEXT[c.check]!, basis: { kind: 'match_check', check: c.check } }));
  if (product.queryFit === 'matches' && product.normalizedName) {
    positives.unshift({ text: `Identified as ${product.normalizedName}`, basis: { kind: 'product', field: 'queryFit' } });
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  const concerns: ExplanationPoint[] = [
    ...(product.queryFit === 'conflicts' ? [{ text: product.queryFitNote, basis: { kind: 'product', field: 'queryFit' } } as const] : []),
    ...[...risk.riskFactors]
      .sort((a, b) => order[a.severity] - order[b.severity])
      .map((f): ExplanationPoint => ({ text: f.note, basis: { kind: 'risk_factor', code: f.code } })),
    ...input.matchChecks
      .filter((c) => c.outcome === 'unverified')
      .map((c): ExplanationPoint => ({ text: c.detail, basis: { kind: 'match_check', check: c.check } })),
  ].slice(0, 8);

  const nextStep: DealExplanation['nextStep'] =
    risk.riskLevel === 'high' || product.queryFit === 'conflicts'
      ? 'skip'
      : risk.riskLevel === 'medium' || risk.riskLevel === 'unknown' || risk.missingInformation.length > 0
        ? 'ask_seller'
        : 'review';
  const advice = {
    skip: 'Probably not worth pursuing.',
    ask_seller: 'Worth a message to the seller before deciding.',
    review: 'Looks straightforward - review it yourself.',
  }[nextStep];

  return {
    headline: `${name} - ${price}`.slice(0, 140),
    summary: [
      `${name} on ${listing.marketplace}, ${price}.`,
      `${positives.length} point${positives.length === 1 ? '' : 's'} in its favour, ${concerns.length} to check.`,
      advice,
      'Resale value and profit are not estimated yet.',
    ].join(' '),
    positives: positives.slice(0, 8),
    concerns,
    valuation: { status: 'unavailable', reason: 'No comparable sales data is available yet, so resale value and profit are not estimated' },
    nextStep,
    questionsForSeller: risk.missingInformation.map((q) => q.question).slice(0, 6),
  };
}

const meta = (task: keyof typeof TASK_VERSIONS): AIResultMeta => ({
  provider: 'mock',
  ...MOCK_MODEL,
  promptVersion: TASK_VERSIONS[task],
  schemaVersion: AI_SCHEMA_VERSION,
  latencyMs: 0,
  usage: null,
  requestId: null,
});

/** Raw mock (unvalidated). Prefer `createMockAIProvider()`. */
export class MockAIProvider implements AIProvider {
  readonly id = 'mock' as const;

  async extractProduct(input: ProductExtractionInput): Promise<AIResult<ProductExtraction>> {
    return { output: extract(input.listing, input.hunt.query), meta: meta('extractProduct') };
  }

  async assessConditionRisk(input: ConditionRiskInput): Promise<AIResult<ConditionRiskAssessment>> {
    return { output: assessRisk(input.listing, input.asOf), meta: meta('assessConditionRisk') };
  }

  async explainDeal(input: DealExplanationInput): Promise<AIResult<DealExplanation>> {
    return { output: explain(input), meta: meta('explainDeal') };
  }
}
