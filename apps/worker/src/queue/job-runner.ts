import { Logger } from '@nestjs/common';
import type { JsonValue } from '@rein-drop/marketplace-core';
import type { Clock, JobQueue, LeasedJob } from './job-queue.js';

/** A handler for one job type. Must be idempotent: any job can be delivered more than once. */
export interface JobHandler<P extends JsonValue = JsonValue> {
  readonly type: string;
  handle(job: LeasedJob<P>): Promise<void>;
}

/** Throw to ask for a retry, optionally not before a given time (e.g. a source's retryAfter). */
export class RetryableJobError extends Error {
  constructor(
    message: string,
    readonly retryAt: Date | null = null,
  ) {
    super(message);
    this.name = 'RetryableJobError';
  }
}

/**
 * Throw when the job can't run yet for a reason outside it (its marketplace is cooling down):
 * it goes back to the queue for `runAt` without using up an attempt.
 */
export class DeferJobError extends Error {
  constructor(
    message: string,
    readonly runAt: Date,
  ) {
    super(message);
    this.name = 'DeferJobError';
  }
}

/** Throw when retrying can't help (bad payload, not configured): the job is dead-lettered. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

export interface JobRunnerOptions {
  queue: string;
  maxJobs: number;
  leaseMs: number;
  /** Delay before retry number `attempt` (1-based). */
  backoffMs?: (attempt: number) => number;
}

/** 30s, 1m, 2m, 4m ... capped at 15 minutes. */
export function exponentialBackoffMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 15 * 60_000);
}

export type JobOutcome = 'completed' | 'retried' | 'deferred' | 'dead' | 'lease_lost';

export interface RunSummary {
  received: number;
  outcomes: Record<JobOutcome, number>;
}

/**
 * Receives due jobs and runs their handlers. Unknown errors are treated as transient and retried
 * with backoff; after `maxAttempts` deliveries (or a PermanentJobError) the job is dead-lettered.
 */
export class JobRunner {
  private readonly logger = new Logger(JobRunner.name);
  private readonly handlers = new Map<string, JobHandler>();

  constructor(
    private readonly queue: JobQueue,
    handlers: readonly JobHandler<never>[],
    private readonly options: JobRunnerOptions,
    private readonly clock: Clock = () => new Date(),
  ) {
    for (const h of handlers) this.handlers.set(h.type, h as unknown as JobHandler);
  }

  async runOnce(): Promise<RunSummary> {
    const jobs = await this.queue.receive(this.options.queue, { maxJobs: this.options.maxJobs, leaseMs: this.options.leaseMs });
    const outcomes: Record<JobOutcome, number> = { completed: 0, retried: 0, deferred: 0, dead: 0, lease_lost: 0 };
    // Sequential: keeps one worker's load on a marketplace predictable. Scale out with more workers.
    for (const job of jobs) outcomes[await this.process(job)] += 1;
    return { received: jobs.length, outcomes };
  }

  private async process(job: LeasedJob): Promise<JobOutcome> {
    const settled = (ok: boolean, outcome: JobOutcome): JobOutcome => (ok ? outcome : 'lease_lost');

    if (job.attempt > job.maxAttempts) {
      return settled(await this.queue.deadLetter(job, `Gave up after ${job.maxAttempts} attempts`), 'dead');
    }
    const handler = this.handlers.get(job.type);
    if (!handler) return settled(await this.queue.deadLetter(job, `No handler for job type "${job.type}"`), 'dead');

    try {
      await handler.handle(job);
      return settled(await this.queue.complete(job), 'completed');
    } catch (err) {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      if (err instanceof DeferJobError) {
        return settled(await this.queue.defer(job, { runAt: err.runAt, reason: message }), 'deferred');
      }
      if (err instanceof PermanentJobError || job.attempt >= job.maxAttempts) {
        this.logger.warn(`Job ${job.type} ${job.id} dead-lettered (attempt ${job.attempt}): ${message}`);
        return settled(await this.queue.deadLetter(job, message), 'dead');
      }
      const backoff = (this.options.backoffMs ?? exponentialBackoffMs)(job.attempt);
      const earliest = this.clock().getTime() + backoff;
      const requested = err instanceof RetryableJobError && err.retryAt ? err.retryAt.getTime() : 0;
      const runAt = new Date(Math.max(earliest, requested));
      this.logger.log(`Job ${job.type} ${job.id} retry at ${runAt.toISOString()} (attempt ${job.attempt}): ${message}`);
      return settled(await this.queue.retry(job, { runAt, error: message }), 'retried');
    }
  }
}
