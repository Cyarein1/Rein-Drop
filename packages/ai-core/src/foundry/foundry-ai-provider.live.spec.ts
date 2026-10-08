import { describe, expect, it } from 'vitest';
import { analyzeCandidate, type CandidateAnalysisInput } from '../analysis.js';
import { createAIProvider } from '../factory.js';
import { foundryEnvShape, resolveFoundryConfig, type FoundryEnv } from './foundry-config.js';
import { z } from 'zod';

/**
 * LIVE test against your Microsoft Foundry deployment(s) (costs a few thousand tokens: one
 * candidate analysis = 3 requests). Skipped unless the environment has
 *   FOUNDRY_ENDPOINT, FOUNDRY_API_KEY and FOUNDRY_DEPLOYMENT (or the per-task variables),
 * optionally FOUNDRY_PRICE_INPUT_PER_1M_USD / FOUNDRY_PRICE_OUTPUT_PER_1M_USD.
 * Never commit the key: shell or untracked .env only.
 */
const raw = ((globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}) as Record<string, string | undefined>;
const parsed = z.object(foundryEnvShape).safeParse(raw);
const { foundry } = parsed.success ? resolveFoundryConfig('foundry', parsed.data as FoundryEnv) : { foundry: null };

const candidate: CandidateAnalysisInput = {
  listing: {
    marketplace: 'ebay',
    title: 'Apple iPhone 13 128GB Midnight - unlocked',
    description: 'Used for a year, battery health 88%. Small scratch on the back glass. Comes with the original box, no charger.',
    price: { amountMinor: 32_000, currency: 'USD' },
    conditionText: 'Used',
    locationText: 'Austin, TX',
    photoCount: 6,
    listedAt: '2026-10-06T08:00:00.000Z',
    status: 'ACTIVE',
  },
  hunt: { query: 'iPhone 13', conditions: ['used'], maxPrice: { amountMinor: 35_000, currency: 'USD' }, target: null, exclusions: ['broken'] },
  matchChecks: [
    { check: 'relevance', outcome: 'pass', detail: 'Mentions iphone, 13' },
    { check: 'price', outcome: 'pass', detail: 'At or under your max price' },
    { check: 'geography', outcome: 'unverified', detail: 'Distance not checked yet' },
  ],
  economics: { acquisition: { amountMinor: 32_000, currency: 'USD' }, target: null },
  asOf: '2026-10-07T00:00:00.000Z',
};

describe.skipIf(!foundry)('Microsoft Foundry AIProvider (LIVE - needs FOUNDRY_ENDPOINT + FOUNDRY_API_KEY + FOUNDRY_DEPLOYMENT)', () => {
  it('one candidate analysis: structured, validated, grounded, with usage metadata', async () => {
    const record = await analyzeCandidate(createAIProvider('foundry', foundry), candidate);
    // A failure here prints the validator's reasons (schema / grounding) - the prompts may need work.
    expect(record.status === 'FAILED' ? `${record.errorCode}: ${record.errorMessage}` : 'COMPLETED').toBe('COMPLETED');
    for (const meta of Object.values(record.providerMetadata.tasks)) {
      expect(meta.provider).toBe('foundry');
      expect(meta.usage?.inputTokens).toBeGreaterThan(0);
      expect(meta.requestId).toBeTruthy();
    }
    expect(record.result?.explanation.valuation.status).toBe('unavailable');
  }, 180_000);
});
