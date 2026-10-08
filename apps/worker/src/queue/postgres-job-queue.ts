import { Prisma, type PrismaClient } from '@rein-drop/db';
import type { JsonValue } from '@rein-drop/marketplace-core';
import type { Clock, EnqueueRequest, EnqueueResult, JobQueue, LeasedJob, ReceiveOptions } from './job-queue.js';

/**
 * LOCAL queue backed by the `Job` table - no Redis, no cloud. `FOR UPDATE SKIP LOCKED` lets
 * several worker processes receive concurrently without ever leasing the same job twice.
 * Replace with an Azure Storage Queue / Service Bus implementation of JobQueue later.
 */
export class PostgresJobQueue implements JobQueue {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async enqueue<P extends JsonValue>(request: EnqueueRequest<P>): Promise<EnqueueResult> {
    try {
      const job = await this.prisma.job.create({
        data: {
          queue: request.queue,
          type: request.type,
          payload: request.payload as Prisma.InputJsonValue,
          dedupeKey: request.dedupeKey ?? null,
          maxAttempts: request.maxAttempts,
          runAt: request.notBefore ?? this.clock(),
        },
        select: { id: true },
      });
      return { jobId: job.id, duplicate: false };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') || !request.dedupeKey) throw err;
      const existing = await this.prisma.job.findUniqueOrThrow({
        where: { queue_dedupeKey: { queue: request.queue, dedupeKey: request.dedupeKey } },
        select: { id: true },
      });
      return { jobId: existing.id, duplicate: true };
    }
  }

  async receive(queue: string, options: ReceiveOptions): Promise<LeasedJob[]> {
    const now = this.clock();
    const until = new Date(now.getTime() + options.leaseMs);
    const rows = await this.prisma.$queryRaw<
      { id: string; queue: string; type: string; payload: JsonValue; attempts: number; maxAttempts: number; lockToken: string }[]
    >`
      UPDATE "Job" AS j
      SET status = 'RUNNING', attempts = j.attempts + 1, "lockToken" = gen_random_uuid(),
          "lockedUntil" = ${until}, "updatedAt" = ${now}
      FROM (
        SELECT id FROM "Job"
        WHERE queue = ${queue}
          AND ((status = 'QUEUED' AND "runAt" <= ${now}) OR (status = 'RUNNING' AND "lockedUntil" <= ${now}))
        ORDER BY "runAt", id
        LIMIT ${options.maxJobs}
        FOR UPDATE SKIP LOCKED
      ) AS picked
      WHERE j.id = picked.id
      RETURNING j.id, j.queue, j.type, j.payload, j.attempts, j."maxAttempts", j."lockToken"::text AS "lockToken"`;
    return rows.map((r) => ({
      id: r.id,
      queue: r.queue,
      type: r.type,
      payload: r.payload,
      attempt: r.attempts,
      maxAttempts: r.maxAttempts,
      leaseToken: r.lockToken,
      leasedUntil: until,
    }));
  }

  complete(job: LeasedJob): Promise<boolean> {
    return this.settle(job, { status: 'SUCCEEDED', completedAt: this.clock() });
  }

  retry(job: LeasedJob, options: { runAt: Date; error: string }): Promise<boolean> {
    return this.settle(job, { status: 'QUEUED', runAt: options.runAt, lastError: options.error.slice(0, 2000) });
  }

  defer(job: LeasedJob, options: { runAt: Date; reason: string }): Promise<boolean> {
    // receive() counted this delivery as an attempt; give it back.
    return this.settle(job, { status: 'QUEUED', runAt: options.runAt, lastError: options.reason.slice(0, 2000), attempts: { decrement: 1 } });
  }

  deadLetter(job: LeasedJob, reason: string): Promise<boolean> {
    return this.settle(job, { status: 'DEAD', lastError: reason.slice(0, 2000), completedAt: this.clock() });
  }

  /** Only the current lease holder may settle the job. */
  private async settle(job: LeasedJob, data: Prisma.JobUpdateManyMutationInput): Promise<boolean> {
    const { count } = await this.prisma.job.updateMany({
      where: { id: job.id, status: 'RUNNING', lockToken: job.leaseToken },
      data: { ...data, lockToken: null, lockedUntil: null },
    });
    return count === 1;
  }
}
