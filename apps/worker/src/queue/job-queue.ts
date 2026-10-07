import type { JsonValue } from '@rein-drop/marketplace-core';

/**
 * Queue abstraction for background jobs. The worker only talks to this interface, so the local
 * PostgresJobQueue can later be replaced by Azure Storage Queue or Service Bus:
 *
 * | here                | Storage Queue                    | Service Bus                         |
 * |---------------------|----------------------------------|-------------------------------------|
 * | enqueue + notBefore | sendMessage(visibilityTimeout)   | scheduleMessages / scheduledEnqueue |
 * | dedupeKey           | (none - handlers are idempotent) | messageId + duplicate detection     |
 * | receive + lease     | receiveMessages(visibility)      | peek-lock receive                   |
 * | leaseToken          | popReceipt                       | lock token                          |
 * | attempt             | dequeueCount                     | deliveryCount                       |
 * | complete            | deleteMessage                    | completeMessage                     |
 * | retry(runAt)        | updateMessage(visibility)        | abandon / reschedule                |
 * | deadLetter          | move to a poison queue           | deadLetterMessage                   |
 *
 * Delivery is at-least-once everywhere, so every handler must be idempotent.
 */

export interface EnqueueRequest<P extends JsonValue = JsonValue> {
  queue: string;
  /** Selects the handler. */
  type: string;
  payload: P;
  /** Producers that may run twice pass the same key; a second enqueue is a no-op. */
  dedupeKey?: string;
  /** Not delivered before this time. */
  notBefore?: Date;
  /** Deliveries allowed before the job is dead-lettered. */
  maxAttempts: number;
}

export interface EnqueueResult {
  jobId: string;
  /** True when a job with the same dedupe key already existed (nothing was added). */
  duplicate: boolean;
}

export interface LeasedJob<P extends JsonValue = JsonValue> {
  id: string;
  queue: string;
  type: string;
  payload: P;
  /** 1 on first delivery. */
  attempt: number;
  maxAttempts: number;
  /** Proves this delivery still owns the job; a stale holder can't complete it. */
  leaseToken: string;
  leasedUntil: Date;
}

export interface ReceiveOptions {
  maxJobs: number;
  /** How long the job is hidden from other consumers while this one works on it. */
  leaseMs: number;
}

export interface JobQueue {
  enqueue<P extends JsonValue>(request: EnqueueRequest<P>): Promise<EnqueueResult>;
  /** Due jobs, plus jobs whose lease expired (their consumer died). */
  receive(queue: string, options: ReceiveOptions): Promise<LeasedJob[]>;
  /** Returns false when the lease was lost (the job was delivered to someone else). */
  complete(job: LeasedJob): Promise<boolean>;
  retry(job: LeasedJob, options: { runAt: Date; error: string }): Promise<boolean>;
  deadLetter(job: LeasedJob, reason: string): Promise<boolean>;
}

export const JOB_QUEUE = Symbol('JOB_QUEUE');

/** Injectable clock, so scheduling and retries are testable. */
export type Clock = () => Date;
export const CLOCK = Symbol('CLOCK');
