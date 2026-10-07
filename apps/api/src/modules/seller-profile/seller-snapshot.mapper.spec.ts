import { toSellerSnapshot, toSnapshotColumns, type SnapshotRow } from './seller-snapshot.mapper.js';

const UPDATED = new Date('2026-10-07T03:00:00.000Z');

const row = (overrides: Partial<SnapshotRow> = {}): SnapshotRow => ({
  huntCategories: [],
  huntCategoriesOther: null,
  resellerStage: null,
  sourcingChannels: [],
  sourcingChannelsOther: null,
  dealCriterion: null,
  dealTargetAmountMinor: null,
  dealTargetCurrency: null,
  dealTargetMarginPercent: null,
  improvementGoal: null,
  snapshotCompletedAt: null,
  updatedAt: UPDATED,
  ...overrides,
});

describe('toSellerSnapshot', () => {
  it('returns an empty snapshot when there is no profile', () => {
    expect(toSellerSnapshot(null)).toMatchObject({ categories: [], stage: null, dealRule: null, updatedAt: null });
  });

  it('maps stored answers', () => {
    const snapshot = toSellerSnapshot(
      row({
        huntCategories: ['phones_tablets', 'other'],
        huntCategoriesOther: 'Vinyl',
        resellerStage: 'side_income',
        sourcingChannels: ['ebay'],
        dealCriterion: 'min_profit',
        dealTargetAmountMinor: 15000,
        dealTargetCurrency: 'USD',
        improvementGoal: 'track_profit',
        snapshotCompletedAt: UPDATED,
      }),
    );
    expect(snapshot).toEqual({
      categories: ['phones_tablets', 'other'],
      categoriesOther: 'Vinyl',
      stage: 'side_income',
      sources: ['ebay'],
      sourcesOther: null,
      dealRule: { criterion: 'min_profit', target: { amountMinor: 15000, currency: 'USD' } },
      improvementGoal: 'track_profit',
      completedAt: UPDATED.toISOString(),
      updatedAt: UPDATED.toISOString(),
    });
  });

  it('treats options that no longer exist as unanswered instead of failing', () => {
    const snapshot = toSellerSnapshot(
      row({ huntCategories: ['gaming', 'retired_option'], resellerStage: 'old_stage', dealCriterion: 'gone' }),
    );
    expect(snapshot.categories).toEqual(['gaming']);
    expect(snapshot.stage).toBeNull();
    expect(snapshot.dealRule).toBeNull();
  });

  it('drops an invalid stored target but keeps the criterion', () => {
    expect(toSellerSnapshot(row({ dealCriterion: 'min_margin', dealTargetMarginPercent: 500 })).dealRule).toEqual({
      criterion: 'min_margin',
      targetPercent: null,
    });
  });
});

describe('toSnapshotColumns', () => {
  it('only touches the questions in the request', () => {
    expect(toSnapshotColumns({ stage: 'full_time' })).toEqual({ resellerStage: 'full_time' });
  });

  it('clears "Other" text when Other is deselected, keeps it when Other stays without new text', () => {
    expect(toSnapshotColumns({ categories: ['gaming'] })).toEqual({
      huntCategories: ['gaming'],
      huntCategoriesOther: null,
    });
    expect(toSnapshotColumns({ sources: ['other', 'ebay'] })).toEqual({ sourcingChannels: ['other', 'ebay'] });
    expect(toSnapshotColumns({ sources: ['other'], sourcesOther: 'Garage sales' })).toEqual({
      sourcingChannels: ['other'],
      sourcingChannelsOther: 'Garage sales',
    });
  });

  it('rewrites every deal column so old targets never linger', () => {
    expect(toSnapshotColumns({ dealRule: { criterion: 'case_by_case' } })).toEqual({
      dealCriterion: 'case_by_case',
      dealTargetAmountMinor: null,
      dealTargetCurrency: null,
      dealTargetMarginPercent: null,
    });
    expect(
      toSnapshotColumns({ dealRule: { criterion: 'max_buy_price', target: { amountMinor: 30000, currency: 'USD' } } }),
    ).toEqual({
      dealCriterion: 'max_buy_price',
      dealTargetAmountMinor: 30000,
      dealTargetCurrency: 'USD',
      dealTargetMarginPercent: null,
    });
    expect(toSnapshotColumns({ dealRule: { criterion: 'min_margin', targetPercent: 25 } })).toMatchObject({
      dealTargetAmountMinor: null,
      dealTargetMarginPercent: 25,
    });
  });
});
