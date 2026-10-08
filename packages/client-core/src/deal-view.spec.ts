import { describe, expect, it } from 'vitest';
import type { DealDetail } from '@rein-drop/contracts';
import {
  ageText,
  buildBoughtRequest,
  buildIgnoreRequest,
  boughtFormDefaults,
  dealActions,
  dealCardView,
  dealDetailView,
  upsideView,
} from './deal-view.js';

const ID = '01990000-0000-7000-8000-000000000001';
const NOW = '2026-10-07T10:00:00.000Z';
const ZA = { currency: 'ZAR', distanceUnit: 'km' as const, localeTag: 'en-ZA' };
const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });
const nbsp = (s: string) => s.replace(/[  ]/g, ' ');

const deal: DealDetail = {
  id: ID,
  hunt: { id: ID, name: 'iPhone 13' },
  status: 'new',
  matchStatus: 'NEW',
  isSaved: false,
  matchedAt: NOW,
  listing: {
    id: ID,
    marketplace: 'ebay',
    url: 'https://dev.example/ebay/itm/1',
    title: 'Apple iPhone 13 128GB',
    price: ZAR(400_000),
    conditionText: 'Used',
    locationText: 'Cape Town',
    imageUrl: null,
    status: 'ACTIVE',
    listedAt: NOW,
    lastSeenAt: NOW,
    description: 'Battery 89%',
    imageUrls: [],
  },
  price: { asking: ZAR(400_000), knownCosts: ZAR(15_000), knownTotal: ZAR(415_000) },
  freshness: { postedAt: NOW, discoveredAt: NOW, ageMinutes: 25, basis: 'posted' },
  source: { marketplace: 'ebay', listingStatus: 'ACTIVE', available: true, lastSeenAt: NOW, lastCheckedAt: NOW, lastCheck: 'ok' },
  assessment: { status: 'completed', strength: 'strong', confidence: 'medium', score: 72, alertEligible: true, analyzedAt: NOW },
  estimate: {
    resale: { status: 'unavailable', reason: 'no_source', detail: 'No resale price source is connected yet' },
    upside: { status: 'unavailable', reason: 'no_resale_estimate', detail: 'No resale price source is connected yet' },
  },
  reason: 'Apple iPhone 13 at R4 000, within your max price',
  rank: 85.8,
  why: { headline: 'h', summary: 's', positives: ['Within your max price'], concerns: [], nextStep: 'review', questionsForSeller: [] },
  product: { name: 'Apple iPhone 13', fit: 'matches', fitNote: 'Matches', confidence: 'high' },
  risk: { level: 'low', condition: 'used', factors: [], missingInformation: [], seller: { status: 'not_available', note: 'n/a' } },
  strengthReasons: [],
  confidenceReasons: [],
  economics: {
    knownCosts: [{ kind: 'shipping', label: 'Shipping', amount: ZAR(15_000) }],
    notIncluded: ['selling_fees', 'shipping_to_your_buyer'],
    maxPrice: { limit: ZAR(450_000), status: 'within', withKnownCosts: 'within', headroom: ZAR(35_000) },
    target: { status: 'unverified', detail: "Can't check your target without a resale estimate" },
  },
  matchChecks: [{ check: 'price', outcome: 'pass', detail: 'At or under your max price' }],
  alert: { eligible: false, kind: null, rules: [{ rule: 'fresh_listing', passed: false, detail: 'Posted 60h ago (alerts need 48h or less)' }] },
  decision: { seenAt: null, savedAt: null, ignoredAt: null, ignoreReason: null, boughtAt: null, inventoryItemId: null },
};

describe('deal card', () => {
  it('shows product, source, price, freshness, estimate, confidence and status', () => {
    const card = dealCardView(deal, ZA);
    expect(card).toMatchObject({
      title: 'Apple iPhone 13 128GB',
      source: 'eBay',
      freshness: 'Posted 25 min ago',
      justDropped: true,
      status: { label: 'New', tone: 'fresh' },
      strength: { label: 'Strong' },
      confidence: 'Medium confidence',
      upside: { value: 'Not estimated', estimated: false, caption: 'No resale price data yet' },
      exceptional: false,
      sourceNote: null,
    });
    expect(nbsp(card.price)).toBe('R 4 000,00');
    expect(nbsp(card.priceExtra!)).toBe('+ R 150,00 known costs');
    expect(card.accessibleSummary).toContain('upside not estimated');
  });

  it('labels a real upside as an estimate, with its range and what it excludes', () => {
    const view = upsideView(
      {
        resale: { status: 'estimated', basis: 'comparable_sales', low: ZAR(1), typical: ZAR(1), high: ZAR(1), sampleSize: 6 },
        upside: { status: 'estimated', basis: 'estimate', low: ZAR(185_000), typical: ZAR(285_000), high: ZAR(385_000), typicalMarginPercent: 40, excludes: ['selling_fees', 'shipping_to_your_buyer'] },
      },
      ZA,
    );
    expect(view.estimated).toBe(true);
    expect(nbsp(view.value)).toBe('R 2 850,00');
    expect(nbsp(view.caption)).toBe('Range R 1 850,00 to R 3 850,00, before selling fees and shipping to your buyer');
  });

  it('flags exceptional deals, pending analyses and listings that are gone', () => {
    expect(dealCardView({ ...deal, assessment: { ...deal.assessment, strength: 'exceptional' } }, ZA)).toMatchObject({ exceptional: true, strength: { label: 'Exceptional', tone: 'fresh' } });
    expect(dealCardView({ ...deal, assessment: { status: 'pending', strength: null, confidence: null, score: null, alertEligible: false, analyzedAt: null } }, ZA)).toMatchObject({
      strength: null,
      confidence: null,
      analysisNote: 'Rein Drop is still analysing this listing',
    });
    const sold = dealCardView({ ...deal, status: 'unavailable', source: { ...deal.source, listingStatus: 'SOLD', available: false } }, ZA);
    expect(sold).toMatchObject({ justDropped: false, sourceNote: { text: 'Sold on eBay', tone: 'loss' }, status: { label: 'No longer available' } });
    expect(dealCardView({ ...deal, source: { ...deal.source, lastCheck: 'failed' } }, ZA).sourceNote!.text).toBe("Couldn't check eBay on the last try");
    expect(dealCardView({ ...deal, price: { asking: null, knownCosts: null, knownTotal: null } }, ZA).price).toBe('No price shown');
  });

  it('ages read naturally', () => {
    expect([0, 5, 59, 60, 47 * 60, 49 * 60].map(ageText)).toEqual(['just now', '5 min ago', '59 min ago', '1 h ago', '47 h ago', '2 days ago']);
  });
});

describe('deal detail', () => {
  it('breaks down the price and explains the max price, target, checks and alert outcome', () => {
    const view = dealDetailView(deal, ZA);
    expect(view.priceLines.map(([l, v]) => [l, nbsp(v)])).toEqual([
      ['Asking price', 'R 4 000,00'],
      ['Shipping', 'R 150,00'],
      ['Known total', 'R 4 150,00'],
    ]);
    expect(view.notIncluded).toBe('Not included: selling fees and shipping to your buyer.');
    expect(nbsp(view.maxPriceNote!)).toBe('R 350,00 under your max of R 4 500,00, including known costs');
    expect(view.targetNote).toBe("Can't check your target without a resale estimate");
    expect(view.checks).toEqual([{ label: 'Max price', outcome: { label: 'Pass', tone: 'profit' }, detail: 'At or under your max price' }]);
    expect(view.alertNote).toBe('No alert: posted 60h ago (alerts need 48h or less).');
  });

  it('describes going over the max once shipping is added, and the decisions made', () => {
    const over = dealDetailView(
      {
        ...deal,
        economics: { ...deal.economics!, maxPrice: { limit: ZAR(450_000), status: 'within', withKnownCosts: 'above', headroom: ZAR(-5_000) } },
        decision: { ...deal.decision, ignoredAt: NOW, ignoreReason: 'Too far' },
      },
      ZA,
    );
    expect(nbsp(over.maxPriceNote!)).toBe('Within your max of R 4 500,00, but R 50,00 over once known costs are added');
    expect(over.decisions[0]).toMatch(/^You ignored it .+: "Too far"\.$/);
  });
});

describe('actions and forms', () => {
  it('offers only the actions that fit the state', () => {
    expect(dealActions({ status: 'new', isSaved: false })).toEqual({ canSave: true, canUnsave: false, canIgnore: true, canUnignore: false, canBuy: true });
    expect(dealActions({ status: 'saved', isSaved: true })).toMatchObject({ canSave: false, canUnsave: true });
    expect(dealActions({ status: 'ignored', isSaved: false })).toMatchObject({ canIgnore: false, canUnignore: true });
    expect(dealActions({ status: 'bought', isSaved: true })).toEqual({ canSave: false, canUnsave: false, canIgnore: false, canUnignore: false, canBuy: false });
  });

  it('Bought starts at the asking price; a price is needed when the listing shows none', () => {
    expect(boughtFormDefaults({ price: { ...deal.price, knownCosts: null } }, ZA)).toEqual({ price: '4000.00', currency: 'ZAR', shipping: '' });
    expect(boughtFormDefaults({ price: { asking: ZAR(400_000), knownCosts: ZAR(15_000), knownTotal: ZAR(415_000) } }, ZA)).toEqual({
      price: '4000.00',
      currency: 'ZAR',
      shipping: '150.00',
    });
    expect(boughtFormDefaults({ price: { asking: null, knownCosts: null, knownTotal: null } }, ZA)).toEqual({ price: '', currency: 'ZAR', shipping: '' });
    expect(buildBoughtRequest('3500', 'ZAR', ZAR(400_000))).toEqual({ ok: true, request: { price: ZAR(350_000) } });
    expect(buildBoughtRequest('', 'ZAR', ZAR(400_000))).toEqual({ ok: true, request: {} });
    expect(buildBoughtRequest('', 'ZAR', null)).toEqual({ ok: false, error: 'Enter what you paid', field: 'price' });
    expect(buildBoughtRequest('0', 'ZAR', null)).toEqual({ ok: false, error: 'Enter what you paid', field: 'price' });
    expect(buildBoughtRequest('lots', 'ZAR', null).ok).toBe(false);
    // Shipping to you (from the listing, editable) becomes a purchase cost.
    expect(buildBoughtRequest('3500', 'ZAR', ZAR(400_000), '150')).toEqual({
      ok: true,
      request: { price: ZAR(350_000), costs: [{ category: 'SHIPPING', amount: ZAR(15_000) }] },
    });
    expect(buildBoughtRequest('', 'ZAR', ZAR(400_000), '')).toEqual({ ok: true, request: {} });
    expect(buildBoughtRequest('3500', 'ZAR', null, 'free')).toMatchObject({ ok: false, field: 'shipping' });
  });

  it('Ignore reason is optional and short', () => {
    expect(buildIgnoreRequest('  ')).toEqual({ ok: true, request: {} });
    expect(buildIgnoreRequest(' Too far ')).toEqual({ ok: true, request: { reason: 'Too far' } });
    expect(buildIgnoreRequest('x'.repeat(201)).ok).toBe(false);
  });
});
