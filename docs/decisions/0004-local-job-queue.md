# 0004 - Local job queue on PostgreSQL, behind a replaceable interface

_Status: accepted (2026-10-07)_

## Context

Hunt monitoring needs background jobs (scheduler -> marketplace searches). Local development must
stay near-zero-cost with no Redis or cloud services; Azure is the long-term target (Storage Queue or
Service Bus - not chosen yet).

## Decision

- The worker depends only on the `JobQueue` interface (`apps/worker/src/queue/job-queue.ts`):
  enqueue (optional dedupe key, notBefore), receive with a lease, complete, retry at a time,
  dead-letter. These map one-to-one onto Storage Queue (visibility timeout, popReceipt,
  dequeueCount) and Service Bus (peek-lock, lock token, deliveryCount, scheduled messages,
  duplicate detection, dead-letter queue).
- Locally, `PostgresJobQueue` stores jobs in the existing database (`Job` table) and leases with
  `FOR UPDATE SKIP LOCKED`, so several worker processes can run safely. No new infrastructure.
- Delivery is at-least-once. Every handler is idempotent (keyed by job id and natural unique keys),
  so replacing the queue never changes correctness.
- A shared contract test suite (`job-queue.contract.ts`) defines the behaviour; an Azure
  implementation must pass it too.

## Consequences

- Swapping to Azure = a new `JobQueue` class + changing one provider in `PipelineModule`.
- Storage Queue has no duplicate detection; the windowed dedupe key then only reduces duplicates,
  and handler idempotency carries correctness (already the case).
- TODO(worker): retention for SUCCEEDED / DEAD jobs (table grows until then); lease renewal for
  jobs that could outlive `WORKER_JOB_LEASE_MS`.
