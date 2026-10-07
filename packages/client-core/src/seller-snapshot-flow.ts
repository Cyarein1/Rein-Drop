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

/** Validates one screen and builds the PATCH body that saves it. */
export function buildStepUpdate(step: SnapshotQuestion, draft: SnapshotDraft, ctx: Pick<HuntFormContext, 'currency'>): StepUpdate {
  const otherTooLong = (text: string) => text.trim().length > OTHER_TEXT_MAX_LENGTH;
  switch (step) {
    case 'categories':
      if (draft.categories.length === 0) return { ok: false, error: 'Choose at least one' };
      if (otherTooLong(draft.categoriesOther)) return { ok: false, error: `Keep "Other" under ${OTHER_TEXT_MAX_LENGTH} characters` };
      return {
        ok: true,
        update: { categories: draft.categories, categoriesOther: otherText(draft.categories.includes('other'), draft.categoriesOther) },
      };
    case 'stage':
      return draft.stage ? { ok: true, update: { stage: draft.stage } } : { ok: false, error: 'Choose one' };
    case 'sources':
      if (draft.sources.length === 0) return { ok: false, error: 'Choose at least one' };
      if (otherTooLong(draft.sourcesOther)) return { ok: false, error: `Keep "Other" under ${OTHER_TEXT_MAX_LENGTH} characters` };
      return {
        ok: true,
        update: { sources: draft.sources, sourcesOther: otherText(draft.sources.includes('other'), draft.sourcesOther) },
      };
    case 'improvementGoal':
      return draft.improvementGoal ? { ok: true, update: { improvementGoal: draft.improvementGoal } } : { ok: false, error: 'Choose one' };
    case 'dealRule': {
      const criterion = draft.dealCriterion;
      if (!criterion) return { ok: false, error: 'Choose one' };
      const text = draft.dealTarget.trim();
      if (criterion === 'min_profit' || criterion === 'max_buy_price') {
        const parsed = parseMoneyInput(text, ctx.currency);
        if (!parsed.ok) return { ok: false, error: parsed.message };
        if (parsed.money && parsed.money.amountMinor <= 0) return { ok: false, error: 'Enter an amount above 0, or leave it empty' };
        return { ok: true, update: { dealRule: { criterion, target: parsed.money } } };
      }
      if (criterion === 'min_margin') {
        if (!text) return { ok: true, update: { dealRule: { criterion, targetPercent: null } } };
        const percent = Number(text.replace('%', '').trim());
        if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
          return { ok: false, error: 'Enter a whole percent from 1 to 100, or leave it empty' };
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

/** Q4 options with the user's currency instead of a hard-coded "$". */
export function dealCriterionOptions(ctx: Pick<HuntFormContext, 'currency' | 'localeTag'>): { value: DealCriterion; label: string }[] {
  const symbol = currencySymbol(ctx);
  return (Object.entries(SELLER_SNAPSHOT_COPY.dealRule.options) as [DealCriterion, string][]).map(([value, label]) => ({
    value,
    label: label.replace('$', symbol),
  }));
}

/** The optional number Q4 asks for, if the chosen criterion has one. */
export function dealTargetField(
  criterion: DealCriterion | null,
  ctx: Pick<HuntFormContext, 'currency'>,
): { kind: 'money' | 'percent'; label: string } | null {
  switch (criterion) {
    case 'min_profit':
      return { kind: 'money', label: `Minimum profit per deal (${ctx.currency}, optional)` };
    case 'max_buy_price':
      return { kind: 'money', label: `Usual max buy price (${ctx.currency}, optional)` };
    case 'min_margin':
      return { kind: 'percent', label: 'Minimum margin (%, optional)' };
    default:
      return null;
  }
}

/** Options for a question as {value, label} pairs, in the Blueprint's order. */
export function questionOptions<Q extends 'categories' | 'stage' | 'sources' | 'improvementGoal'>(question: Q) {
  type Value = keyof (typeof SELLER_SNAPSHOT_COPY)[Q]['options'] & string;
  return Object.entries(SELLER_SNAPSHOT_COPY[question].options).map(([value, label]) => ({ value: value as Value, label: label as string }));
}

export const SNAPSHOT_GATE_COPY = RESELLER_INTENT_COPY;
export { SELLER_SNAPSHOT_COPY, SELLER_SNAPSHOT_QUESTION_COUNT, answeredQuestionCount } from '@rein-drop/contracts';

// ---------------------------------------------------------------------------
// Summary ("Rein Drop will prioritize...") and the answers list for Settings
// ---------------------------------------------------------------------------

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

const GOAL_PHRASE: Record<ImprovementGoal, string> = {
  find_deals_faster: 'find deals faster',
  stop_checking_marketplaces: 'stop checking marketplaces all day',
  find_better_margins: 'find better margins',
  miss_fewer_listings: 'miss fewer listings',
  know_what_to_buy: 'know what to buy',
  track_profit: 'track what actually makes you money',
};

const SUPPORTED_SOURCES: Partial<Record<SourcingChannel, string>> = {
  facebook_marketplace: 'Facebook Marketplace',
  ebay: 'eBay',
};

function categoryNames(snapshot: SellerSnapshot): string[] {
  return snapshot.categories.map((c) =>
    c === 'other' ? (snapshot.categoriesOther ?? 'other items') : lower(SELLER_SNAPSHOT_COPY.categories.options[c]),
  );
}

function sourceNames(snapshot: SellerSnapshot): string[] {
  return snapshot.sources.map((s) => {
    if (s === 'other') return snapshot.sourcesOther ?? 'other places';
    return SUPPORTED_SOURCES[s] ?? lower(SELLER_SNAPSHOT_COPY.sources.options[s]);
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
  const money = (m: Parameters<typeof formatMoney>[0]) => formatMoney(m, ctx.localeTag);
  const rule = snapshot.dealRule;
  let dealClause: string;
  let dealPriority: string;
  switch (rule?.criterion) {
    case 'min_profit':
      dealClause = rule.target ? `care most about ${money(rule.target)}+ profit` : 'care most about profit per deal';
      dealPriority = rule.target ? `Deals with at least ${money(rule.target)} profit` : 'Deals judged on profit';
      break;
    case 'min_margin':
      dealClause = rule.targetPercent ? `care most about ${rule.targetPercent}%+ margins` : 'care most about margins';
      dealPriority = rule.targetPercent ? `Deals with at least a ${rule.targetPercent}% margin` : 'Deals judged on margin';
      break;
    case 'max_buy_price':
      dealClause = rule.target ? `like to buy below ${money(rule.target)}` : 'like to buy below a set price';
      dealPriority = rule.target ? `Listings under ${money(rule.target)}` : 'Listings under your max buy price';
      break;
    case 'fast_resale':
      dealClause = 'care most about items that sell fast';
      dealPriority = 'Your call on each deal - no fixed money threshold';
      break;
    default:
      dealClause = 'decide case by case';
      dealPriority = 'Your call on each deal - no fixed money threshold';
  }
  const clauses = [
    `hunt for ${joinList(categoryNames(snapshot))}`,
    `source on ${joinList(sourceNames(snapshot))}`,
    dealClause,
  ];
  const goal = snapshot.improvementGoal ? GOAL_PHRASE[snapshot.improvementGoal] : null;
  const sentence = `Got it. You ${clauses.join(', ')}${goal ? `, and want to ${goal}` : ''}. Let's build your first Hunt.`;

  const supported = snapshot.sources.flatMap((s) => (SUPPORTED_SOURCES[s] ? [SUPPORTED_SOURCES[s]] : []));
  return {
    sentence,
    priorities: [
      `Hunt ideas for ${joinList(categoryNames(snapshot))}`,
      supported.length > 0
        ? `${joinList(supported)} as your starting marketplace${supported.length > 1 ? 's' : ''}`
        : 'eBay and Facebook Marketplace - the marketplaces Rein Drop covers today',
      dealPriority,
    ],
  };
}

/** The answers as label/value rows (Settings). Unanswered questions show "Not answered". */
export function snapshotAnswerRows(snapshot: SellerSnapshot, ctx: HuntFormContext): { question: string; answer: string }[] {
  const none = 'Not answered';
  const options = dealCriterionOptions(ctx);
  const rule = snapshot.dealRule;
  let deal = none;
  if (rule) {
    const label = options.find((o) => o.value === rule.criterion)?.label ?? rule.criterion;
    const target =
      (rule.criterion === 'min_profit' || rule.criterion === 'max_buy_price') && rule.target
        ? formatMoney(rule.target, ctx.localeTag)
        : rule.criterion === 'min_margin' && rule.targetPercent
          ? `${rule.targetPercent}%`
          : null;
    deal = target ? `${label}: ${target}` : label;
  }
  const list = (labels: string[]) => (labels.length > 0 ? labels.join(', ') : none);
  return [
    {
      question: SELLER_SNAPSHOT_COPY.categories.question,
      answer: list(snapshot.categories.map((c) => (c === 'other' && snapshot.categoriesOther ? `Other (${snapshot.categoriesOther})` : SELLER_SNAPSHOT_COPY.categories.options[c]))),
    },
    { question: SELLER_SNAPSHOT_COPY.stage.question, answer: snapshot.stage ? SELLER_SNAPSHOT_COPY.stage.options[snapshot.stage] : none },
    {
      question: SELLER_SNAPSHOT_COPY.sources.question,
      answer: list(snapshot.sources.map((s) => (s === 'other' && snapshot.sourcesOther ? `Other (${snapshot.sourcesOther})` : SELLER_SNAPSHOT_COPY.sources.options[s]))),
    },
    { question: SELLER_SNAPSHOT_COPY.dealRule.question, answer: deal },
    {
      question: SELLER_SNAPSHOT_COPY.improvementGoal.question,
      answer: snapshot.improvementGoal ? SELLER_SNAPSHOT_COPY.improvementGoal.options[snapshot.improvementGoal] : none,
    },
  ];
}
