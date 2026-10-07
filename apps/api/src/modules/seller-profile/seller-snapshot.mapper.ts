import {
  currencySchema,
  DEAL_CRITERIA,
  HUNT_CATEGORIES,
  IMPROVEMENT_GOALS,
  RESELLER_STAGES,
  sellerSnapshotStatus,
  SOURCING_CHANNELS,
  type DealRule,
  type SellerSnapshot,
  type UpdateSellerSnapshotRequest,
} from '@rein-drop/contracts';
import type { SellerProfile } from '@rein-drop/db';

/** The SellerProfile columns that hold the Seller Snapshot. */
export type SnapshotRow = Pick<
  SellerProfile,
  | 'isReseller'
  | 'huntCategories'
  | 'huntCategoriesOther'
  | 'resellerStage'
  | 'sourcingChannels'
  | 'sourcingChannelsOther'
  | 'dealCriterion'
  | 'dealTargetAmountMinor'
  | 'dealTargetCurrency'
  | 'dealTargetMarginPercent'
  | 'improvementGoal'
  | 'snapshotCompletedAt'
  | 'updatedAt'
>;

/** Column values to write. Keys left undefined are not changed. */
export type SnapshotColumns = Partial<Omit<SnapshotRow, 'updatedAt'>>;

const oneOf =
  <T extends string>(options: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (options as readonly string[]).includes(value);

const isHuntCategory = oneOf(HUNT_CATEGORIES);
const isResellerStage = oneOf(RESELLER_STAGES);
const isSourcingChannel = oneOf(SOURCING_CHANNELS);
const isDealCriterion = oneOf(DEAL_CRITERIA);
const isImprovementGoal = oneOf(IMPROVEMENT_GOALS);

/**
 * DB row -> API contract. Stored values that are no longer valid options (the
 * option lists are product copy and may change - Blueprint section 22) are
 * treated as unanswered instead of failing the request.
 */
export function toSellerSnapshot(row: SnapshotRow | null): SellerSnapshot {
  if (!row) {
    return {
      isReseller: null,
      status: 'not_started',
      categories: [],
      categoriesOther: null,
      stage: null,
      sources: [],
      sourcesOther: null,
      dealRule: null,
      improvementGoal: null,
      completedAt: null,
      updatedAt: null,
    };
  }
  const categories = row.huntCategories.filter(isHuntCategory);
  const sources = row.sourcingChannels.filter(isSourcingChannel);
  const answers = {
    categories,
    stage: isResellerStage(row.resellerStage) ? row.resellerStage : null,
    sources,
    dealRule: toDealRule(row),
    improvementGoal: isImprovementGoal(row.improvementGoal) ? row.improvementGoal : null,
  };
  return {
    isReseller: row.isReseller,
    status: sellerSnapshotStatus(row.isReseller, answers),
    ...answers,
    categoriesOther: categories.includes('other') ? row.huntCategoriesOther : null,
    sourcesOther: sources.includes('other') ? row.sourcingChannelsOther : null,
    completedAt: row.snapshotCompletedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** True when the request contains any of the five profile answers (not just the gate). */
export function hasProfileAnswers(answers: UpdateSellerSnapshotRequest): boolean {
  const { isReseller: _gate, ...profile } = answers;
  return Object.values(profile).some((v) => v !== undefined);
}

function toDealRule(row: SnapshotRow): DealRule | null {
  if (!isDealCriterion(row.dealCriterion)) return null;
  switch (row.dealCriterion) {
    case 'min_profit':
    case 'max_buy_price': {
      const amount = row.dealTargetAmountMinor;
      const currency = currencySchema.safeParse(row.dealTargetCurrency);
      const target = amount !== null && amount > 0 && currency.success ? { amountMinor: amount, currency: currency.data } : null;
      return { criterion: row.dealCriterion, target };
    }
    case 'min_margin': {
      const p = row.dealTargetMarginPercent;
      return { criterion: 'min_margin', targetPercent: p !== null && p >= 1 && p <= 100 ? p : null };
    }
    case 'fast_resale':
    case 'case_by_case':
      return { criterion: row.dealCriterion };
  }
}

/**
 * Validated answers -> columns. Only questions present in the request change.
 * Dependent values never go stale: deselecting "Other" clears its text, and a new
 * deal rule rewrites every deal column (targets that do not apply become null).
 */
export function toSnapshotColumns(answers: UpdateSellerSnapshotRequest): SnapshotColumns {
  const columns: SnapshotColumns = {};

  if (answers.isReseller !== undefined) columns.isReseller = answers.isReseller;

  if (answers.categories !== undefined) {
    columns.huntCategories = answers.categories;
    if (!answers.categories.includes('other')) columns.huntCategoriesOther = null;
  }
  if (answers.categoriesOther !== undefined && answers.categories?.includes('other')) {
    columns.huntCategoriesOther = answers.categoriesOther;
  }

  if (answers.stage !== undefined) columns.resellerStage = answers.stage;

  if (answers.sources !== undefined) {
    columns.sourcingChannels = answers.sources;
    if (!answers.sources.includes('other')) columns.sourcingChannelsOther = null;
  }
  if (answers.sourcesOther !== undefined && answers.sources?.includes('other')) {
    columns.sourcingChannelsOther = answers.sourcesOther;
  }

  if (answers.dealRule !== undefined) {
    const rule = answers.dealRule;
    const money = 'target' in rule ? rule.target : null;
    columns.dealCriterion = rule.criterion;
    columns.dealTargetAmountMinor = money?.amountMinor ?? null;
    columns.dealTargetCurrency = money?.currency ?? null;
    columns.dealTargetMarginPercent = rule.criterion === 'min_margin' ? rule.targetPercent : null;
  }

  if (answers.improvementGoal !== undefined) columns.improvementGoal = answers.improvementGoal;

  return columns;
}
