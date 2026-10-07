import { criteriaOf, defaultHuntName, diffCriteria, toHunt, toHuntColumns, type HuntRow } from './hunts.mapper.js';

const T = new Date('2026-10-07T05:00:00.000Z');

function row(overrides: Partial<HuntRow> = {}): HuntRow {
  return {
    id: '01990000-0000-7000-8000-000000000001',
    userId: '01990000-0000-7000-8000-000000000002',
    name: 'Switch',
    query: 'nintendo switch oled',
    status: 'DRAFT',
    priority: 'NORMAL',
    locationText: null,
    radiusKm: null,
    conditions: [],
    maxPriceMinor: null,
    priceCurrency: null,
    targetProfitMinor: null,
    targetMarginPercent: null,
    exclusions: [],
    createdAt: T,
    updatedAt: T,
    lastEditedAt: null,
    activatedAt: null,
    pausedAt: null,
    archivedAt: null,
    marketplaces: [],
    ...overrides,
  };
}

const link = (key: string, isEnabled = true) => ({
  huntId: 'h',
  marketplaceId: `m-${key}`,
  isEnabled,
  createdAt: T,
  updatedAt: T,
  marketplace: { key },
});

describe('toHunt', () => {
  it('maps columns to the contract and shows only enabled marketplaces', () => {
    const hunt = toHunt(
      row({
        marketplaces: [link('facebook'), link('ebay', false)],
        locationText: 'Cape Town',
        radiusKm: 40,
        conditions: ['used', 'unknown-condition'],
        maxPriceMinor: 200_00,
        priceCurrency: 'USD',
        targetProfitMinor: 50_00,
        exclusions: ['broken'],
      }),
    );
    expect(hunt).toMatchObject({
      marketplaces: ['facebook'],
      location: { text: 'Cape Town', radiusKm: 40 },
      conditions: ['used'],
      maxPrice: { amountMinor: 200_00, currency: 'USD' },
      target: { kind: 'profit', amount: { amountMinor: 50_00, currency: 'USD' } },
      exclusions: ['broken'],
      createdAt: T.toISOString(),
      lastEditedAt: null,
    });
  });

  it('maps a margin target', () => {
    expect(toHunt(row({ targetMarginPercent: 30 })).target).toEqual({ kind: 'margin', percent: 30 });
  });
});

describe('toHuntColumns', () => {
  it('stores one currency and only one target kind', () => {
    const base = criteriaOf(toHunt(row()));
    expect(
      toHuntColumns({ ...base, target: { kind: 'profit', amount: { amountMinor: 40_00, currency: 'USD' } } }),
    ).toMatchObject({ priceCurrency: 'USD', targetProfitMinor: 40_00, targetMarginPercent: null, maxPriceMinor: null });
    expect(toHuntColumns({ ...base, target: { kind: 'margin', percent: 25 } })).toMatchObject({
      priceCurrency: null,
      targetProfitMinor: null,
      targetMarginPercent: 25,
    });
  });
});

describe('diffCriteria', () => {
  it('lists only changed fields with before/after', () => {
    const before = criteriaOf(toHunt(row({ marketplaces: [link('ebay')] })));
    const after = { ...before, marketplaces: ['ebay', 'facebook'] as const, exclusions: ['broken'] };
    expect(diffCriteria(before, { ...after, marketplaces: [...after.marketplaces] })).toEqual({
      marketplaces: { before: ['ebay'], after: ['ebay', 'facebook'] },
      exclusions: { before: [], after: ['broken'] },
    });
    expect(diffCriteria(before, before)).toEqual({});
  });
});

describe('defaultHuntName', () => {
  it('uses the query, shortened to 100 characters', () => {
    expect(defaultHuntName('iphone 13')).toBe('iphone 13');
    expect(defaultHuntName('x'.repeat(150))).toHaveLength(100);
  });
});
