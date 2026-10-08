# 0012 - Microsoft Foundry AIProvider

Status: accepted (step 40, Build Prompt 37)

## Context

Deal analysis runs three structured tasks (product extraction, condition / risk, deal explanation)
behind the `AIProvider` boundary (`@rein-drop/ai-core`). Only the deterministic mock existed.
Microsoft Foundry is the preferred production provider; local development must keep working
offline with the mock.

## Decision

- **API**: Azure OpenAI in Foundry Models, GA **v1** API -
  `POST {endpoint}/openai/v1/chat/completions` (no `api-version`), `model` = the **deployment
  name**. Endpoints `https://<resource>.openai.azure.com` and `https://<resource>.services.ai.azure.com`
  both work (Microsoft Learn, "Azure OpenAI in Microsoft Foundry Models v1 API").
- **Plain HTTP, no SDK**: `fetch` with the documented request / response fields; no new
  dependency. Unknown response fields are ignored (Microsoft: "only parse the response objects you
  require").
- **Auth**: `api-key` header from `FOUNDRY_API_KEY`. The provider also accepts a bearer-token
  function (Microsoft Entra ID, scope `https://ai.azure.com/.default`), but nothing wires a managed
  identity yet - that needs `@azure/identity` (prompt 40/42, Azure deployment).
- **Deployments from config only**: `FOUNDRY_DEPLOYMENT` for every task, or
  `FOUNDRY_DEPLOYMENT_PRODUCT_EXTRACTION` / `_CONDITION_RISK` / `_DEAL_EXPLANATION` per task. No
  model or deployment name in source code. The deployment's model must support structured outputs.
- **Structured outputs**: `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`.
  The schema is generated from the same zod schemas the validator uses, converted to Azure's
  strict subset (`toStrictJsonSchema`: every object closed and fully required, `oneOf` -> `anyOf`,
  `const` -> `enum`, unsupported keywords such as `maxLength` / `maxItems` dropped). The response
  is then parsed and validated + grounded by `withValidation` exactly like the mock's
  (schema, verbatim quotes, canonical fact values, explanation bases) - limits dropped from the
  JSON schema are still enforced there.
- **Prompts**: one versioned system prompt per task (`foundry-*@1`, stored as
  `DealAnalysis.promptVersion`); the user message is the task input as JSON plus the canonical fact
  values evidence must match. Listing text is declared untrusted data. No temperature is sent
  (reasoning deployments reject it); `max_completion_tokens` caps output (`FOUNDRY_MAX_OUTPUT_TOKENS`,
  default 1500 - it also sizes Azure's rate-limit estimate).
- **Errors**: 401/403/404 -> `NOT_CONFIGURED`; 429 -> `RATE_LIMITED` with `retry-after-ms`
  (or `retry-after`); 408 / 5xx / network / timeout -> `UNAVAILABLE`; 400 `content_filter` or
  `finish_reason: content_filter` -> `CONTENT_FILTERED`; other 400 -> `REQUEST_REJECTED`;
  `finish_reason: length`, refusals, non-JSON -> `INVALID_OUTPUT`. Error text never contains the key.
- **Timeouts / retries**: each request aborts after `FOUNDRY_TIMEOUT_MS` (25 s). Retryable failures
  are retried `FOUNDRY_MAX_RETRIES` (1) times in-process with exponential backoff + jitter,
  honouring the service's wait, but only while the wait is short (5 s); longer waits become a
  retryable failure and the **job queue** retries at the time the service asked
  (`RetryableJobError.retryAt`). Startup refuses a configuration whose worst case
  (`foundryWorstCaseMs`) exceeds `WORKER_JOB_LEASE_MS`.
- **Usage metadata** per task: deployment, model version as reported, prompt version, latency,
  prompt / completion tokens, request id, attempts and - only when `FOUNDRY_PRICE_INPUT_PER_1M_USD`
  and `FOUNDRY_PRICE_OUTPUT_PER_1M_USD` are set from your price sheet - `costUsd`. No price is built
  in. The ingestion diagnostics sum it as AI cost.
- **Mock stays the default** (`AI_PROVIDER=mock`, offline, deterministic) and is refused in
  production. No fine-tuning, no dedicated GPU / provisioned infrastructure.

## Consequences

- Switching `AI_PROVIDER=mock|foundry` is configuration-only; domain code, storage and tests are
  unchanged. Changing provider changes the analysis input hash, so candidates are re-analysed once.
- A real model can still produce output the validator rejects (e.g. a quote that isn't verbatim);
  that analysis is stored as FAILED (`INVALID_OUTPUT` / `UNGROUNDED_OUTPUT`) and is not retried.
  Watch the failure rate with the live test / diagnostics and tune the prompts.
- Live test `foundry-ai-provider.live.spec.ts` runs only with Foundry credentials in the environment.
