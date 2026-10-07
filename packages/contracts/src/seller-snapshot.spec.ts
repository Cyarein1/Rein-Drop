import { describe, expect, it } from 'vitest';
import {
  answeredQuestionCount,
  DEAL_CRITERIA,
  HUNT_CATEGORIES,
  IMPROVEMENT_GOALS,
  RESELLER_INTENT_COPY,
  RESELLER_STAGES,
  saveSellerSnapshotRequestSchema,
  SELLER_SNAPSHOT_COPY,
  sellerSnapshotStatus,
  SELLER_SNAPSHOT_QUESTION_COUNT,
  sellerSnapshotSchema,
  SOURCING_CHANNELS,
  updateSellerSnapshotRequestSchema,
  type SellerSnapshot,
} from './index.js';

const EMPTY: SellerSnapshot = {
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

const problems = (input: unknown) =>
  updateSellerSnapshotRequestSchema.safeParse(input).error?.issues.map((i) => i.path.join('.')) ?? [];

describe('Seller Snapshot questions', () => {
  it('has the five Blueprint questions with copy for every option', () => {
    expect(SELLER_SNAPSHOT_QUESTION_COUNT).toBe(5);
    expect(Object.keys(SELLER_SNAPSHOT_COPY)).toHaveLength(5);
    const pairs = [
      [HUNT_CATEGORIES, SELLER_SNAPSHOT_COPY.categories.options],
      [RESELLER_STAGES, SELLER_SNAPSHOT_COPY.stage.options],
      [SOURCING_CHANNELS, SELLER_SNAPSHOT_COPY.sources.options],
      [DEAL_CRITERIA, SELLER_SNAPSHOT_COPY.dealRule.options],
      [IMPROVEMENT_GOALS, SELLER_SNAPSHOT_COPY.improvementGoal.options],
    ] as const;
    for (const [keys, labels] of pairs) expect(Object.keys(labels)).toEqual([...keys]);
  });
});

describe('updateSellerSnapshotRequestSchema', () => {
  it('accepts saving a single answer (progressive onboarding)', () => {
    expect(updateSellerSnapshotRequestSchema.parse({ stage: 'side_income' })).toEqual({ stage: 'side_income' });
  });

  it('requires at least one answer and at least one option per multi-select', () => {
    expect(updateSellerSnapshotRequestSchema.safeParse({}).success).toBe(false);
    expect(problems({ categories: [] })).toEqual(['categories']);
    expect(problems({ sources: ['ebay', 'ebay'] })).toEqual(['sources']);
  });

  it('rejects unknown options', () => {
    expect(problems({ categories: ['jewelry'] })).toEqual(['categories.0']);
    expect(problems({ improvementGoal: 'get_rich' })).toEqual(['improvementGoal']);
  });

  it('only accepts "Other" text when Other is selected', () => {
    expect(problems({ categories: ['gaming'], categoriesOther: 'Vinyl' })).toEqual(['categoriesOther']);
    expect(problems({ categories: ['other'], categoriesOther: ' Vinyl ' })).toEqual([]);
    expect(problems({ sources: ['ebay'], sourcesOther: 'Garage sales' })).toEqual(['sourcesOther']);
  });

  it('validates the deal rule target for its criterion', () => {
    const ok = (dealRule: unknown) => updateSellerSnapshotRequestSchema.safeParse({ dealRule }).success;
    expect(ok({ criterion: 'min_profit', target: { amountMinor: 15000, currency: 'USD' } })).toBe(true);
    expect(ok({ criterion: 'min_profit', target: null })).toBe(true);
    expect(ok({ criterion: 'min_profit', target: { amountMinor: 0, currency: 'USD' } })).toBe(false);
    expect(ok({ criterion: 'min_margin', targetPercent: 25 })).toBe(true);
    expect(ok({ criterion: 'min_margin', targetPercent: 250 })).toBe(false);
    expect(ok({ criterion: 'case_by_case' })).toBe(true);
    expect(ok({ criterion: 'gut_feeling' })).toBe(false);
  });
});

describe('saveSellerSnapshotRequestSchema', () => {
  const full = {
    categories: ['phones_tablets'],
    stage: 'side_income',
    sources: ['facebook_marketplace', 'ebay'],
    dealRule: { criterion: 'min_margin', targetPercent: 30 },
    improvementGoal: 'find_deals_faster',
  };

  it('requires all five answers and defaults "Other" text to null', () => {
    expect(saveSellerSnapshotRequestSchema.parse(full)).toEqual({ ...full, categoriesOther: null, sourcesOther: null });
    const { improvementGoal: _omitted, ...missingOne } = full;
    const issues = saveSellerSnapshotRequestSchema.safeParse(missingOne).error?.issues ?? [];
    expect(issues.map((i) => i.path.join('.'))).toEqual(['improvementGoal']);
  });

  it('applies the same "Other" rule as PATCH', () => {
    const result = saveSellerSnapshotRequestSchema.safeParse({ ...full, sourcesOther: 'Garage sales' });
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual(['sourcesOther']);
  });

  it('has no geography fields (location belongs to Hunts)', () => {
    const keys = [
      ...Object.keys(saveSellerSnapshotRequestSchema.parse(full)),
      ...Object.keys(sellerSnapshotSchema.shape),
    ];
    expect(keys.filter((k) => /location|radius|lat|lng|lon|city|postal|zip|address|geo/i.test(k))).toEqual([]);
  });
});

describe('reseller gate', () => {
  it('is separate from the five profile questions', () => {
    expect(SELLER_SNAPSHOT_QUESTION_COUNT).toBe(5);
    expect(Object.keys(SELLER_SNAPSHOT_COPY)).not.toContain('isReseller');
    expect(RESELLER_INTENT_COPY.comingSoon.title).toBe('Coming soon');
  });

  it('PATCH accepts the gate answer on its own', () => {
    expect(updateSellerSnapshotRequestSchema.parse({ isReseller: false })).toEqual({ isReseller: false });
    expect(updateSellerSnapshotRequestSchema.safeParse({ isReseller: 'yes' }).success).toBe(false);
  });

  it('derives the status', () => {
    expect(sellerSnapshotStatus(null, EMPTY)).toBe('not_started');
    expect(sellerSnapshotStatus(false, EMPTY)).toBe('not_reseller');
    expect(sellerSnapshotStatus(true, { ...EMPTY, stage: 'side_income' })).toBe('in_progress');
    expect(
      sellerSnapshotStatus(true, {
        categories: ['tools'],
        stage: 'side_income',
        sources: ['ebay'],
        dealRule: { criterion: 'case_by_case' },
        improvementGoal: 'track_profit',
      }),
    ).toBe('complete');
  });
});

describe('answeredQuestionCount', () => {
  it('counts answered questions for "n of 5" progress', () => {
    expect(answeredQuestionCount(EMPTY)).toBe(0);
    const partial = { ...EMPTY, categories: ['phones_tablets'], stage: 'side_income' } as SellerSnapshot;
    expect(answeredQuestionCount(partial)).toBe(2);
    const full: SellerSnapshot = {
      ...partial,
      isReseller: true,
      status: 'complete',
      sources: ['facebook_marketplace', 'ebay'],
      dealRule: { criterion: 'min_profit', target: { amountMinor: 15000, currency: 'USD' } },
      improvementGoal: 'stop_checking_marketplaces',
      completedAt: '2026-10-07T02:00:00.000Z',
      updatedAt: '2026-10-07T02:00:00.000Z',
    };
    expect(sellerSnapshotSchema.safeParse(full).success).toBe(true);
    expect(answeredQuestionCount(full)).toBe(5);
  });
});
