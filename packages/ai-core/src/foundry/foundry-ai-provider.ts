import { z } from 'zod';
import {
  AIProviderError,
  type AIProvider,
  type AIResult,
  type ConditionRiskInput,
  type DealExplanationInput,
  type ProductExtractionInput,
} from '../provider.js';
import {
  AI_SCHEMA_VERSION,
  conditionRiskSchema,
  dealExplanationSchema,
  productExtractionSchema,
  type AIResultMeta,
  type ConditionRiskAssessment,
  type DealExplanation,
  type ProductExtraction,
} from '../schemas.js';
import { FOUNDRY_PROMPT_VERSIONS, systemPrompt, userPayload, type FoundryTask } from './prompts.js';
import { toStrictJsonSchema, type JsonSchema } from './strict-json-schema.js';

/**
 * Microsoft Foundry AIProvider: Azure OpenAI in Foundry Models through the GA v1 API
 * (`POST {endpoint}/openai/v1/chat/completions`, no api-version), with structured outputs
 * (`response_format: json_schema`, `strict: true`). Model deployments come from configuration, one
 * per task. See docs/decisions/0012-foundry-ai-provider.md.
 *
 * - Timeouts: every request is aborted after `timeoutMs`.
 * - Retries: 429 (honouring `retry-after-ms` / `retry-after`), 408, 5xx, network errors and
 *   timeouts are retried up to `maxRetries` times with exponential backoff + jitter, as long as the
 *   wait is short; longer waits surface as a retryable error so the job queue retries later.
 * - Usage: prompt / completion tokens, latency, attempts, request id and - only when pricing is
 *   configured - cost in USD.
 * - Output is parsed here and validated + grounded by withValidation (use createAIProvider).
 */

/** Minimal fetch surface (this package has no DOM / Node typings). Injected for tests. */
export interface FoundryHttpResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}
export type FoundryFetch = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: unknown }) => Promise<FoundryHttpResponse>;

export type FoundryAuth =
  /** Resource key, sent as the `api-key` header. */
  | { kind: 'api-key'; key: string }
  /** Microsoft Entra ID token (scope https://ai.azure.com/.default), sent as a bearer token. */
  | { kind: 'bearer'; getToken: () => Promise<string> };

export interface FoundryConfig {
  /** Resource endpoint, e.g. https://my-resource.openai.azure.com (with or without /openai/v1). */
  endpoint: string;
  auth: FoundryAuth;
  /** Deployment name per task (Foundry deployment names, never hard-coded). */
  deployments: Record<FoundryTask, string>;
  /** Per request (default 25 s). */
  timeoutMs?: number;
  /** Retries per task after the first attempt (default 1). */
  maxRetries?: number;
  /** Cap on generated tokens per task; also limits the rate-limit estimate (default 1500). */
  maxOutputTokens?: number;
  /** Longest in-process wait before a retry; longer waits fail as retryable instead (default 5 s). */
  maxRetryWaitMs?: number;
  /** USD per million tokens. Without it cost is reported as unknown - never guessed. */
  pricing?: { inputPer1M: number; outputPer1M: number } | null;
}

export interface FoundryOptions {
  fetch?: FoundryFetch;
  /** Waits between retries (default: setTimeout). */
  sleep?: (ms: number) => Promise<void>;
  /** Wall clock in ms (default Date.now). */
  clock?: () => number;
  /** 0..1 for jitter (default Math.random). */
  random?: () => number;
}

/** Defaults sized so one candidate analysis fits the worker's default 120 s job lease (see foundryWorstCaseMs). */
export const FOUNDRY_DEFAULTS = { timeoutMs: 25_000, maxRetries: 1, maxOutputTokens: 1_500, maxRetryWaitMs: 5_000 } as const;

/**
 * Longest one candidate analysis can take: two sequential stages (product + risk in parallel, then
 * the explanation), each up to (1 + retries) timed-out requests plus the waits between them.
 */
export function foundryWorstCaseMs(config: Pick<FoundryConfig, 'timeoutMs' | 'maxRetries' | 'maxRetryWaitMs'>): number {
  const timeout = config.timeoutMs ?? FOUNDRY_DEFAULTS.timeoutMs;
  const retries = config.maxRetries ?? FOUNDRY_DEFAULTS.maxRetries;
  const wait = config.maxRetryWaitMs ?? FOUNDRY_DEFAULTS.maxRetryWaitMs;
  return 2 * ((retries + 1) * timeout + retries * wait);
}
const BACKOFF_BASE_MS = 1_000;

/** The parts of a chat completion we read (unknown fields ignored, per Microsoft's guidance). */
const completionSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({ content: z.string().nullable().optional(), refusal: z.string().nullable().optional() }).passthrough(),
      }).passthrough(),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() }).passthrough().nullable().optional(),
}).passthrough();

const errorBodySchema = z.object({ error: z.object({ code: z.string().nullable().optional(), message: z.string().optional() }).passthrough() }).passthrough();

type Globals = {
  fetch?: FoundryFetch;
  AbortController?: new () => { signal: unknown; abort(reason?: unknown): void };
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};
const g = globalThis as unknown as Globals;

const SCHEMAS = {
  extractProduct: { name: 'product_extraction', zod: productExtractionSchema },
  assessConditionRisk: { name: 'condition_risk', zod: conditionRiskSchema },
  explainDeal: { name: 'deal_explanation', zod: dealExplanationSchema },
} as const;

/** `https://x.openai.azure.com`, `.../`, `.../openai/v1` all become the chat completions URL. */
export function chatCompletionsUrl(endpoint: string): string {
  const base = endpoint.trim().replace(/\/+$/, '').replace(/\/openai\/v1$/, '');
  return `${base}/openai/v1/chat/completions`;
}

export class FoundryAIProvider implements AIProvider {
  readonly id = 'foundry' as const;
  private readonly url: string;
  private readonly fetchImpl: FoundryFetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly clock: () => number;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxOutputTokens: number;
  private readonly maxRetryWaitMs: number;
  private readonly jsonSchemas: Record<FoundryTask, JsonSchema>;

  constructor(
    private readonly config: FoundryConfig,
    options: FoundryOptions = {},
  ) {
    const f = options.fetch ?? g.fetch?.bind(globalThis);
    if (!f) throw new AIProviderError('NOT_CONFIGURED', 'No fetch implementation available');
    for (const [task, deployment] of Object.entries(config.deployments)) {
      if (!deployment.trim()) throw new AIProviderError('NOT_CONFIGURED', `No Foundry deployment configured for ${task}`);
    }
    this.url = chatCompletionsUrl(config.endpoint);
    this.fetchImpl = f;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => g.setTimeout(resolve, ms)));
    this.clock = options.clock ?? (() => Date.now());
    this.random = options.random ?? Math.random;
    this.timeoutMs = config.timeoutMs ?? FOUNDRY_DEFAULTS.timeoutMs;
    this.maxRetries = config.maxRetries ?? FOUNDRY_DEFAULTS.maxRetries;
    this.maxOutputTokens = config.maxOutputTokens ?? FOUNDRY_DEFAULTS.maxOutputTokens;
    this.maxRetryWaitMs = config.maxRetryWaitMs ?? FOUNDRY_DEFAULTS.maxRetryWaitMs;
    this.jsonSchemas = {
      extractProduct: toStrictJsonSchema(SCHEMAS.extractProduct.zod),
      assessConditionRisk: toStrictJsonSchema(SCHEMAS.assessConditionRisk.zod),
      explainDeal: toStrictJsonSchema(SCHEMAS.explainDeal.zod),
    };
  }

  extractProduct(input: ProductExtractionInput): Promise<AIResult<ProductExtraction>> {
    return this.run('extractProduct', userPayload('extractProduct', input)) as Promise<AIResult<ProductExtraction>>;
  }

  assessConditionRisk(input: ConditionRiskInput): Promise<AIResult<ConditionRiskAssessment>> {
    return this.run('assessConditionRisk', userPayload('assessConditionRisk', input)) as Promise<AIResult<ConditionRiskAssessment>>;
  }

  explainDeal(input: DealExplanationInput): Promise<AIResult<DealExplanation>> {
    return this.run('explainDeal', userPayload('explainDeal', input)) as Promise<AIResult<DealExplanation>>;
  }

  /** The exact request body for a task (exported for tests and the live check). */
  requestBody(task: FoundryTask, user: string): Record<string, unknown> {
    return {
      model: this.config.deployments[task],
      messages: [
        { role: 'system', content: systemPrompt(task) },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: SCHEMAS[task].name, strict: true, schema: this.jsonSchemas[task] } },
      max_completion_tokens: this.maxOutputTokens,
    };
  }

  private async run(task: FoundryTask, user: string): Promise<AIResult<unknown>> {
    const body = JSON.stringify(this.requestBody(task, user));
    const started = this.clock();
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        const completion = await this.send(body);
        return this.toResult(task, completion, attempt, started);
      } catch (err) {
        const error = err instanceof AIProviderError ? err : new AIProviderError('UNAVAILABLE', `Foundry ${task} failed`, [], { cause: err });
        const wait = error.retryable ? this.retryWaitMs(error, attempt) : null;
        if (wait === null || attempt > this.maxRetries) throw error;
        await this.sleep(wait);
      }
    }
  }

  /** Backoff before the next attempt, or null when it should not be retried here. */
  private retryWaitMs(error: AIProviderError, attempt: number): number | null {
    const backoff = BACKOFF_BASE_MS * 2 ** (attempt - 1) * (1 + this.random());
    const requested = error.retryAfter ? Math.max(0, error.retryAfter.getTime() - this.clock()) : 0;
    const wait = Math.max(backoff, requested);
    return wait > this.maxRetryWaitMs ? null : Math.round(wait);
  }

  private async send(body: string): Promise<z.infer<typeof completionSchema>> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.auth.kind === 'api-key') headers['api-key'] = this.config.auth.key;
    else headers.authorization = `Bearer ${await this.config.auth.getToken()}`;

    const controller = g.AbortController ? new g.AbortController() : null;
    let timedOut = false;
    const timer = g.setTimeout(() => {
      timedOut = true;
      controller?.abort();
    }, this.timeoutMs);
    let res: FoundryHttpResponse;
    let text: string;
    try {
      res = await this.fetchImpl(this.url, { method: 'POST', headers, body, signal: controller?.signal });
      text = await res.text();
    } catch (err) {
      const reason = timedOut ? `no answer within ${Math.round(this.timeoutMs / 1000)}s (timeout)` : 'network error';
      throw new AIProviderError('UNAVAILABLE', `Foundry request failed: ${reason}`, [], { cause: err });
    } finally {
      g.clearTimeout(timer);
    }
    if (res.status < 200 || res.status >= 300) throw this.failure(res, text);
    const json = parseJson(text);
    const parsed = completionSchema.safeParse(json);
    if (!parsed.success) throw new AIProviderError('UNAVAILABLE', 'Foundry returned an unexpected response body', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    return parsed.data;
  }

  private failure(res: FoundryHttpResponse, text: string): AIProviderError {
    const body = errorBodySchema.safeParse(parseJson(text));
    const code = body.success ? (body.data.error.code ?? null) : null;
    const detail = (body.success ? body.data.error.message : null)?.slice(0, 300) ?? `HTTP ${res.status}`;
    const message = `Foundry HTTP ${res.status}${code ? ` (${code})` : ''}: ${detail}`;
    if (res.status === 401 || res.status === 403) return new AIProviderError('NOT_CONFIGURED', `${message} - check the key / role assignment`);
    if (res.status === 404) return new AIProviderError('NOT_CONFIGURED', `${message} - check the endpoint and deployment name`);
    if (res.status === 429) return new AIProviderError('RATE_LIMITED', message, [], { retryAfter: this.retryAfter(res) });
    if (res.status === 400 && code === 'content_filter') return new AIProviderError('CONTENT_FILTERED', message);
    if (res.status === 408 || res.status >= 500) return new AIProviderError('UNAVAILABLE', message, [], { retryAfter: this.retryAfter(res) });
    return new AIProviderError('REQUEST_REJECTED', message);
  }

  /** `retry-after-ms` (Azure OpenAI) or the standard `retry-after` (seconds). */
  private retryAfter(res: FoundryHttpResponse): Date | null {
    const ms = Number(res.headers.get('retry-after-ms'));
    if (Number.isFinite(ms) && ms > 0) return new Date(this.clock() + ms);
    const seconds = Number(res.headers.get('retry-after'));
    if (Number.isFinite(seconds) && seconds > 0) return new Date(this.clock() + seconds * 1000);
    return null;
  }

  private toResult(task: FoundryTask, completion: z.infer<typeof completionSchema>, attempts: number, started: number): AIResult<unknown> {
    const choice = completion.choices[0]!;
    if (choice.finish_reason === 'content_filter') throw new AIProviderError('CONTENT_FILTERED', `Foundry ${task}: the answer was blocked by the content filter`);
    if (choice.message.refusal) throw new AIProviderError('INVALID_OUTPUT', `Foundry ${task}: the model refused`, [choice.message.refusal.slice(0, 300)]);
    if (choice.finish_reason === 'length') {
      throw new AIProviderError('INVALID_OUTPUT', `Foundry ${task}: the answer was cut off at ${this.maxOutputTokens} tokens (raise FOUNDRY_MAX_OUTPUT_TOKENS)`);
    }
    const content = choice.message.content;
    if (!content) throw new AIProviderError('INVALID_OUTPUT', `Foundry ${task}: empty answer`);
    const output = parseJson(content);
    if (output === undefined) throw new AIProviderError('INVALID_OUTPUT', `Foundry ${task}: the answer is not JSON`);

    const usage = completion.usage ? { inputTokens: completion.usage.prompt_tokens, outputTokens: completion.usage.completion_tokens } : null;
    const pricing = this.config.pricing;
    const meta: AIResultMeta = {
      provider: this.id,
      model: this.config.deployments[task],
      modelVersion: completion.model || 'unknown',
      promptVersion: FOUNDRY_PROMPT_VERSIONS[task],
      schemaVersion: AI_SCHEMA_VERSION,
      latencyMs: Math.max(0, Math.round(this.clock() - started)),
      usage,
      requestId: completion.id ?? null,
      costUsd: usage && pricing ? Math.round(((usage.inputTokens * pricing.inputPer1M + usage.outputTokens * pricing.outputPer1M) / 1e6) * 1e6) / 1e6 : null,
      attempts,
    };
    return { output, meta };
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
