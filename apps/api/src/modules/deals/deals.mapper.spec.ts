import { analyzeCandidate, createMockAIProvider, type CandidateAnalysisInput } from '@rein-drop/ai-core';
import { dealDetailSchema, dealSummarySchema } from '@rein-drop/contracts';
import type { DealAnalysis, Listing } from '@rein-drop/db';
import { computeEconomics, DEFAULT_SCORING_POLICY, evaluateAlertEligibility, scoreCandidate, type ComparableSales } from '@rein-drop/scoring';
import { dealStatus, freshnessOf, toDealDetail, toDealSummary, type DealRow } from './deals.mapper.js';

const ID = '01990000-0000-7000-8000-000000000001';
const NOW = new Date('2026-10-07T10:00:00Z');
const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });

const listing: Listing & { marketplace: { key: string } } = {
  id: ID,
  marketplaceId: ID,
  externalId: 'x1',
  url: 'https://dev.example/ebay/itm/x1',
  title: 'Apple iPhone 13 128GB Midnight',
  description: 'Used for a year, always in a case. Battery health 89%. Unlocked, signed out. Comes with box and cable.',
  priceMinor: 400_000,
  currency: 'ZAR',
  conditionText: 'Used - good',
  locationText: 'Cape Town',
  imageUrls: ['https://dev.example/img/1.jpg', 'https://dev.example/img/2.jpg'],
  status: 'ACTIVE',
  listedAt: new Date('2026-10-07T07:00:00Z'),
  firstSeenAt: new Date('2026-10-07T08:00:00Z'),
  lastSeenAt: new Date('2026-10-07T09:45:00Z'),
  sourceMetadata: null,
  dedupeKey: null,
  duplicateOfId: null,
  createdAt: NOW,
  updatedAt: NOW,
  marketplace: { key: 'ebay' },
};

async function analysisRow(comparables: ComparableSales | null = null): Promise<DealAnalysis> {
  const input: CandidateAnalysisInput = {
    listing: {
      marketplace: 'ebay',
      title: listing.title,
      description: listing.description,
      price: ZAR(400_000),
      conditionText: listing.conditionText,
      locationText: listing.locationText,
      photoCount: 2,
      listedAt: listing.listedAt!.toISOString(),
      status: 'ACTIVE',
    },
    hunt: { query: 'iPhone 13', conditions: [], maxPrice: ZAR(450_000), target: { kind: 'profit', amount: ZAR(100_000) }, exclusions: [] },
    matchChecks: [{ check: 'price', outcome: 'pass', detail: 'At or under your max price' }],
    economics: { acquisition: ZAR(400_000), target: { kind: 'profit', amount: ZAR(100_000) } },
    asOf: '2026-10-07T00:00:00.000Z',
  };
  const record = await analyzeCandidate(createMockAIProvider(), input);
  if (record.status !== 'COMPLETED') throw new Error(record.errorMessage);
  const economics = computeEconomics(
    {
      asking: ZAR(400_000),
      knownCosts: [{ kind: 'shipping', label: 'Shipping', amount: ZAR(15_000) }],
      maxPrice: ZAR(450_000),
      target: { kind: 'profit', amount: ZAR(100_000) },
      comparables,
    },
    DEFAULT_SCORING_POLICY,
  );
  const assessment = scoreCandidate({ economics, analysis: record.result, relevanceScore: 100 });
  const alert = evaluateAlertEligibility({
    assessment,
    huntStatus: 'LIVE',
    matchStatus: 'NEW',
    listingStatus: 'ACTIVE',
    isDuplicate: false,
    listedAt: listing.listedAt!.toISOString(),
    asOf: NOW.toISOString(),
  });
  return {
    id: ID,
    listingId: ID,
    huntMatchId: ID,
    status: 'COMPLETED',
    provider: record.provider,
    model: record.model,
    modelVersion: record.modelVersion,
    promptVersion: record.promptVersion,
    schemaVersion: record.schemaVersion,
    providerMetadata: null,
    inputHash: 'h',
    durationMs: 1,
    result: record.result as never,
    errorMessage: null,
    scoringVersion: 1,
    economics: economics as never,
    strength: assessment.strength,
    confidence: assessment.confidence,
    score: assessment.score,
    scoring: { strengthReasons: assessment.strengthReasons, confidenceReasons: assessment.confidenceReasons, alert } as never,
    alertEligible: alert.eligible,
    alertKind: alert.kind,
    createdAt: NOW,
    completedAt: NOW,
  };
}

const row = (over: Partial<DealRow> = {}): DealRow => ({
  match: {
    id: ID,
    status: 'NEW',
    matchedAt: new Date('2026-10-07T08:00:00Z'),
    reasons: [{ check: 'price', outcome: 'pass', code: 'within_max_price', detail: 'At or under your max price' }],
    seenAt: null,
    dismissedAt: null,
    dismissReason: null,
    boughtAt: null,
  },
  hunt: { id: ID, name: 'iPhone 13' },
  listing,
  analysis: null,
  savedAt: null,
  poll: { lastPolledAt: new Date('2026-10-07T09:45:00Z'), lastPollStatus: 'SUCCEEDED' },
  inventoryItemId: null,
  rank: 49,
  ...over,
});

describe('dealStatus', () => {
  it('applies bought > ignored > unavailable > saved > new > seen', () => {
    expect(dealStatus('BOUGHT', 'SOLD', true)).toBe('bought');
    expect(dealStatus('DISMISSED', 'SOLD', true)).toBe('ignored');
    expect(dealStatus('EXPIRED', 'ACTIVE', true)).toBe('unavailable');
    expect(dealStatus('NEW', 'SOLD', true)).toBe('unavailable');
    expect(dealStatus('NEW', 'UNKNOWN', true)).toBe('saved');
    expect(dealStatus('NEW', 'ACTIVE', false)).toBe('new');
    expect(dealStatus('SEEN', 'ACTIVE', false)).toBe('seen');
  });
});

describe('freshnessOf', () => {
  it('measures from the posting time, else from discovery', () => {
    expect(freshnessOf(listing, NOW)).toEqual({ postedAt: '2026-10-07T07:00:00.000Z', discoveredAt: '2026-10-07T08:00:00.000Z', ageMinutes: 180, basis: 'posted' });
    expect(freshnessOf({ ...listing, listedAt: null }, NOW)).toMatchObject({ ageMinutes: 120, basis: 'discovered' });
    expect(freshnessOf({ ...listing, listedAt: new Date('2026-10-07T10:30:00Z') }, NOW).ageMinutes).toBe(0);
  });
});

describe('toDealSummary / toDealDetail', () => {
  it('a match not analysed yet: pending, asking price only, estimates "not analysed", no reason', () => {
    const summary = toDealSummary(row(), NOW);
    expect(dealSummarySchema.parse(summary)).toEqual(summary);
    expect(summary).toMatchObject({
      status: 'new',
      price: { asking: ZAR(400_000), knownCosts: null, knownTotal: ZAR(400_000) },
      assessment: { status: 'pending', strength: null, alertEligible: false },
      estimate: { resale: { status: 'unavailable', reason: 'not_analyzed' }, upside: { status: 'unavailable' } },
      reason: null,
      source: { marketplace: 'ebay', listingStatus: 'ACTIVE', available: true, lastCheck: 'ok' },
      listing: { imageUrl: 'https://dev.example/img/1.jpg' },
    });
    const detail = toDealDetail(row(), NOW);
    expect(dealDetailSchema.parse(detail)).toEqual(detail);
    expect(detail).toMatchObject({ why: null, risk: null, economics: null, alert: null, matchChecks: [{ check: 'price', outcome: 'pass' }] });
  });

  it('an analysed match: strength, confidence, reason, known costs and the "no resale source" estimate', async () => {
    const analysis = await analysisRow();
    const detail = toDealDetail(row({ analysis, savedAt: NOW }), NOW);
    expect(dealDetailSchema.parse(detail)).toEqual(detail);
    expect(detail).toMatchObject({
      status: 'saved',
      isSaved: true,
      assessment: { status: 'completed', strength: 'strong', confidence: 'medium', alertEligible: true },
      price: { asking: ZAR(400_000), knownCosts: ZAR(15_000), knownTotal: ZAR(415_000) },
      estimate: { resale: { status: 'unavailable', reason: 'no_source' }, upside: { status: 'unavailable', reason: 'no_resale_estimate' } },
      economics: { maxPrice: { status: 'within', withKnownCosts: 'within', headroom: ZAR(35_000) }, target: { status: 'unverified' } },
      alert: { eligible: true, kind: 'deal' },
      decision: { savedAt: NOW.toISOString() },
    });
    expect(detail.reason).toBe(detail.why!.headline);
    expect(detail.strengthReasons.map((r) => r.code)).toContain('target_unverified');
    expect(detail.risk!.seller.status).toBe('not_available');
  });

  it('with comparables the upside is an estimate range, never a realized amount', async () => {
    const analysis = await analysisRow({ source: 'test', sampleSize: 8, low: ZAR(600_000), typical: ZAR(700_000), high: ZAR(800_000), asOf: NOW.toISOString() });
    const detail = toDealDetail(row({ analysis }), NOW);
    expect(dealDetailSchema.parse(detail)).toEqual(detail);
    expect(detail.estimate).toMatchObject({
      resale: { status: 'estimated', basis: 'comparable_sales', typical: ZAR(700_000), sampleSize: 8 },
      upside: { status: 'estimated', basis: 'estimate', low: ZAR(185_000), typical: ZAR(285_000), high: ZAR(385_000), typicalMarginPercent: 40 },
    });
  });

  it('a failed analysis shows as failed, without strength; a bought deal links its purchase', async () => {
    const failed = { ...(await analysisRow()), status: 'FAILED' as const, result: null, strength: null, confidence: null, score: null, alertEligible: false, alertKind: null };
    const bought = toDealDetail(
      row({ analysis: failed, match: { ...row().match, status: 'BOUGHT', boughtAt: NOW }, inventoryItemId: ID, poll: null }),
      NOW,
    );
    expect(dealDetailSchema.parse(bought)).toEqual(bought);
    expect(bought).toMatchObject({
      status: 'bought',
      assessment: { status: 'failed', strength: null },
      why: null,
      reason: null,
      source: { lastCheckedAt: null, lastCheck: null },
      decision: { boughtAt: NOW.toISOString(), inventoryItemId: ID },
    });
  });
});
