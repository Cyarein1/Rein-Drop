import { describe, expect, it } from 'vitest';
import type { SellerSnapshot, UserLocale } from '@rein-drop/contracts';
import {
  buildCreateHuntRequest,
  EMPTY_HUNT_FORM,
  formatMoney,
  huntFormContext,
  huntFormDefaults,
  huntReview,
  mapHuntErrors,
  needsLocation,
  parseExclusions,
  parseMoneyInput,
  queryPlaceholder,
  type HuntFormValues,
} from './index.js';

const ZA: UserLocale = { countryCode: 'ZA', currency: 'ZAR', distanceUnit: 'km', language: 'en', source: 'detected' };
const US: UserLocale = { countryCode: 'US', currency: 'USD', distanceUnit: 'mi', language: 'en', source: 'detected' };

const snapshot = (overrides: Partial<SellerSnapshot> = {}): SellerSnapshot => ({
  isReseller: true,
  status: 'complete',
  categories: ['gaming'],
  categoriesOther: null,
  stage: 'side_income',
  sources: ['facebook_marketplace', 'local_classifieds'],
  sourcesOther: null,
  dealRule: { criterion: 'min_profit', target: { amountMinor: 50000, currency: 'ZAR' } },
  improvementGoal: 'find_deals_faster',
  completedAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
  ...overrides,
});

describe('money input', () => {
  it('parses what people type into minor units', () => {
    expect(parseMoneyInput('2000', 'ZAR')).toEqual({ ok: true, money: { amountMinor: 200000, currency: 'ZAR' } });
    expect(parseMoneyInput('1 999,50', 'ZAR')).toEqual({ ok: true, money: { amountMinor: 199950, currency: 'ZAR' } });
    expect(parseMoneyInput('1,500.5', 'USD')).toEqual({ ok: true, money: { amountMinor: 150050, currency: 'USD' } });
    expect(parseMoneyInput('1,500', 'USD')).toEqual({ ok: true, money: { amountMinor: 150000, currency: 'USD' } });
    expect(parseMoneyInput('', 'USD')).toEqual({ ok: true, money: null });
    expect(parseMoneyInput('12abc', 'USD').ok).toBe(false);
    expect(parseMoneyInput('5000', 'JPY')).toEqual({ ok: true, money: { amountMinor: 5000, currency: 'JPY' } });
  });

  it('formats for the user locale', () => {
    expect(formatMoney({ amountMinor: 150050, currency: 'USD' }, 'en-US')).toBe('$1,500.50');
  });
});

describe('huntFormDefaults (Seller Snapshot -> sensible, visible defaults)', () => {
  it('preselects marketplaces and the deal target, with notes', () => {
    const { values, context, prefilled } = huntFormDefaults(snapshot(), ZA);
    expect(context).toEqual({ currency: 'ZAR', distanceUnit: 'km', localeTag: 'en-ZA' });
    expect(values.marketplaces).toEqual(['facebook']);
    expect(values).toMatchObject({ targetKind: 'profit', targetProfit: '500.00' });
    expect(prefilled.map((p) => p.field)).toEqual(['marketplaces', 'targetProfit']);
  });

  it('maps margin and max price rules', () => {
    expect(huntFormDefaults(snapshot({ dealRule: { criterion: 'min_margin', targetPercent: 35 } }), ZA).values).toMatchObject({
      targetKind: 'margin',
      targetMargin: '35',
    });
    expect(
      huntFormDefaults(
        snapshot({ dealRule: { criterion: 'max_buy_price', target: { amountMinor: 300000, currency: 'ZAR' } } }),
        ZA,
      ).values.maxPrice,
    ).toBe('3000.00');
  });

  it('falls back sensibly without snapshot, locale or matching currency', () => {
    const { values, context, prefilled } = huntFormDefaults(null, null);
    expect(values.marketplaces).toEqual(['ebay', 'facebook']);
    expect(context.currency).toBe('USD');
    expect(prefilled).toEqual([]);
    // A ZAR profit target is not applied to a USD form.
    expect(huntFormDefaults(snapshot(), US).values.targetKind).toBe('none');
  });

  it('ignores answers from non-resellers', () => {
    expect(huntFormDefaults(snapshot({ isReseller: false, status: 'not_reseller' }), ZA).prefilled).toEqual([]);
  });

  it('suggests a placeholder from the categories', () => {
    expect(queryPlaceholder(snapshot())).toBe('e.g. Nintendo Switch OLED');
    expect(queryPlaceholder(null)).toMatch(/^e\.g\./);
  });
});

describe('buildCreateHuntRequest', () => {
  const ctx = huntFormContext(US);
  const form = (v: Partial<HuntFormValues>): HuntFormValues => ({ ...EMPTY_HUNT_FORM, marketplaces: ['ebay'], ...v });

  it('builds a valid request in canonical units', () => {
    const result = buildCreateHuntRequest(
      form({
        query: ' Steam Deck OLED ',
        marketplaces: ['facebook', 'ebay'], // tapped in this order; sent in canonical order
        locationText: 'Austin, TX',
        radius: '25',
        conditions: ['used'],
        maxPrice: '350',
        targetKind: 'margin',
        targetMargin: '30',
        exclusions: 'broken, for parts\nBroken',
      }),
      ctx,
    );
    expect(result).toEqual({
      ok: true,
      request: {
        query: 'Steam Deck OLED',
        marketplaces: ['ebay', 'facebook'],
        location: { text: 'Austin, TX', radiusKm: 40, point: null },
        conditions: ['used'],
        maxPrice: { amountMinor: 35000, currency: 'USD' },
        target: { kind: 'margin', percent: 30 },
        exclusions: ['broken', 'for parts'],
        priority: 'NORMAL',
      },
    });
  });

  it('drops location when no local marketplace is chosen', () => {
    const result = buildCreateHuntRequest(form({ query: 'ps5', locationText: 'Austin', radius: '10' }), ctx);
    expect(result.ok && result.request.location).toBeNull();
    expect(needsLocation({ marketplaces: ['ebay'] })).toBe(false);
  });

  it('reports errors per field', () => {
    const result = buildCreateHuntRequest(
      form({
        query: '?',
        marketplaces: [],
        maxPrice: 'abc',
        targetKind: 'profit',
        targetProfit: '',
      }),
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['marketplaces', 'maxPrice', 'query', 'targetProfit']);
    }
    const radius = buildCreateHuntRequest(form({ query: 'ps5', marketplaces: ['facebook'], locationText: 'Austin', radius: '900' }), ctx);
    expect(radius.ok === false && radius.errors.radius).toMatch(/between 1 and 311 mi/);
  });

  it('maps API error details to fields', () => {
    expect(
      mapHuntErrors([
        { path: 'body.location.radiusKm', message: 'too big' },
        { path: 'body.exclusions.0', message: 'hides everything' },
        { path: 'body.target.amount.currency', message: 'same currency' },
        { path: 'body', message: 'generic' },
      ]),
    ).toEqual({ radius: 'too big', exclusions: 'hides everything', targetProfit: 'same currency', form: 'generic' });
  });

  it('parses exclusions', () => {
    expect(parseExclusions(' cracked ,\n, Cracked, box only ')).toEqual(['cracked', 'box only']);
  });
});

describe('huntReview', () => {
  it('describes the hunt in plain English and lists go-live warnings', () => {
    const ctx = huntFormContext(US);
    const review = huntReview(
      {
        query: 'Steam Deck OLED',
        marketplaces: ['ebay', 'facebook'],
        location: { text: 'Austin, TX', radiusKm: 40, point: null },
        conditions: ['used', 'refurbished'],
        maxPrice: { amountMinor: 35000, currency: 'USD' },
        target: { kind: 'profit', amount: { amountMinor: 8000, currency: 'USD' } },
        exclusions: ['broken'],
        priority: 'NORMAL',
      },
      ctx,
    );
    expect(review.sentence).toBe(
      'Rein Drop will look for “Steam Deck OLED” on eBay and Facebook Marketplace within 25 mi of Austin, TX in used or refurbished condition, priced at $350.00 or less. It will favour deals with at least $80.00 profit. Listings mentioning “broken” are ignored.',
    );
    expect(review.items.find((i) => i.label === 'Location')?.value).toBe('25 mi of Austin, TX');
    expect(review.warnings).toEqual([]);

    const noLocation = huntReview(
      { query: 'ps5', marketplaces: ['facebook'], location: null, conditions: [], maxPrice: null, target: null, exclusions: [], priority: 'NORMAL' },
      ctx,
    );
    expect(noLocation.warnings).toHaveLength(1);
    expect(noLocation.items.find((i) => i.label === 'Condition')?.value).toBe('Any condition');
  });
});
