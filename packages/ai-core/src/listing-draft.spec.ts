import { describe, expect, it } from 'vitest';
import { createAIProvider, createMockAIProvider } from './factory.js';
import type { FoundryFetch } from './foundry/foundry-ai-provider.js';
import { AIProviderError, type ListingDraftFacts } from './provider.js';
import { LISTING_TITLE_MAX, type ListingDraftSuggestion } from './schemas.js';
import { checkListingDraft } from './validation.js';

const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });
const FACTS: ListingDraftFacts = {
  itemTitle: 'Apple iPhone 13 128GB Midnight',
  sourceTitle: 'iPhone 13 128GB midnight - unlocked',
  sourceDescription: 'Battery health 89%. Small scratch on the back. Comes with box.',
  sourceConditionText: 'Used',
  sourceMarketplace: 'facebook',
  purchasePrice: ZAR(450_000),
  resaleEstimate: { low: ZAR(520_000), typical: ZAR(580_000), high: ZAR(640_000), sampleSize: 9 },
  sellerNotes: 'Battery 89%, small scratch on back',
  photoCount: 1,
  localeTag: 'en-ZA',
};
const ai = createMockAIProvider();
const good = async (): Promise<ListingDraftSuggestion> => (await ai.draftListing(FACTS)).output;
const rejects = (facts: ListingDraftFacts, output: unknown, problem: RegExp) => {
  try {
    checkListingDraft(facts, output);
  } catch (err) {
    expect(err).toBeInstanceOf(AIProviderError);
    expect((err as AIProviderError).details.join(' | ')).toMatch(problem);
    return;
  }
  throw new Error('expected the draft to be rejected');
};

describe('draftListing (mock, validated)', () => {
  it('writes an honest draft from the item facts, priced from the resale estimate', async () => {
    const draft = await good();
    expect(draft.title).toBe('Apple iPhone 13 128GB Midnight');
    expect(draft.condition).toBe('good');
    expect(draft.itemSpecifics).toEqual(
      expect.arrayContaining([
        { name: 'Brand', value: 'Apple' },
        { name: 'Model', value: 'iPhone 13' },
        { name: 'Storage', value: '128GB' },
        { name: 'Colour', value: 'Midnight' },
      ]),
    );
    expect(draft.description).toMatch(/small scratch on back/);
    expect(draft.suggestedPrice).toEqual({ amount: ZAR(580_000), basis: 'resale_estimate' });
    expect(draft.checks).toContain('Add at least 3 clear photos (front, back and any marks).');
  });

  it('never mentions the purchase price or where it was bought', async () => {
    const draft = await good();
    expect(`${draft.title} ${draft.description}`).not.toMatch(/4500|4 500|facebook/i);
  });

  it('without a resale estimate there is no price - the seller sets it', async () => {
    const draft = (await ai.draftListing({ ...FACTS, resaleEstimate: null })).output;
    expect(draft.suggestedPrice).toBeNull();
    expect(draft.checks).toContain('Set your price - there is no resale estimate for this item.');
  });

  it('keeps titles within the marketplace limit, cut at a word', async () => {
    const long = (await ai.draftListing({ ...FACTS, itemTitle: 'Apple iPhone 13 128GB Midnight unlocked with original box charger cable and two extra cases' })).output;
    expect(long.title.length).toBeLessThanOrEqual(LISTING_TITLE_MAX);
    expect(long.title.endsWith(' ')).toBe(false);
  });

  it('faulty items are listed for parts', async () => {
    expect((await ai.draftListing({ ...FACTS, sellerNotes: 'Not working, screen broken' })).output.condition).toBe('for_parts');
  });
});

describe('checkListingDraft grounding', () => {
  it('rejects item specifics that are not in the item text', async () => {
    rejects(FACTS, { ...(await good()), itemSpecifics: [{ name: 'Storage', value: '256GB' }] }, /256GB/);
  });

  it('rejects a price outside the estimate, in another currency, or without an estimate', async () => {
    const d = await good();
    rejects(FACTS, { ...d, suggestedPrice: { amount: ZAR(900_000), basis: 'resale_estimate' } }, /outside the resale estimate range/);
    rejects(FACTS, { ...d, suggestedPrice: { amount: { amountMinor: 580_000, currency: 'USD' }, basis: 'resale_estimate' } }, /currency/);
    rejects({ ...FACTS, resaleEstimate: null }, d, /no resale estimate/);
  });

  it('rejects leaks of private facts and unsupported claims', async () => {
    const d = await good();
    rejects(FACTS, { ...d, description: `${d.description}\nI paid R4 500 for it.` }, /purchase price/);
    rejects(FACTS, { ...d, description: `${d.description}\nBought on Facebook.` }, /where it was bought/);
    rejects(FACTS, { ...d, description: 'Guaranteed to work.' }, /guarantee/);
    rejects(FACTS, { ...d, description: 'Brand new in box.' }, /brand new/);
    rejects(FACTS, { ...d, description: 'Still under warranty.' }, /warranty/);
  });

  it('rejects emoji and ALL CAPS titles', async () => {
    const d = await good();
    rejects(FACTS, { ...d, title: 'iPhone 13 🔥' }, /emoji/);
    rejects(FACTS, { ...d, title: 'IPHONE 13 MIDNIGHT' }, /ALL CAPS/);
  });
});

describe('draftListing through Foundry', () => {
  it('sends the item and keeps private facts in a separate "private" block; the output is validated', async () => {
    const draft = await good();
    let body: { messages: { content: string }[]; model: string; response_format: { json_schema: { name: string } } } | null = null;
    const fetch: FoundryFetch = async (_url, init) => {
      body = JSON.parse(init.body);
      return {
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ id: 'x', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(draft) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }),
      };
    };
    const foundry = createAIProvider(
      'foundry',
      { endpoint: 'https://t.openai.azure.com', auth: { kind: 'api-key', key: 'k' }, deployments: { extractProduct: 'a', assessConditionRisk: 'b', explainDeal: 'c', draftListing: 'draft-mini' } },
      { fetch },
    );
    const result = await foundry.draftListing(FACTS);
    expect(result.output.title).toBe(draft.title);
    expect(result.meta.promptVersion).toBe('foundry-listing-draft@1');
    expect(body!.model).toBe('draft-mini');
    expect(body!.response_format.json_schema.name).toBe('listing_draft');
    const sent = JSON.parse(body!.messages[1]!.content) as { item: Record<string, unknown>; private: Record<string, unknown> };
    expect(sent.item).not.toHaveProperty('purchasePrice');
    expect(sent.private).toEqual({ purchasePrice: FACTS.purchasePrice, sourceMarketplace: 'facebook' });
  });
});
