import { describe, expect, it } from 'vitest';
import { normalizeRawListing } from '@rein-drop/marketplace-core';
import { DEV_CASES, DEV_PRODUCTS, DevEbayAdapter } from '@rein-drop/marketplace-core/adapters';
import { analyzeCandidate, analysisInputKey, type CandidateAnalysisInput } from './analysis.js';
import { createAIProvider, createMockAIProvider } from './factory.js';
import { MockAIProvider } from './mock/mock-ai-provider.js';
import { AIProviderError, NO_EXTERNAL_EVIDENCE, type AIProvider, type ListingFacts, type MatchCheckFact } from './provider.js';
import { withValidation } from './validation.js';

const AS_OF = '2026-10-07T10:00:00.000Z';
const listing: ListingFacts = {
  marketplace: 'facebook',
  title: 'Apple iPhone 13 128GB',
  description: 'Selling my iPhone 13, upgraded. Works perfectly, minor scuffs on the frame. Box and cable included.',
  price: { amountMinor: 410_000, currency: 'ZAR' },
  conditionText: 'Used - good',
  locationText: 'Cape Town',
  photoCount: 3,
  listedAt: '2026-10-07T09:30:00.000Z',
  status: 'ACTIVE',
};
const passing: MatchCheckFact[] = [
  { check: 'relevance', outcome: 'pass', detail: 'Mentions iphone, 13' },
  { check: 'price', outcome: 'pass', detail: 'At or under your max price' },
  { check: 'geography', outcome: 'unverified', detail: 'Distance not checked yet' },
];
const candidate = (over: Partial<ListingFacts> = {}, query = 'iPhone 13'): CandidateAnalysisInput => ({
  listing: { ...listing, ...over },
  hunt: { query, conditions: [], maxPrice: { amountMinor: 450_000, currency: 'ZAR' }, target: null, exclusions: [] },
  matchChecks: passing,
  economics: { acquisition: listing.price, target: null },
  asOf: AS_OF,
});

const ai = createMockAIProvider();
const extract = (over: Partial<ListingFacts> = {}, query = 'iPhone 13') => ai.extractProduct({ listing: { ...listing, ...over }, hunt: { query } });
const risk = (over: Partial<ListingFacts> = {}) => ai.assessConditionRisk({ listing: { ...listing, ...over }, asOf: AS_OF, evidence: NO_EXTERNAL_EVIDENCE });

describe('MockAIProvider - product extraction', () => {
  it('extracts brand, model and attributes, each quoting the listing', async () => {
    const { output, meta } = await extract();
    expect(output).toMatchObject({
      category: 'phone',
      brand: { value: 'Apple', evidence: { source: 'text', field: 'title', quote: 'Apple' } },
      model: { value: 'iPhone 13', evidence: { source: 'text', field: 'title', quote: 'iPhone 13' } },
      attributes: [{ name: 'storage', value: '128GB' }],
      normalizedName: 'Apple iPhone 13 128GB',
      queryFit: 'matches',
      confidence: 'high',
    });
    expect(meta).toEqual({
      provider: 'mock',
      model: 'mock-rules',
      modelVersion: '1.0.0',
      promptVersion: 'product-extraction@1',
      schemaVersion: 1,
      latencyMs: 0,
      usage: null,
      requestId: null,
    });
  });

  it('infers the brand only from a quoted product word', async () => {
    // The (contradictory) description mentions an iPhone: the title wins.
    const { output } = await extract({ title: 'Galaxy S22 128GB' }, 'Galaxy S23');
    expect(output.brand).toEqual({ value: 'Samsung', evidence: { source: 'text', field: 'title', quote: 'Galaxy' } });
    expect(output.model?.value).toBe('Galaxy S22');
    expect(output.queryFit).toBe('conflicts');
  });

  it('knows other names of a model (PS5 = PlayStation 5) without crossing models', async () => {
    const ps5 = await extract({ title: 'Sony PlayStation 5 Disc Edition', description: null }, 'PS5');
    expect(ps5.output).toMatchObject({ category: 'console', normalizedName: 'Sony PlayStation 5 Disc Edition', queryFit: 'matches' });
    const ps4 = await extract({ title: 'Sony PS4 Slim', description: null }, 'PS5');
    expect(ps4.output.queryFit).not.toBe('matches');
  });

  it('reports nothing it cannot find', async () => {
    const { output } = await extract({ title: 'Vintage desk lamp', description: null }, 'lamp');
    expect(output).toMatchObject({ category: null, brand: null, model: null, attributes: [], normalizedName: null, confidence: 'low' });
  });

  it('is deterministic', async () => {
    expect(await extract()).toEqual(await extract());
  });
});

describe('MockAIProvider - condition and risk', () => {
  it('cites wording from the listing for every risk and never assesses the seller', async () => {
    const { output } = await risk();
    expect(output.conditionCategory).toBe('used');
    expect(output.conditionEvidence).toEqual({ source: 'text', field: 'conditionText', quote: 'Used - good' });
    expect(output.riskFactors).toEqual([
      { code: 'damage_mentioned', severity: 'low', note: 'Mentions cosmetic wear: "scuffs"', evidence: { source: 'text', field: 'description', quote: 'scuffs' } },
    ]);
    expect(output.riskLevel).toBe('low');
    expect(output.seller.status).toBe('not_available');
    expect(output.missingInformation.map((q) => q.topic)).toEqual(['battery', 'lock_status']);
  });

  it('flags faulty and locked devices as high risk', async () => {
    const { output } = await risk({ title: 'iPhone 13 for parts', description: 'iCloud locked, does not power on. Sold as is.', conditionText: null });
    expect(output.riskLevel).toBe('high');
    expect(output.conditionCategory).toBe('for_parts');
    expect(output.riskFactors.map((f) => f.code)).toEqual(['not_working', 'locked_or_blacklisted', 'sold_as_is']);
  });

  it('uses listing facts (not guesses) for missing photos, price, description and staleness', async () => {
    const { output } = await risk({ photoCount: 0, price: null, description: 'Ok', listedAt: '2026-08-01T00:00:00.000Z' });
    expect(output.riskFactors.filter((f) => f.evidence.source === 'listing_field')).toEqual([
      expect.objectContaining({ code: 'vague_description', evidence: { source: 'listing_field', field: 'description', value: '2 chars' } }),
      expect.objectContaining({ code: 'no_photos', evidence: { source: 'listing_field', field: 'photoCount', value: '0' } }),
      expect.objectContaining({ code: 'no_price', evidence: { source: 'listing_field', field: 'price', value: 'none' } }),
      expect.objectContaining({ code: 'stale_listing', note: 'Listed 67 days ago', evidence: { source: 'listing_field', field: 'listedAt', value: '2026-08-01T00:00:00.000Z' } }),
    ]);
    expect(output.missingInformation.map((q) => q.topic)).toEqual(expect.arrayContaining(['photos', 'price', 'availability']));
  });

  it('says "unknown" when the listing gives nothing to go on', async () => {
    const { output } = await risk({ description: null, conditionText: null, title: 'iPhone 13' });
    expect(output).toMatchObject({ conditionCategory: 'unknown', conditionEvidence: null });
    expect(output.missingInformation.map((q) => q.topic)).toContain('condition');
  });
});

describe('analyzeCandidate with the mock', () => {
  it('produces a complete, explained, persistable record', async () => {
    const record = await analyzeCandidate(ai, candidate(), () => 0);
    expect(record).toMatchObject({
      status: 'COMPLETED',
      provider: 'mock',
      model: 'mock-rules',
      modelVersion: '1.0.0',
      promptVersion: 'product-extraction@1,condition-risk@1,deal-explanation@1',
      schemaVersion: 1,
      durationMs: 0,
      errorMessage: null,
    });
    expect(Object.keys(record.providerMetadata.tasks)).toEqual(['extractProduct', 'assessConditionRisk', 'explainDeal']);
    const explanation = record.result!.explanation;
    expect(explanation.headline).toMatch(/^Apple iPhone 13 128GB - ZAR\s4,100\.00$/); // Intl uses a no-break space
    expect(explanation.positives.map((p) => p.basis)).toEqual([
      { kind: 'product', field: 'queryFit' },
      { kind: 'match_check', check: 'relevance' },
      { kind: 'match_check', check: 'price' },
    ]);
    expect(explanation.concerns.map((p) => p.basis)).toEqual([
      { kind: 'risk_factor', code: 'damage_mentioned' },
      { kind: 'match_check', check: 'geography' },
    ]);
    expect(explanation.valuation.status).toBe('unavailable');
    expect(explanation.nextStep).toBe('ask_seller');
    expect(explanation.questionsForSeller).toHaveLength(2);
    expect(explanation.summary).toContain('Resale value and profit are not estimated yet.');
  });

  it('recommends skipping high-risk or wrong-model listings', async () => {
    const faulty = await analyzeCandidate(ai, candidate({ description: 'Cracked screen, not working.' }));
    expect(faulty.result!.explanation.nextStep).toBe('skip');
    const wrong = await analyzeCandidate(ai, candidate({ title: 'Apple iPhone 12 64GB' }));
    expect(wrong.result!.explanation.nextStep).toBe('skip');
    expect(wrong.result!.explanation.concerns[0]!.basis).toEqual({ kind: 'product', field: 'queryFit' });
  });

  it('builds a stable input key (order-insensitive objects)', () => {
    const input = candidate();
    const reordered = JSON.parse(JSON.stringify({ ...input, asOf: input.asOf })) as CandidateAnalysisInput;
    const versions = { provider: 'mock', promptVersion: 'p@1' };
    expect(analysisInputKey(input, versions)).toBe(analysisInputKey(reordered, versions));
    expect(analysisInputKey(input, versions)).not.toBe(analysisInputKey(candidate({ price: null }), versions));
  });

  it('analyses every seeded development listing without a validation failure', async () => {
    const adapter = new DevEbayAdapter({ epoch: new Date(AS_OF), now: () => new Date(AS_OF), currency: 'ZAR' });
    let count = 0;
    for (const product of DEV_PRODUCTS) {
      for (const devCase of DEV_CASES.filter((c) => c.marketplaces.includes('ebay'))) {
        const raw = await adapter.fetchListing(`dev-ebay-${product.key}-${devCase.key}`);
        const normalized = normalizeRawListing(adapter, raw!);
        if (normalized.status !== 'NORMALIZED') throw new Error(normalized.reason);
        const l = normalized.listing;
        const record = await analyzeCandidate(ai, {
          ...candidate(),
          listing: {
            marketplace: l.marketplace,
            title: l.title,
            description: l.description,
            price: l.price,
            conditionText: l.conditionText,
            locationText: l.locationText,
            photoCount: l.imageUrls.length,
            listedAt: l.listedAt?.toISOString() ?? null,
            status: l.status,
          },
          hunt: { ...candidate().hunt, query: product.title },
        });
        expect(record.status, `${product.key}/${devCase.key}: ${record.errorMessage}`).toBe('COMPLETED');
        expect(record.result!.product.queryFit).toBe('matches');
        count += 1;
      }
    }
    expect(count).toBe(DEV_PRODUCTS.length * 9);
  });
});

describe('withValidation (grounding)', () => {
  /** A provider that returns the mock's output with one thing changed. */
  function tampered(change: { product?: (o: any) => void; risk?: (o: any) => void; explain?: (o: any) => void }): AIProvider {
    const inner = new MockAIProvider();
    return withValidation({
      id: 'mock',
      extractProduct: async (i) => {
        const r = await inner.extractProduct(i);
        change.product?.(r.output);
        return r;
      },
      assessConditionRisk: async (i) => {
        const r = await inner.assessConditionRisk(i);
        change.risk?.(r.output);
        return r;
      },
      explainDeal: async (i) => {
        const r = await inner.explainDeal(i);
        change.explain?.(r.output);
        return r;
      },
    });
  }
  const failure = async (provider: AIProvider) => {
    const record = await analyzeCandidate(provider, candidate());
    expect(record.status).toBe('FAILED');
    return record as Extract<typeof record, { status: 'FAILED' }>;
  };

  it('rejects quotes that are not in the listing', async () => {
    const r = await failure(tampered({ product: (o) => (o.model = { value: 'iPhone 13 Pro', evidence: { source: 'text', field: 'title', quote: 'iPhone 13 Pro' } }) }));
    expect(r).toMatchObject({ errorCode: 'UNGROUNDED_OUTPUT', retryable: false });
    expect(r.errorMessage).toContain('"iPhone 13 Pro" is not in title');
  });

  it('rejects a normalized name with words that were never extracted', async () => {
    const r = await failure(tampered({ product: (o) => (o.normalizedName = 'Apple iPhone 13 Pro Max 128GB') }));
    expect(r.errorMessage).toContain('normalizedName adds words not extracted from the listing: pro, max');
  });

  it('rejects listing facts that do not match the listing', async () => {
    const r = await failure(
      tampered({ risk: (o) => o.riskFactors.push({ code: 'no_photos', severity: 'medium', note: 'No photos', evidence: { source: 'listing_field', field: 'photoCount', value: '0' } }) }),
    );
    expect(r.errorMessage).toContain('photoCount is not "0"');
  });

  it('cannot describe seller history or comparable sales (not available yet)', async () => {
    const seller = await failure(tampered({ risk: (o) => (o.seller = { status: 'trusted', note: '5 years, 200 sales' }) }));
    expect(seller.errorCode).toBe('INVALID_OUTPUT');
    const valuation = await failure(tampered({ explain: (o) => (o.valuation = { status: 'estimated', resaleMinor: 600_000 }) }));
    expect(valuation.errorCode).toBe('INVALID_OUTPUT');
  });

  it('rejects explanations that cite checks or risks that do not support them', async () => {
    const r = await failure(
      tampered({
        explain: (o) => {
          o.positives.push({ text: 'Close by', basis: { kind: 'match_check', check: 'geography' } });
          o.concerns.push({ text: 'Locked', basis: { kind: 'risk_factor', code: 'locked_or_blacklisted' } });
        },
      }),
    );
    expect(r.errorCode).toBe('UNGROUNDED_OUTPUT');
    expect(r.errorMessage).toContain('check "geography" did not pass');
    expect(r.errorMessage).toContain('risk "locked_or_blacklisted" was not assessed');
  });

  it('turns unexpected provider failures into retryable UNAVAILABLE', async () => {
    const r = await failure(
      withValidation({
        ...new MockAIProvider(),
        id: 'mock',
        extractProduct: () => Promise.reject(new Error('socket hang up')),
        assessConditionRisk: (i) => new MockAIProvider().assessConditionRisk(i),
        explainDeal: (i) => new MockAIProvider().explainDeal(i),
      }),
    );
    expect(r).toMatchObject({ errorCode: 'UNAVAILABLE', retryable: true });
  });

  it('needs configuration for Foundry; the mock needs none', () => {
    expect(() => createAIProvider('foundry')).toThrow(AIProviderError);
    expect(createAIProvider('mock').id).toBe('mock');
  });
});
