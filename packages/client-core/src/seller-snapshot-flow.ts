import {
  OTHER_TEXT_MAX_LENGTH,
  RESELLER_INTENT_COPY,
  SELLER_SNAPSHOT_COPY,
  type DealCriterion,
  type HuntCategory,
  type ImprovementGoal,
  type ResellerStage,
  type SellerSnapshot,
  type SourcingChannel,
  type UpdateSellerSnapshotRequest,
} from '@rein-drop/contracts';
import type { HuntFormContext } from './hunt-form.js';
import { translator, type MessageKey, type Translator } from '@rein-drop/i18n';
import { formatMoney, moneyToInput, parseMoneyInput } from './money.js';

/**
 * The Seller Snapshot onboarding flow shared by web and mobile (App Flow Blueprint section 4,
 * Screenbook frames 03-08): the "Are you a reseller?" gate, five questions one per screen, then a
 * personalized summary that leads into the first Hunt. Every answer is saved when the user moves
 * on, so a refresh resumes where they left off.
 */

export const SNAPSHOT_QUESTIONS = ['categories', 'stage', 'sources', 'dealRule', 'improvementGoal'] as const;
export type SnapshotQuestion = (typeof SNAPSHOT_QUESTIONS)[number];
export type SnapshotStep = 'gate' | SnapshotQuestion | 'not_reseller' | 'summary';

export function isSnapshotQuestion(step: string): step is SnapshotQuestion {
  return (SNAPSHOT_QUESTIONS as readonly string[]).includes(step);
}

/** 1-5 for the questions ("2 of 5"), null for the other steps. */
export function questionNumber(step: SnapshotStep): number | null {
  return isSnapshotQuestion(step) ? SNAPSHOT_QUESTIONS.indexOf(step) + 1 : null;
}

/** Where to (re)start: the gate, the coming-soon screen, the first unanswered question, or the summary. */
export function resumeStep(snapshot: SellerSnapshot): SnapshotStep {
  switch (snapshot.status) {
    case 'not_started':
      return 'gate';
    case 'not_reseller':
      return 'not_reseller';
    case 'complete':
      return 'summary';
    case 'in_progress': {
      const answered: Record<SnapshotQuestion, boolean> = {
        categories: snapshot.categories.length > 0,
        stage: snapshot.stage !== null,
        sources: snapshot.sources.length > 0,
        dealRule: snapshot.dealRule !== null,
        improvementGoal: snapshot.improvementGoal !== null,
      };
      return SNAPSHOT_QUESTIONS.find((q) => !answered[q]) ?? 'summary';
    }
  }
}

export function nextStep(step: SnapshotQuestion | 'gate'): SnapshotStep {
  if (step === 'gate') return SNAPSHOT_QUESTIONS[0];
  return SNAPSHOT_QUESTIONS[SNAPSHOT_QUESTIONS.indexOf(step) + 1] ?? 'summary';
}

export function previousStep(step: SnapshotQuestion): SnapshotStep {
  return SNAPSHOT_QUESTIONS[SNAPSHOT_QUESTIONS.indexOf(step) - 1] ?? 'gate';
}

// ---------------------------------------------------------------------------
// Draft (answers as the user is editing them)
// ---------------------------------------------------------------------------

export interface SnapshotDraft {
  categories: HuntCategory[];
  categoriesOther: string;
  stage: ResellerStage | null;
  sources: SourcingChannel[];
  sourcesOther: string;
  dealCriterion: DealCriterion | null;
  /** Optional Q4 target as typed: an amount (major units) or a whole percent. */
  dealTarget: string;
  improvementGoal: ImprovementGoal | null;
}

export function snapshotDraft(snapshot: SellerSnapshot | null): SnapshotDraft {
  const rule = snapshot?.dealRule ?? null;
  let dealTarget = '';
  if (rule && (rule.criterion === 'min_profit' || rule.criterion === 'max_buy_price') && rule.target) {
    dealTarget = moneyToInput(rule.target);
  } else if (rule?.criterion === 'min_margin' && rule.targetPercent !== null) {
    dealTarget = String(rule.targetPercent);
  }
  return {
    categories: [...(snapshot?.categories ?? [])],
    categoriesOther: snapshot?.categoriesOther ?? '',
    stage: snapshot?.stage ?? null,
    sources: [...(snapshot?.sources ?? [])],
    sourcesOther: snapshot?.sourcesOther ?? '',
    dealCriterion: rule?.criterion ?? null,
    dealTarget,
    improvementGoal: snapshot?.improvementGoal ?? null,
  };
}

/** Whether the screen has a meaningful answer yet ("Next" stays disabled until it does). */
export function hasAnswer(step: SnapshotQuestion, draft: SnapshotDraft): boolean {
  switch (step) {
    case 'categories':
      return draft.categories.length > 0;
    case 'stage':
      return draft.stage !== null;
    case 'sources':
      return draft.sources.length > 0;
    case 'dealRule':
      return draft.dealCriterion !== null;
    case 'improvementGoal':
      return draft.improvementGoal !== null;
  }
}

export type StepUpdate = { ok: true; update: UpdateSellerSnapshotRequest } | { ok: false; error: string };

const otherText = (selected: boolean, text: string) => (selected && text.trim() ? text.trim() : null);

/** A context's translator, English when the caller passes only currency / locale (older callers). */
type WithT = { t?: Translator };
const EN = translator('en');
const tOf = (ctx: WithT): Translator => ctx.t ?? EN;

/** Validates one screen and builds the PATCH body that saves it. */
export function buildStepUpdate(step: SnapshotQuestion, draft: SnapshotDraft, ctx: Pick<HuntFormContext, 'currency'> & WithT): StepUpdate {
  const t = tOf(ctx);
  const otherTooLong = (text: string) => text.trim().length > OTHER_TEXT_MAX_LENGTH;
  switch (step) {
    case 'categories':
      if (draft.categories.length === 0) return { ok: false, error: t('onboarding.chooseAtLeastOne') };
      if (otherTooLong(draft.categoriesOther)) return { ok: false, error: t('onboarding.otherTooLong', { max: OTHER_TEXT_MAX_LENGTH }) };
      return {
        ok: true,
        update: { categories: draft.categories, categoriesOther: otherText(draft.categories.includes('other'), draft.categoriesOther) },
      };
    case 'stage':
      return draft.stage ? { ok: true, update: { stage: draft.stage } } : { ok: false, error: t('onboarding.chooseOne') };
    case 'sources':
      if (draft.sources.length === 0) return { ok: false, error: t('onboarding.chooseAtLeastOne') };
      if (otherTooLong(draft.sourcesOther)) return { ok: false, error: t('onboarding.otherTooLong', { max: OTHER_TEXT_MAX_LENGTH }) };
      return {
        ok: true,
        update: { sources: draft.sources, sourcesOther: otherText(draft.sources.includes('other'), draft.sourcesOther) },
      };
    case 'improvementGoal':
      return draft.improvementGoal ? { ok: true, update: { improvementGoal: draft.improvementGoal } } : { ok: false, error: t('onboarding.chooseOne') };
    case 'dealRule': {
      const criterion = draft.dealCriterion;
      if (!criterion) return { ok: false, error: t('onboarding.chooseOne') };
      const text = draft.dealTarget.trim();
      if (criterion === 'min_profit' || criterion === 'max_buy_price') {
        const parsed = parseMoneyInput(text, ctx.currency);
        if (!parsed.ok) return { ok: false, error: parsed.message };
        if (parsed.money && parsed.money.amountMinor <= 0) return { ok: false, error: t('onboarding.amountAboveZero') };
        return { ok: true, update: { dealRule: { criterion, target: parsed.money } } };
      }
      if (criterion === 'min_margin') {
        if (!text) return { ok: true, update: { dealRule: { criterion, targetPercent: null } } };
        const percent = Number(text.replace('%', '').trim());
        if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
          return { ok: false, error: t('onboarding.percentRange') };
        }
        return { ok: true, update: { dealRule: { criterion, targetPercent: percent } } };
      }
      return { ok: true, update: { dealRule: { criterion } } };
    }
  }
}

// ---------------------------------------------------------------------------
// Copy that depends on the user's locale
// ---------------------------------------------------------------------------

/** Narrow currency symbol for the user's locale, e.g. "R", "$", "£". */
export function currencySymbol(ctx: Pick<HuntFormContext, 'currency' | 'localeTag'>): string {
  try {
    const parts = new Intl.NumberFormat(ctx.localeTag, { style: 'currency', currency: ctx.currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? ctx.currency;
  } catch {
    return ctx.currency;
  }
}


// ---------------------------------------------------------------------------
// Question and option text in the UI language
// ---------------------------------------------------------------------------

const QUESTION_KEY: Record<SnapshotQuestion, MessageKey> = {
  categories: 'onboarding.categoriesQuestion',
  stage: 'onboarding.stageQuestion',
  sources: 'onboarding.sourcesQuestion',
  dealRule: 'onboarding.dealRuleQuestion',
  improvementGoal: 'onboarding.goalQuestion',
};
const CATEGORY_KEY: Record<HuntCategory, MessageKey> = {
  phones_tablets: 'onboarding.categoryPhonesTablets',
  computers: 'onboarding.categoryComputers',
  gaming: 'onboarding.categoryGaming',
  cameras: 'onboarding.categoryCameras',
  sneakers_fashion: 'onboarding.categorySneakersFashion',
  collectibles: 'onboarding.categoryCollectibles',
  tools: 'onboarding.categoryTools',
  auto_parts: 'onboarding.categoryAutoParts',
  other: 'onboarding.categoryOther',
};
const STAGE_KEY: Record<ResellerStage, MessageKey> = {
  getting_started: 'onboarding.stageGettingStarted',
  side_income: 'onboarding.stageSideIncome',
  regular_reseller: 'onboarding.stageRegularReseller',
  full_time: 'onboarding.stageFullTime',
  team_store: 'onboarding.stageTeamStore',
};
const SOURCE_KEY: Record<SourcingChannel, MessageKey> = {
  facebook_marketplace: 'onboarding.sourceFacebookMarketplace',
  ebay: 'onboarding.sourceEbay',
  local_classifieds: 'onboarding.sourceLocalClassifieds',
  thrift_retail: 'onboarding.sourceThriftRetail',
  auctions: 'onboarding.sourceAuctions',
  other: 'onboarding.sourceOther',
};
const DEAL_KEY: Record<DealCriterion, MessageKey> = {
  min_profit: 'onboarding.dealMinProfit',
  min_margin: 'onboarding.dealMinMargin',
  max_buy_price: 'onboarding.dealMaxBuyPrice',
  fast_resale: 'onboarding.dealFastResale',
  case_by_case: 'onboarding.dealCaseByCase',
};
const GOAL_KEY: Record<ImprovementGoal, MessageKey> = {
  find_deals_faster: 'onboarding.goalFindDealsFaster',
  stop_checking_marketplaces: 'onboarding.goalStopChecking',
  find_better_margins: 'onboarding.goalBetterMargins',
  miss_fewer_listings: 'onboarding.goalMissFewer',
  know_what_to_buy: 'onboarding.goalKnowWhatToBuy',
  track_profit: 'onboarding.goalTrackProfit',
};
const OPTION_KEYS = { categories: CATEGORY_KEY, stage: STAGE_KEY, sources: SOURCE_KEY, improvementGoal: GOAL_KEY } as const;

/** A question's text in the UI language. Use this; SELLER_SNAPSHOT_COPY[q].question will be removed in step 89. */
export function snapshotQuestionText(question: SnapshotQuestion, t: Translator): string {
  return t(QUESTION_KEY[question]);
}

/** The "Are you a reseller?" gate in the UI language (same shape). Use this; SNAPSHOT_GATE_COPY will be removed in step 89. */
export function snapshotGateCopy(t: Translator): {
  question: string;
  options: { yes: string; no: string };
  comingSoon: { title: string; body: string };
} {
  return {
    question: t('onboarding.gateQuestion'),
    options: { yes: t('onboarding.gateYes'), no: t('onboarding.gateNo') },
    comingSoon: { title: t('onboarding.comingSoonTitle'), body: t('onboarding.comingSoonBody') },
  };
}

/** Q4 options with the user's currency instead of a hard-coded "$". */
export function dealCriterionOptions(ctx: Pick<HuntFormContext, 'currency' | 'localeTag'> & WithT): { value: DealCriterion; label: string }[] {
  const t = tOf(ctx);
  const symbol = currencySymbol(ctx);
  return (Object.keys(SELLER_SNAPSHOT_COPY.dealRule.options) as DealCriterion[]).map((value) => ({ value, label: t(DEAL_KEY[value], { symbol }) }));
}

/** The optional number Q4 asks for, if the chosen criterion has one. */
export function dealTargetField(
  criterion: DealCriterion | null,
  ctx: Pick<HuntFormContext, 'currency'> & WithT,
): { kind: 'money' | 'percent'; label: string } | null {
  const t = tOf(ctx);
  switch (criterion) {
    case 'min_profit':
      return { kind: 'money', label: t('onboarding.targetMinProfit', { currency: ctx.currency }) };
    case 'max_buy_price':
      return { kind: 'money', label: t('onboarding.targetMaxBuyPrice', { currency: ctx.currency }) };
    case 'min_margin':
      return { kind: 'percent', label: t('onboarding.targetMinMargin') };
    default:
      return null;
  }
}

/** Options for a question as {value, label} pairs, in the Blueprint's order, in the UI language. */
export function questionOptions<Q extends 'categories' | 'stage' | 'sources' | 'improvementGoal'>(question: Q, t: Translator = EN) {
  type Value = keyof (typeof SELLER_SNAPSHOT_COPY)[Q]['options'] & string;
  const keys = OPTION_KEYS[question] as Record<string, MessageKey>;
  return Object.keys(SELLER_SNAPSHOT_COPY[question].options).map((value) => ({ value: value as Value, label: t(keys[value]!) }));
}

/** English gate copy (contracts). Prefer snapshotGateCopy(t); this will be removed in step 89. */
export const SNAPSHOT_GATE_COPY = RESELLER_INTENT_COPY;
export { SELLER_SNAPSHOT_COPY, SELLER_SNAPSHOT_QUESTION_COUNT, answeredQuestionCount } from '@rein-drop/contracts';

// ---------------------------------------------------------------------------
// Summary ("Rein Drop will prioritize...") and the answers list for Settings
// ---------------------------------------------------------------------------

function joinList(items: string[], t: Translator): string {
  if (items.length <= 1) return items[0] ?? '';
  return t('onboarding.listAnd', { items: items.slice(0, -1).join(', '), last: items.at(-1) });
}

/** Answers as they read inside a sentence (lower case in English). */
const CATEGORY_INLINE_KEY: Record<Exclude<HuntCategory, 'other'>, MessageKey> = {
  phones_tablets: 'onboarding.inlinePhonesTablets',
  computers: 'onboarding.inlineComputers',
  gaming: 'onboarding.inlineGaming',
  cameras: 'onboarding.inlineCameras',
  sneakers_fashion: 'onboarding.inlineSneakersFashion',
  collectibles: 'onboarding.inlineCollectibles',
  tools: 'onboarding.inlineTools',
  auto_parts: 'onboarding.inlineAutoParts',
};
const SOURCE_INLINE_KEY: Record<'local_classifieds' | 'thrift_retail' | 'auctions', MessageKey> = {
  local_classifieds: 'onboarding.inlineLocalClassifieds',
  thrift_retail: 'onboarding.inlineThriftRetail',
  auctions: 'onboarding.inlineAuctions',
};

/** Marketplace names (never translated). */
const SUPPORTED_SOURCES: Partial<Record<SourcingChannel, string>> = {
  facebook_marketplace: 'Facebook Marketplace',
  ebay: 'eBay',
};

function categoryNames(snapshot: SellerSnapshot, t: Translator): string[] {
  return snapshot.categories.map((c) => (c === 'other' ? (snapshot.categoriesOther ?? t('onboarding.inlineOtherItems')) : t(CATEGORY_INLINE_KEY[c])));
}

function sourceNames(snapshot: SellerSnapshot, t: Translator): string[] {
  return snapshot.sources.map((s) => {
    if (s === 'other') return snapshot.sourcesOther ?? t('onboarding.inlineOtherPlaces');
    return SUPPORTED_SOURCES[s] ?? t(SOURCE_INLINE_KEY[s as keyof typeof SOURCE_INLINE_KEY]);
  });
}

export interface SnapshotSummary {
  /** Echoes the answers back, e.g. "Got it. You hunt for phones & tablets, ...". */
  sentence: string;
  /** What the answers change in the product right now - only things it actually does. */
  priorities: string[];
}

/**
 * The personalized transition after question 5 (Blueprint section 4). Priorities only describe
 * what the answers really drive today: Hunt suggestions, default marketplaces and deal thresholds.
 */
export function snapshotSummary(snapshot: SellerSnapshot, ctx: HuntFormContext): SnapshotSummary {
  const { t } = ctx;
  const money = (m: Parameters<typeof formatMoney>[0]) => formatMoney(m, ctx.localeTag);
  const rule = snapshot.dealRule;
  // `deal` picks the clause inside the one summary message; `target` fills it.
  let deal: string;
  let target: string | number | null = null;
  let dealPriority: string;
  switch (rule?.criterion) {
    case 'min_profit':
      deal = rule.target ? 'min_profit' : 'min_profit_open';
      target = rule.target ? money(rule.target) : null;
      dealPriority = rule.target ? t('onboarding.priorityMinProfit', { amount: money(rule.target) }) : t('onboarding.priorityProfit');
      break;
    case 'min_margin':
      deal = rule.targetPercent ? 'min_margin' : 'min_margin_open';
      target = rule.targetPercent || null;
      dealPriority = rule.targetPercent ? t('onboarding.priorityMinMargin', { percent: rule.targetPercent }) : t('onboarding.priorityMargin');
      break;
    case 'max_buy_price':
      deal = rule.target ? 'max_buy_price' : 'max_buy_price_open';
      target = rule.target ? money(rule.target) : null;
      dealPriority = rule.target ? t('onboarding.priorityMaxBuy', { amount: money(rule.target) }) : t('onboarding.priorityMaxBuyOpen');
      break;
    case 'fast_resale':
      deal = 'fast_resale';
      dealPriority = t('onboarding.priorityYourCall');
      break;
    default:
      deal = 'case_by_case';
      dealPriority = t('onboarding.priorityYourCall');
  }
  const categories = joinList(categoryNames(snapshot, t), t);
  const sentence = t('onboarding.summarySentence', {
    categories,
    sources: joinList(sourceNames(snapshot, t), t),
    deal,
    target: target ?? '',
    goal: snapshot.improvementGoal ?? 'none',
  });

  const supported = snapshot.sources.flatMap((s) => (SUPPORTED_SOURCES[s] ? [SUPPORTED_SOURCES[s]] : []));
  return {
    sentence,
    priorities: [
      t('onboarding.priorityHuntIdeas', { categories }),
      supported.length > 0
        ? t('onboarding.priorityMarketplaces', { marketplaces: joinList(supported, t), count: supported.length })
        : t('onboarding.priorityDefaultMarketplaces'),
      dealPriority,
    ],
  };
}

/** The answers as label/value rows (Settings). Unanswered questions show "Not answered". */
export function snapshotAnswerRows(snapshot: SellerSnapshot, ctx: HuntFormContext): { question: string; answer: string }[] {
  const { t } = ctx;
  const none = t('onboarding.notAnswered');
  const options = dealCriterionOptions(ctx);
  const rule = snapshot.dealRule;
  let deal = none;
  if (rule) {
    const label = options.find((o) => o.value === rule.criterion)?.label ?? rule.criterion;
    const target =
      (rule.criterion === 'min_profit' || rule.criterion === 'max_buy_price') && rule.target
        ? formatMoney(rule.target, ctx.localeTag)
        : rule.criterion === 'min_margin' && rule.targetPercent
          ? t('onboarding.percent', { value: rule.targetPercent })
          : null;
    deal = target ? t('onboarding.dealAnswer', { label, target }) : label;
  }
  const list = (labels: string[]) => (labels.length > 0 ? labels.join(', ') : none);
  const other = (text: string | null, key: MessageKey) => (text ? t('onboarding.otherWithText', { text }) : t(key));
  return [
    {
      question: snapshotQuestionText('categories', t),
      answer: list(snapshot.categories.map((c) => (c === 'other' ? other(snapshot.categoriesOther, CATEGORY_KEY.other) : t(CATEGORY_KEY[c])))),
    },
    { question: snapshotQuestionText('stage', t), answer: snapshot.stage ? t(STAGE_KEY[snapshot.stage]) : none },
    {
      question: snapshotQuestionText('sources', t),
      answer: list(snapshot.sources.map((s) => (s === 'other' ? other(snapshot.sourcesOther, SOURCE_KEY.other) : t(SOURCE_KEY[s])))),
    },
    { question: snapshotQuestionText('dealRule', t), answer: deal },
    {
      question: snapshotQuestionText('improvementGoal', t),
      answer: snapshot.improvementGoal ? t(GOAL_KEY[snapshot.improvementGoal]) : none,
    },
  ];
}
