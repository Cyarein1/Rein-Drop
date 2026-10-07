import type { JobQueue } from './job-queue.js';

/**
 * Behaviour every JobQueue implementation must have (in-memory, Postgres, and later Azure).
 * Test-only: imported from spec files, excluded from the build.
 */
export function describeJobQueueContract(
  name: string,
  setup: () => Promise<{ queue: JobQueue; queueName: string; advance: (ms: number) => void; cleanup?: () => Promise<void> }>,
): void {
  describe(`JobQueue contract: ${name}`, () => {
    let ctx: Awaited<ReturnType<typeof setup>>;
    beforeEach(async () => {
      ctx = await setup();
    });
    afterEach(async () => {
      await ctx.cleanup?.();
    });

    const request = (over: Partial<Parameters<JobQueue['enqueue']>[0]> = {}) => ({
      queue: ctx.queueName,
      type: 'test.job',
      payload: { n: 1 },
      maxAttempts: 3,
      ...over,
    });

    it('delivers an enqueued job once, with its payload and attempt 1', async () => {
      await ctx.queue.enqueue(request({ payload: { hello: 'world' } }));
      const [job, ...rest] = await ctx.queue.receive(ctx.queueName, { maxJobs: 10, leaseMs: 60_000 });
      expect(rest).toEqual([]);
      expect(job).toMatchObject({ type: 'test.job', payload: { hello: 'world' }, attempt: 1, maxAttempts: 3 });
      expect(await ctx.queue.receive(ctx.queueName, { maxJobs: 10, leaseMs: 60_000 })).toEqual([]);
      expect(await ctx.queue.complete(job!)).toBe(true);
    });

    it('treats a repeated dedupe key as a no-op', async () => {
      const a = await ctx.queue.enqueue(request({ dedupeKey: 'same' }));
      const b = await ctx.queue.enqueue(request({ dedupeKey: 'same' }));
      expect(a.duplicate).toBe(false);
      expect(b).toEqual({ jobId: a.jobId, duplicate: true });
      expect(await ctx.queue.receive(ctx.queueName, { maxJobs: 10, leaseMs: 60_000 })).toHaveLength(1);
    });

    it('holds back jobs scheduled for later', async () => {
      await ctx.queue.enqueue(request({ notBefore: new Date(Date.now() + 10 * 60_000) }));
      expect(await ctx.queue.receive(ctx.queueName, { maxJobs: 10, leaseMs: 60_000 })).toEqual([]);
    });

    it('respects maxJobs', async () => {
      for (let i = 0; i < 3; i += 1) await ctx.queue.enqueue(request({ payload: { i } }));
      expect(await ctx.queue.receive(ctx.queueName, { maxJobs: 2, leaseMs: 60_000 })).toHaveLength(2);
    });

    it('redelivers when the lease expires, and the stale holder can no longer settle it', async () => {
      await ctx.queue.enqueue(request());
      const [first] = await ctx.queue.receive(ctx.queueName, { maxJobs: 1, leaseMs: 1_000 });
      ctx.advance(2_000);
      const [second] = await ctx.queue.receive(ctx.queueName, { maxJobs: 1, leaseMs: 60_000 });
      expect(second).toMatchObject({ id: first!.id, attempt: 2 });
      expect(await ctx.queue.complete(first!)).toBe(false);
      expect(await ctx.queue.complete(second!)).toBe(true);
    });

    it('retries at the requested time', async () => {
      await ctx.queue.enqueue(request());
      const [job] = await ctx.queue.receive(ctx.queueName, { maxJobs: 1, leaseMs: 60_000 });
      expect(await ctx.queue.retry(job!, { runAt: new Date(Date.now() + 5 * 60_000), error: 'boom' })).toBe(true);
      expect(await ctx.queue.receive(ctx.queueName, { maxJobs: 1, leaseMs: 60_000 })).toEqual([]);
      ctx.advance(6 * 60_000);
      const [again] = await ctx.queue.receive(ctx.queueName, { maxJobs: 1, leaseMs: 60_000 });
      expect(again).toMatchObject({ id: job!.id, attempt: 2 });
    });

    it('never redelivers completed or dead-lettered jobs', async () => {
      await ctx.queue.enqueue(request({ payload: { n: 1 } }));
      await ctx.queue.enqueue(request({ payload: { n: 2 } }));
      const [a, b] = await ctx.queue.receive(ctx.queueName, { maxJobs: 2, leaseMs: 1_000 });
      expect(await ctx.queue.complete(a!)).toBe(true);
      expect(await ctx.queue.deadLetter(b!, 'poison')).toBe(true);
      ctx.advance(10_000);
      expect(await ctx.queue.receive(ctx.queueName, { maxJobs: 10, leaseMs: 1_000 })).toEqual([]);
    });
  });
}
