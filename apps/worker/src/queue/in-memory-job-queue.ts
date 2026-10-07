import { randomUUID } from 'node:crypto';
import type { JsonValue } from '@rein-drop/marketplace-core';
import type { Clock, EnqueueRequest, EnqueueResult, JobQueue, LeasedJob, ReceiveOptions } from './job-queue.js';

type Status = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'DEAD';

export interface InMemoryJob {
  id: string;
  queue: string;
  type: string;
  payload: JsonValue;
  dedupeKey: string | null;
  status: Status;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  lockToken: string | null;
  lockedUntil: Date | null;
  lastError: string | null;
  createdAt: Date;
}

/** Same semantics as PostgresJobQueue, in process memory. For tests. */
export class InMemoryJobQueue implements JobQueue {
  readonly jobs: InMemoryJob[] = [];

  constructor(private readonly clock: Clock = () => new Date()) {}

  async enqueue<P extends JsonValue>(request: EnqueueRequest<P>): Promise<EnqueueResult> {
    const existing = request.dedupeKey
      ? this.jobs.find((j) => j.queue === request.queue && j.dedupeKey === request.dedupeKey)
      : undefined;
    if (existing) return { jobId: existing.id, duplicate: true };
    const now = this.clock();
    const job: InMemoryJob = {
      id: randomUUID(),
      queue: request.queue,
      type: request.type,
      payload: structuredClone(request.payload),
      dedupeKey: request.dedupeKey ?? null,
      status: 'QUEUED',
      attempts: 0,
      maxAttempts: request.maxAttempts,
      runAt: request.notBefore ?? now,
      lockToken: null,
      lockedUntil: null,
      lastError: null,
      createdAt: now,
    };
    this.jobs.push(job);
    return { jobId: job.id, duplicate: false };
  }

  async receive(queue: string, options: ReceiveOptions): Promise<LeasedJob[]> {
    const now = this.clock();
    const due = this.jobs
      .filter(
        (j) =>
          j.queue === queue &&
          ((j.status === 'QUEUED' && j.runAt <= now) || (j.status === 'RUNNING' && j.lockedUntil !== null && j.lockedUntil <= now)),
      )
      .sort((a, b) => a.runAt.getTime() - b.runAt.getTime())
      .slice(0, options.maxJobs);
    return due.map((j) => {
      j.status = 'RUNNING';
      j.attempts += 1;
      j.lockToken = randomUUID();
      j.lockedUntil = new Date(now.getTime() + options.leaseMs);
      return {
        id: j.id,
        queue: j.queue,
        type: j.type,
        payload: structuredClone(j.payload),
        attempt: j.attempts,
        maxAttempts: j.maxAttempts,
        leaseToken: j.lockToken,
        leasedUntil: j.lockedUntil,
      };
    });
  }

  async complete(job: LeasedJob): Promise<boolean> {
    return this.settle(job, (j) => {
      j.status = 'SUCCEEDED';
    });
  }

  async retry(job: LeasedJob, options: { runAt: Date; error: string }): Promise<boolean> {
    return this.settle(job, (j) => {
      j.status = 'QUEUED';
      j.runAt = options.runAt;
      j.lastError = options.error;
    });
  }

  async deadLetter(job: LeasedJob, reason: string): Promise<boolean> {
    return this.settle(job, (j) => {
      j.status = 'DEAD';
      j.lastError = reason;
    });
  }

  private settle(job: LeasedJob, apply: (j: InMemoryJob) => void): boolean {
    const stored = this.jobs.find((j) => j.id === job.id && j.status === 'RUNNING' && j.lockToken === job.leaseToken);
    if (!stored) return false;
    apply(stored);
    stored.lockToken = null;
    stored.lockedUntil = null;
    return true;
  }
}
