import { describe, expect, it } from 'vitest';
import { analyzeCandidate, type CandidateAnalysisInput } from '../analysis.js';
import { createAIProvider } from '../factory.js';
import { MockAIProvider } from '../mock/mock-ai-provider.js';
import { AIProviderError, type DealExplanationInput, type EvidenceAvailability, type ListingFacts } from '../provider.js';
import { conditionRiskSchema, dealExplanationSchema, productExtractionSchema } from '../schemas.js';
import { chatCompletionsUrl, FoundryAIProvider, foundryWorstCaseMs, type FoundryConfig, type FoundryFetch, type FoundryHttpResponse } from './foundry-ai-provider.js';
import { resolveFoundryConfig } from './foundry-config.js';
import { FOUNDRY_PROMPT_VERSIONS } from './prompts.js';
import { toStrictJsonSchema, type JsonSchema } from './strict-json-schema.js';

const KEY = 'super-secret-key-123';
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
const candidate: CandidateAnalysisInput = {
  listing,
  hunt: { query: 'iPhone 13', conditions: [], maxPrice: { amountMinor: 450_000, currency: 'ZAR' }, target: null, exclusions: [] },
  matchChecks: [
    { check: 'relevance', outcome: 'pass', detail: 'Mentions iphone, 13' },
    { check: 'price', outcome: 'pass', detail: 'At or under your max price' },
  ],
  economics: { acquisition: listing.price, target: null },
  asOf: AS_OF,
};

const CONFIG: FoundryConfig = {
  endpoint: 'https://rein-test.openai.azure.com/',
  auth: { kind: 'api-key', key: KEY },
  deployments: { extractProduct: 'extract-mini', assessConditionRisk: 'risk-mini', explainDeal: 'explain-4o' },
  maxRetries: 2,
};

interface Call {
  url: string;
  headers: Record<string, string>;
  body: { model: string; messages: { role: string; content: string }[]; response_format: { json_schema: { name: string; strict: boolean; schema: JsonSchema } }; [k: string]: unknown };
}
type Reply = FoundryHttpResponse | Error;
const response = (status: number, body: unknown, headers: Record<string, string> = {}): FoundryHttpResponse => ({
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});
const completion = (content: string, o: { finish?: string; usage?: boolean } = {}) =>
  response(200, {
    id: 'chatcmpl-abc',
    object: 'chat.completion',
    model: 'gpt-4.1-mini-2025-04-14',
    choices: [{ index: 0, finish_reason: o.finish ?? 'stop', message: { role: 'assistant', content, refusal: null } }],
    usage: o.usage === false ? undefined : { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 },
  });

/** A fake Foundry deployment that answers like a well-behaved model (the mock's rules), unless overridden. */
function fakeFoundry(override?: (call: Call, n: number) => Reply | undefined) {
  const calls: Call[] = [];
  const raw = new MockAIProvider();
  const fetch: FoundryFetch = async (url, init) => {
    const call: Call = { url, headers: init.headers, body: JSON.parse(init.body) as Call['body'] };
    calls.push(call);
    const custom = override?.(call, calls.length);
    if (custom instanceof Error) throw custom;
    if (custom) return custom;
    const p = JSON.parse(call.body.messages[1]!.content) as DealExplanationInput & { asOf: string; evidenceAvailability: EvidenceAvailability };
    const task = call.body.response_format.json_schema.name;
    const result =
      task === 'product_extraction'
        ? await raw.extractProduct({ listing: p.listing, hunt: p.hunt })
        : task === 'condition_risk'
          ? await raw.assessConditionRisk({ listing: p.listing, asOf: p.asOf, evidence: p.evidenceAvailability })
          : await raw.explainDeal({ listing: p.listing, hunt: p.hunt, matchChecks: p.matchChecks, product: p.product, risk: p.risk, economics: p.economics, evidence: p.evidenceAvailability });
    return completion(JSON.stringify(result.output));
  };
  return { fetch, calls };
}

const sleeps: number[] = [];
const provider = (fetch: FoundryFetch, config: Partial<FoundryConfig> = {}) => {
  sleeps.length = 0;
  return createAIProvider('foundry', { ...CONFIG, ...config }, { fetch, sleep: async (ms) => void sleeps.push(ms), random: () => 0, clock: () => 1_000_000 });
};
const extract = (ai: ReturnType<typeof provider>) => ai.extractProduct({ listing, hunt: { query: 'iPhone 13' } });

describe('strict JSON schemas for Azure structured outputs', () => {
  const FORBIDDEN = ['oneOf', 'const', 'minLength', 'maxLength', 'pattern', 'format', 'minimum', 'maximum', 'minItems', 'maxItems', '$schema'];
  const walk = (node: JsonSchema, depth: number, visit: (n: JsonSchema, depth: number) => void) => {
    visit(node, depth);
    const childDepth = node.type === 'object' ? depth + 1 : depth;
    for (const child of Object.values((node.properties as Record<string, JsonSchema>) ?? {})) walk(child, childDepth, visit);
    if (node.items) walk(node.items as JsonSchema, childDepth, visit);
    for (const alt of (node.anyOf as JsonSchema[]) ?? []) walk(alt, depth, visit);
  };

  it.each([
    ['product extraction', productExtractionSchema],
    ['condition risk', conditionRiskSchema],
    ['deal explanation', dealExplanationSchema],
  ])('%s: objects closed, every field required, only supported keywords, nesting <= 5, <= 100 properties', (_, zod) => {
    const schema = toStrictJsonSchema(zod);
    let properties = 0;
    let maxDepth = 0;
    walk(schema, 0, (n, depth) => {
      for (const k of FORBIDDEN) expect(n, `keyword ${k}`).not.toHaveProperty(k);
      if (n.type === 'object') {
        expect(n.additionalProperties).toBe(false);
        expect(n.required).toEqual(Object.keys(n.properties as object));
        properties += Object.keys(n.properties as object).length;
        maxDepth = Math.max(maxDepth, depth + 1);
      }
    });
    expect(schema.type).toBe('object');
    expect(maxDepth).toBeLessThanOrEqual(5);
    expect(properties).toBeLessThanOrEqual(100);
  });

  it('turns nullable discriminated unions into one flat anyOf with enums for literals', () => {
    const risk = toStrictJsonSchema(conditionRiskSchema) as { properties: Record<string, JsonSchema> };
    const evidence = risk.properties.conditionEvidence!.anyOf as JsonSchema[];
    expect(evidence.map((e) => e.type)).toEqual(['object', 'object', 'null']);
    expect((evidence[0]!.properties as Record<string, JsonSchema>).source).toEqual({ type: 'string', enum: ['text'] });
  });
});

describe('FoundryAIProvider - requests', () => {
  it('calls the v1 chat completions endpoint with the task deployment, strict json_schema and the key as a header', async () => {
    const { fetch, calls } = fakeFoundry();
    await extract(provider(fetch));
    const [call] = calls;
    expect(call!.url).toBe('https://rein-test.openai.azure.com/openai/v1/chat/completions');
    expect(call!.headers).toEqual({ 'content-type': 'application/json', 'api-key': KEY });
    expect(call!.body).toMatchObject({ model: 'extract-mini', max_completion_tokens: 1500, response_format: { type: 'json_schema', json_schema: { name: 'product_extraction', strict: true } } });
    expect(call!.body).not.toHaveProperty('temperature'); // reasoning deployments reject it
    expect(call!.body.messages.map((m) => m.role)).toEqual(['system', 'user']);
    // The model gets the canonical values that listing_field evidence must match.
    expect(JSON.parse(call!.body.messages[1]!.content)).toMatchObject({ canonicalFacts: { price: 'ZAR 410000', photoCount: '3', listedAt: listing.listedAt } });
    expect(JSON.stringify(call!.body) + call!.url).not.toContain(KEY);
  });

  it('builds the URL from any endpoint form', () => {
    for (const e of ['https://x.openai.azure.com', 'https://x.openai.azure.com/', 'https://x.openai.azure.com/openai/v1/']) {
      expect(chatCompletionsUrl(e)).toBe('https://x.openai.azure.com/openai/v1/chat/completions');
    }
    expect(chatCompletionsUrl('https://x.services.ai.azure.com')).toBe('https://x.services.ai.azure.com/openai/v1/chat/completions');
  });

  it('sends a bearer token for Entra ID auth', async () => {
    const { fetch, calls } = fakeFoundry();
    await extract(provider(fetch, { auth: { kind: 'bearer', getToken: async () => 'entra-token' } }));
    expect(calls[0]!.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer entra-token' });
  });

  it('refuses to start without a deployment', () => {
    expect(() => new FoundryAIProvider({ ...CONFIG, deployments: { ...CONFIG.deployments, explainDeal: ' ' } }, { fetch: fakeFoundry().fetch })).toThrow(/No Foundry deployment configured for explainDeal/);
  });
});

describe('FoundryAIProvider - results, usage and validation', () => {
  it('runs a full candidate analysis with per-task deployments, usage, prompt versions and cost', async () => {
    const { fetch, calls } = fakeFoundry();
    const ai = provider(fetch, { pricing: { inputPer1M: 0.4, outputPer1M: 1.6 } });
    const record = await analyzeCandidate(ai, candidate, () => 0);
    expect(record.status).toBe('COMPLETED');
    expect(calls.map((c) => c.body.model).sort()).toEqual(['explain-4o', 'extract-mini', 'risk-mini']);
    expect(record).toMatchObject({
      provider: 'foundry',
      model: 'extract-mini,risk-mini,explain-4o',
      modelVersion: 'gpt-4.1-mini-2025-04-14',
      promptVersion: Object.values(FOUNDRY_PROMPT_VERSIONS).join(','),
    });
    // 1000 in * 0.4 + 200 out * 1.6 per million = 0.00072 USD per task.
    expect(record.providerMetadata.tasks.extractProduct).toEqual({
      provider: 'foundry',
      model: 'extract-mini',
      modelVersion: 'gpt-4.1-mini-2025-04-14',
      promptVersion: 'foundry-product-extraction@1',
      schemaVersion: 1,
      latencyMs: 0,
      usage: { inputTokens: 1000, outputTokens: 200 },
      requestId: 'chatcmpl-abc',
      costUsd: 0.00072,
      attempts: 1,
    });
  });

  it('reports cost as unknown without pricing, and usage as null when the response has none', async () => {
    const { fetch } = fakeFoundry();
    expect((await extract(provider(fetch))).meta).toMatchObject({ costUsd: null, usage: { inputTokens: 1000 } });
    const noUsage = fakeFoundry(() => completion(JSON.stringify({ category: null, brand: null, model: null, attributes: [], normalizedName: null, queryFit: 'unclear', queryFitNote: 'n/a', confidence: 'low' }), { usage: false }));
    expect((await extract(provider(noUsage.fetch, { pricing: { inputPer1M: 1, outputPer1M: 1 } }))).meta).toMatchObject({ usage: null, costUsd: null });
  });

  it('rejects output that breaks the schema, is not JSON, was cut off, refused or filtered', async () => {
    const cases: [Reply, string][] = [
      [completion(JSON.stringify({ category: 'spaceship' })), 'INVALID_OUTPUT'],
      [completion('not json'), 'INVALID_OUTPUT'],
      [completion('{"category":', { finish: 'length' }), 'INVALID_OUTPUT'],
      [response(200, { choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'I cannot help' } }] }), 'INVALID_OUTPUT'],
      [completion('', { finish: 'content_filter' }), 'CONTENT_FILTERED'],
    ];
    for (const [reply, code] of cases) {
      const err = await extract(provider(fakeFoundry(() => reply).fetch)).catch((e: unknown) => e);
      expect(err, code).toBeInstanceOf(AIProviderError);
      expect(err).toMatchObject({ code, retryable: false });
    }
  });

  it('rejects ungrounded claims even when the shape is valid', async () => {
    const invented = { category: 'phone', brand: { value: 'Apple', evidence: { source: 'text', field: 'title', quote: 'Apple iPhone 14 Pro' } }, model: null, attributes: [], normalizedName: 'Apple', queryFit: 'matches', queryFitNote: 'ok', confidence: 'high' };
    await expect(extract(provider(fakeFoundry(() => completion(JSON.stringify(invented))).fetch))).rejects.toMatchObject({ code: 'UNGROUNDED_OUTPUT' });
  });
});

describe('FoundryAIProvider - errors, timeouts and retries', () => {
  const failingWith = (reply: Reply) => fakeFoundry(() => reply);

  it('maps auth, missing deployment, content filter and bad requests - without retrying or leaking the key', async () => {
    const cases: [Reply, string][] = [
      [response(401, { error: { code: '401', message: 'Access denied due to invalid subscription key' } }), 'NOT_CONFIGURED'],
      [response(404, { error: { code: 'DeploymentNotFound', message: 'The API deployment for this resource does not exist.' } }), 'NOT_CONFIGURED'],
      [response(400, { error: { code: 'content_filter', message: 'The response was filtered', param: 'prompt', status: 400 } }), 'CONTENT_FILTERED'],
      [response(400, { error: { code: 'invalid_request_error', message: "Invalid parameter: 'response_format' of type 'json_schema' is not supported with this model." } }), 'REQUEST_REJECTED'],
    ];
    for (const [reply, code] of cases) {
      const { fetch, calls } = failingWith(reply);
      const err = (await extract(provider(fetch)).catch((e: unknown) => e)) as AIProviderError;
      expect(err, code).toMatchObject({ code, retryable: false });
      expect(calls).toHaveLength(1);
      expect(`${err.message} ${err.details.join(' ')}`).not.toContain(KEY);
    }
  });

  it('retries a 429 after the retry-after-ms the service asks for', async () => {
    const { fetch, calls } = fakeFoundry((_, n) => (n === 1 ? response(429, { error: { code: '429', message: 'Rate limit is exceeded' } }, { 'retry-after-ms': '2500' }) : undefined));
    const result = await extract(provider(fetch));
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2500]);
    expect(result.meta.attempts).toBe(2);
  });

  it('hands long rate-limit waits to the job queue instead of sleeping', async () => {
    const { fetch, calls } = failingWith(response(429, { error: { message: 'Rate limit is exceeded' } }, { 'retry-after': '60' }));
    const err = (await extract(provider(fetch)).catch((e: unknown) => e)) as AIProviderError;
    expect(err).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    expect(err.retryAfter).toEqual(new Date(1_000_000 + 60_000));
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('retries 5xx and network errors with exponential backoff, then gives up as retryable', async () => {
    const { fetch, calls } = failingWith(response(503, { error: { message: 'Service Unavailable' } }));
    await expect(extract(provider(fetch))).rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: true });
    expect(calls).toHaveLength(3); // 1 + maxRetries
    expect(sleeps).toEqual([1000, 2000]);

    const flaky = fakeFoundry((_, n) => (n === 1 ? new Error('ECONNRESET') : undefined));
    expect((await extract(provider(flaky.fetch))).meta.attempts).toBe(2);
    const noRetries = failingWith(new Error('ECONNRESET'));
    await expect(extract(provider(noRetries.fetch, { maxRetries: 0 }))).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(noRetries.calls).toHaveLength(1);
  });

  it('aborts a request that takes longer than the timeout', async () => {
    let signal: { aborted?: boolean } | undefined;
    const hanging: FoundryFetch = (_url, init) =>
      new Promise((_, reject) => {
        signal = init.signal as { aborted?: boolean };
        (init.signal as { addEventListener(t: string, f: () => void): void }).addEventListener('abort', () => reject(new Error('aborted')));
      });
    const ai = createAIProvider('foundry', { ...CONFIG, timeoutMs: 20, maxRetries: 0 }, { fetch: hanging });
    await expect(extract(ai)).rejects.toMatchObject({ code: 'UNAVAILABLE', message: expect.stringMatching(/timeout/) });
    expect(signal?.aborted).toBe(true);
  });

  it('records a retryable failed analysis with the time the service asked for', async () => {
    const { fetch } = failingWith(response(429, { error: { message: 'Rate limit is exceeded' } }, { 'retry-after-ms': '45000' }));
    const record = await analyzeCandidate(provider(fetch), candidate);
    expect(record).toMatchObject({ status: 'FAILED', errorCode: 'RATE_LIMITED', retryable: true, retryAfter: new Date(1_045_000) });
  });
});

describe('foundryWorstCaseMs', () => {
  it('fits the default 120 s job lease with the defaults', () => {
    expect(foundryWorstCaseMs({})).toBe(2 * (2 * 25_000 + 5_000));
    expect(foundryWorstCaseMs({})).toBeLessThanOrEqual(120_000);
    expect(foundryWorstCaseMs({ timeoutMs: 60_000, maxRetries: 2 })).toBe(2 * (3 * 60_000 + 2 * 5_000));
  });
});

describe('resolveFoundryConfig', () => {
  const base = { FOUNDRY_ENDPOINT: 'https://x.openai.azure.com', FOUNDRY_API_KEY: KEY, FOUNDRY_DEPLOYMENT: 'gpt-4o-mini-prod' };

  it('is not needed for the mock', () => {
    expect(resolveFoundryConfig('mock', {})).toEqual({ foundry: null, problems: [] });
  });

  it('reads endpoint, key, deployments (shared or per task), limits and pricing', () => {
    expect(resolveFoundryConfig('foundry', { ...base, FOUNDRY_DEPLOYMENT_DEAL_EXPLANATION: 'gpt-4o-prod', FOUNDRY_TIMEOUT_MS: 20_000, FOUNDRY_PRICE_INPUT_PER_1M_USD: 0.15, FOUNDRY_PRICE_OUTPUT_PER_1M_USD: 0.6 })).toEqual({
      foundry: {
        endpoint: base.FOUNDRY_ENDPOINT,
        auth: { kind: 'api-key', key: KEY },
        deployments: { extractProduct: 'gpt-4o-mini-prod', assessConditionRisk: 'gpt-4o-mini-prod', explainDeal: 'gpt-4o-prod' },
        timeoutMs: 20_000,
        maxRetries: undefined,
        maxOutputTokens: undefined,
        pricing: { inputPer1M: 0.15, outputPer1M: 0.6 },
      },
      problems: [],
    });
  });

  it('lists every missing or inconsistent variable', () => {
    expect(resolveFoundryConfig('foundry', { FOUNDRY_PRICE_INPUT_PER_1M_USD: 1 }).problems).toEqual([
      'FOUNDRY_ENDPOINT: required when AI_PROVIDER=foundry',
      'FOUNDRY_API_KEY: required when AI_PROVIDER=foundry',
      'FOUNDRY_DEPLOYMENT: required when AI_PROVIDER=foundry (or set every FOUNDRY_DEPLOYMENT_<TASK>)',
      'FOUNDRY_PRICE_INPUT_PER_1M_USD / FOUNDRY_PRICE_OUTPUT_PER_1M_USD: set both or neither',
    ]);
    // Per-task deployments can replace the shared one.
    expect(
      resolveFoundryConfig('foundry', {
        FOUNDRY_ENDPOINT: base.FOUNDRY_ENDPOINT,
        FOUNDRY_API_KEY: KEY,
        FOUNDRY_DEPLOYMENT_PRODUCT_EXTRACTION: 'a',
        FOUNDRY_DEPLOYMENT_CONDITION_RISK: 'b',
        FOUNDRY_DEPLOYMENT_DEAL_EXPLANATION: 'c',
      }).problems,
    ).toEqual([]);
  });
});
