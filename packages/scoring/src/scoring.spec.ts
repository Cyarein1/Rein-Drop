import { describe, expect, it } from 'vitest';
import {
  analyzeCandidate,
  createMockAIProvider,
  type CandidateAnalysisInput,
  type ConditionRiskAssessment,
  type HuntTarget,
  type ProductExtraction,
} from '@rein-drop/ai-core';
import { evaluateAlertEligibility, type AlertEligibilityInput } from './alerts.js';
import { scoreCandidate, type DealAssessment } from './classify.js';
import { COSTS_NOT_INCLUDED, computeEconomics, type ComparableSales, type EconomicsInput } from './economics.js';
import { DEFAULT_SCORING_POLICY } from './policy.js';

const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });
const policy = DEFAULT_SCORING_POLICY;

const product: ProductExtraction = {
  category: 'phone',
  brand: { value: 'Apple', evidence: { source: 'text', field: 'title', quote: 'Apple' } },
  model: { value: 'iPhone 13', evidence: { source: 'text', field: 'title', quote: 'iPhone 13' } },
  attributes: [],
  normalizedName: 'Apple iPhone 13',
  queryFit: 'matches',
  queryFitNote: 'Apple iPhone 13 is what you are hunting',
  confidence: 'high',
};
const risk: ConditionRiskAssessment = {
  conditionCategory: 'used',
  conditionEvidence: { source: 'text', field: 'conditionText', quote: 'Used' },
  riskLevel: 'low',
  riskFactors: [],
  missingInformation: [],
  seller: { status: 'not_available', note: "Seller history isn't available" },
};
const comparables = (over: Partial<ComparableSales> = {}): ComparableSales => ({
  source: 'test-comps',
  sampleSize: 12,
  low: ZAR(600_000),
  typical: ZAR(700_000),
  high: ZAR(800_000),
  asOf: '2026-10-07T00:00:00.000Z',
  ...over,
});
const economicsInput = (over: Partial<EconomicsInput> = {}): EconomicsInput => ({
  asking: ZAR(400_000),
  knownCosts: [],
  maxPrice: ZAR(450_000),
  target: null,
  comparables: null,
  ...over,
});
const score = (econ: Partial<EconomicsInput> = {}, ai: { product?: Partial<ProductExtraction>; risk?: Partial<ConditionRiskAssessment> } = {}) =>
  scoreCandidate({
    economics: computeEconomics(economicsInput(econ), policy),
    analysis: { product: { ...product, ...ai.product }, risk: { ...risk, ...ai.risk } },
    relevanceScore: 100,
  });
const profit = (amountMinor: number): HuntTarget => ({ kind: 'profit', amount: ZAR(amountMinor) });

describe('computeEconomics', () => {
  it('adds known costs to the asking price and checks your max price', () => {
    const e = computeEconomics(economicsInput({ knownCosts: [{ kind: 'shipping', label: 'Shipping', amount: ZAR(15_000) }] }), policy);
    expect(e.knownTotalCost).toEqual(ZAR(415_000));
    expect(e.maxPrice).toEqual({ status: 'within', limit: ZAR(450_000), withKnownCosts: 'within', headroom: ZAR(35_000) });
    // Unknown costs are listed, never treated as zero.
    expect(e.notIncluded).toEqual([...COSTS_NOT_INCLUDED]);
  });

  it('flags a listing that is only within your max before its shipping', () => {
    const e = computeEconomics(economicsInput({ asking: ZAR(445_000), knownCosts: [{ kind: 'shipping', label: 'Shipping', amount: ZAR(15_000) }] }), policy);
    expect(e.maxPrice).toMatchObject({ status: 'within', withKnownCosts: 'above', headroom: ZAR(-10_000) });
  });

  it('never estimates resale or upside without comparable sales', () => {
    const e = computeEconomics(economicsInput({ target: profit(100_000) }), policy);
    expect(e.resale).toMatchObject({ status: 'unavailable', reason: 'no_source' });
    expect(e.estimatedUpside).toMatchObject({ status: 'unavailable', reason: 'no_resale_estimate' });
    expect(e.target).toMatchObject({ status: 'unverified' });
  });

  it('estimates upside from comparables, labelled as an estimate with the costs it excludes', () => {
    const e = computeEconomics(
      economicsInput({ knownCosts: [{ kind: 'shipping', label: 'Shipping', amount: ZAR(20_000) }], target: profit(150_000), comparables: comparables() }),
      policy,
    );
    expect(e.estimatedUpside).toEqual({
      status: 'estimated',
      basis: 'estimate',
      low: ZAR(180_000),
      typical: ZAR(280_000),
      high: ZAR(380_000),
      typicalMarginPercent: 40,
      excludes: [...COSTS_NOT_INCLUDED],
    });
    expect(e.target).toMatchObject({ status: 'met', metAtLowEnd: true });
    // Nothing in the economics claims a realized result.
    expect(JSON.stringify(e)).not.toMatch(/realized/i);
  });

  it('checks a margin target against the estimated margin', () => {
    const met = computeEconomics(economicsInput({ target: { kind: 'margin', percent: 40 }, comparables: comparables() }), policy);
    expect(met.target).toMatchObject({ status: 'met', metAtLowEnd: false }); // typical 42%, low end 33%
    const missed = computeEconomics(economicsInput({ target: { kind: 'margin', percent: 50 }, comparables: comparables() }), policy);
    expect(missed.target).toMatchObject({ status: 'not_met' });
  });

  it('refuses thin, inconsistent or other-currency comparables and other-currency costs', () => {
    expect(computeEconomics(economicsInput({ comparables: comparables({ sampleSize: 3 }) }), policy).resale).toMatchObject({ reason: 'too_few_sales' });
    expect(computeEconomics(economicsInput({ comparables: comparables({ low: ZAR(900_000) }) }), policy).resale).toMatchObject({ reason: 'inconsistent' });
    const usd = { amountMinor: 10_000, currency: 'USD' };
    expect(computeEconomics(economicsInput({ comparables: comparables({ low: usd, typical: usd, high: usd }) }), policy).resale).toMatchObject({
      reason: 'other_currency',
    });
    const e = computeEconomics(economicsInput({ knownCosts: [{ kind: 'shipping', label: 'Shipping', amount: usd }] }), policy);
    expect(e.knownTotalCost).toEqual(ZAR(400_000));
    expect(e.ignoredCosts).toEqual([{ cost: expect.objectContaining({ amount: usd }), reason: 'other_currency' }]);
  });

  it('has nothing to compute without an asking price', () => {
    const e = computeEconomics(economicsInput({ asking: null, comparables: comparables() }), policy);
    expect(e.knownTotalCost).toBeNull();
    expect(e.maxPrice).toMatchObject({ status: 'unverified', reason: 'no_price' });
    expect(e.estimatedUpside).toMatchObject({ status: 'unavailable', reason: 'no_price' });
  });
});

describe('scoreCandidate', () => {
  const codes = (a: DealAssessment, effect?: string) => a.strengthReasons.filter((r) => !effect || r.effect === effect).map((r) => r.code);

  it('today (no comparables): within your max + clean listing = strong, medium confidence, target noted as unverified', () => {
    const a = score({ target: profit(100_000) });
    expect(a).toMatchObject({ strength: 'strong', confidence: 'medium', scoringVersion: 1 });
    expect(codes(a, 'supports')).toEqual(expect.arrayContaining(['within_max_price', 'low_risk', 'product_matches']));
    expect(codes(a, 'note')).toEqual(['target_unverified']);
    expect(a.confidenceReasons.map((r) => r.code)).toContain('no_resale_estimate');
    expect(a.score).toBeGreaterThanOrEqual(65);
    expect(a.score).toBeLessThanOrEqual(80);
  });

  it('needs at least one of your own price criteria verified to be strong', () => {
    const a = score({ maxPrice: null, target: null });
    expect(a.strength).toBe('moderate');
    expect(codes(a, 'caps')).toEqual(['no_verified_criterion']);
    // With the policy switch off, an unverified target also caps.
    const strict = scoreCandidate(
      { economics: computeEconomics(economicsInput({ target: profit(1) }), policy), analysis: { product, risk }, relevanceScore: 100 },
      { ...policy, allowStrongWithUnverifiedTarget: false },
    );
    expect(strict.strength).toBe('moderate');
  });

  it('rules a deal out (weak) for serious risk, the wrong product, a missed target or no upside', () => {
    const locked = score({}, { risk: { riskLevel: 'high', riskFactors: [{ code: 'locked_or_blacklisted', severity: 'high', note: 'Mentions a lock', evidence: { source: 'text', field: 'description', quote: 'icloud locked' } }] } });
    expect(locked.strength).toBe('weak');
    expect(locked.strengthReasons.find((r) => r.code === 'high_risk')?.detail).toBe('Mentions a lock');
    expect(score({}, { product: { queryFit: 'conflicts' } }).strength).toBe('weak');
    expect(codes(score({ target: profit(400_000), comparables: comparables() }), 'blocks')).toEqual(['target_not_met']);
    expect(codes(score({ maxPrice: null, comparables: comparables({ low: ZAR(300_000), typical: ZAR(380_000), high: ZAR(420_000) }) }), 'blocks')).toEqual([
      'no_estimated_upside',
    ]);
    expect(score({ asking: ZAR(500_000) }).strength).toBe('weak'); // above max
  });

  it('keeps medium / unknown risk, shipping over your max and low confidence below strong', () => {
    expect(score({}, { risk: { riskLevel: 'medium' } }).strength).toBe('moderate');
    expect(score({ asking: ZAR(445_000), knownCosts: [{ kind: 'shipping', label: 'Shipping', amount: ZAR(15_000) }] }).strength).toBe('moderate');
    const unclear = score({}, { product: { queryFit: 'unclear' } });
    expect(unclear).toMatchObject({ strength: 'moderate', confidence: 'low' });
    expect(score({ asking: null }).confidence).toBe('low');
  });

  it('is exceptional only with comparables: upside well above your target, even at the low end', () => {
    const exceptional = score({ target: profit(100_000), comparables: comparables() }); // typical upside R3 000 vs R1 000 target
    expect(exceptional).toMatchObject({ strength: 'exceptional', confidence: 'high' });
    expect(exceptional.score).toBeGreaterThanOrEqual(85);
    // The same listing without a resale source can never be exceptional.
    expect(score({ target: profit(100_000) }).strength).toBe('strong');
    // Upside meets the target but not 2x of it.
    expect(score({ target: profit(200_000), comparables: comparables() }).strength).toBe('strong');
  });

  it('ranks every strength band above the one below it', () => {
    const scores = [
      score({ target: profit(100_000), comparables: comparables() }),
      score({ asking: ZAR(449_000) }), // strong with almost no headroom
      score({}, { risk: { riskLevel: 'medium' } }),
      score({ asking: ZAR(1) }, { product: { queryFit: 'conflicts' } }), // weak despite the price
    ].map((a) => a.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(4);
  });
});

describe('evaluateAlertEligibility', () => {
  const strong = score();
  const input = (over: Partial<AlertEligibilityInput> = {}): AlertEligibilityInput => ({
    assessment: strong,
    huntStatus: 'LIVE',
    matchStatus: 'NEW',
    listingStatus: 'ACTIVE',
    isDuplicate: false,
    listedAt: '2026-10-07T08:00:00.000Z',
    asOf: '2026-10-07T10:00:00.000Z',
    ...over,
  });

  it('a strong, new, fresh match on a live hunt is eligible for a deal alert', () => {
    expect(evaluateAlertEligibility(input())).toMatchObject({ eligible: true, kind: 'deal', blockedBy: [] });
    expect(evaluateAlertEligibility(input({ listedAt: null })).eligible).toBe(true); // age unknown isn't stale
  });

  it('exceptional deals get the exceptional kind', () => {
    const exceptional = score({ target: profit(100_000), comparables: comparables() });
    expect(evaluateAlertEligibility(input({ assessment: exceptional }))).toMatchObject({ eligible: true, kind: 'exceptional' });
  });

  it('not every match alerts', () => {
    const blocked = (over: Partial<AlertEligibilityInput>) => evaluateAlertEligibility(input(over)).blockedBy;
    expect(blocked({ assessment: score({}, { risk: { riskLevel: 'medium' } }) })).toEqual(['strength']);
    expect(blocked({ assessment: score({ asking: null, maxPrice: null }) })).toEqual(['strength', 'confidence']);
    expect(blocked({ assessment: null })).toEqual(['analysis_completed', 'strength', 'confidence']);
    expect(blocked({ matchStatus: 'SEEN' })).toEqual(['match_new']);
    expect(blocked({ matchStatus: 'DISMISSED', huntStatus: 'PAUSED' })).toEqual(['hunt_live', 'match_new']);
    expect(blocked({ listingStatus: 'UNKNOWN' })).toEqual(['listing_active']);
    expect(blocked({ isDuplicate: true })).toEqual(['not_duplicate']);
    expect(blocked({ listedAt: '2026-10-01T10:00:00.000Z' })).toEqual(['fresh_listing']);
    const result = evaluateAlertEligibility(input({ listedAt: '2026-10-01T10:00:00.000Z' }));
    expect(result).toMatchObject({ eligible: false, kind: null });
    expect(result.rules.find((r) => r.rule === 'fresh_listing')?.detail).toBe('Posted 144h ago (alerts need 48h or less)');
  });
});

describe('with the mock AIProvider (end to end, no database)', () => {
  const provider = createMockAIProvider();
  const candidate = (listing: Partial<CandidateAnalysisInput['listing']>): CandidateAnalysisInput => ({
    listing: {
      marketplace: 'facebook',
      title: 'Apple iPhone 13 128GB Midnight',
      description: 'Used for a year, always in a case. Battery health 89%. Unlocked, signed out. Comes with box and cable.',
      price: ZAR(400_000),
      conditionText: 'Used - good',
      locationText: 'Cape Town',
      photoCount: 4,
      listedAt: '2026-10-07T08:00:00.000Z',
      status: 'ACTIVE',
      ...listing,
    },
    hunt: { query: 'iPhone 13', conditions: [], maxPrice: ZAR(450_000), target: profit(100_000), exclusions: [] },
    matchChecks: [],
    economics: { acquisition: listing.price === undefined ? ZAR(400_000) : listing.price, target: profit(100_000) },
    asOf: '2026-10-07T00:00:00.000Z',
  });
  const assess = async (c: CandidateAnalysisInput) => {
    const record = await analyzeCandidate(provider, c);
    if (record.status !== 'COMPLETED') throw new Error(record.errorMessage);
    const economics = computeEconomics(
      { asking: c.listing.price, knownCosts: [], maxPrice: c.hunt.maxPrice, target: c.hunt.target, comparables: null },
      policy,
    );
    return scoreCandidate({ economics, analysis: record.result, relevanceScore: 100 });
  };

  it('a clean, well-described listing within your max is strong', async () => {
    expect(await assess(candidate({}))).toMatchObject({ strength: 'strong', confidence: 'medium' });
  });

  it('a listing the AI reads as faulty is weak, whatever its price', async () => {
    const faulty = await assess(candidate({ description: 'Does not turn on, for parts only. iCloud locked.', price: ZAR(50_000) }));
    expect(faulty.strength).toBe('weak');
    expect(faulty.strengthReasons.find((r) => r.code === 'high_risk')).toBeDefined();
  });
});
