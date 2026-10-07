import { InMemoryJobQueue } from './in-memory-job-queue.js';
import type { LeasedJob } from './job-queue.js';
import { JobRunner, PermanentJobError, RetryableJobError, exponentialBackoffMs, type JobHandler } from './job-runner.js';

function setup(handle: (job: LeasedJob) => Promise<void>, maxAttempts = 3) {
  let t = Date.parse('2026-10-07T10:00:00Z');
  const clock = () => new Date(t);
  const queue = new InMemoryJobQueue(clock);
  const handler: JobHandler = { type: 'work', handle };
  const runner = new JobRunner(queue, [handler], { queue: 'q', maxJobs: 10, leaseMs: 60_000 }, clock);
  const enqueue = (type = 'work') => queue.enqueue({ queue: 'q', type, payload: {}, maxAttempts });
  return { queue, runner, enqueue, advance: (ms: number) => (t += ms), clock };
}

describe('JobRunner', () => {
  it('completes jobs whose handler succeeds', async () => {
    const { runner, enqueue, queue } = setup(async () => {});
    await enqueue();
    expect(await runner.runOnce()).toEqual({ received: 1, outcomes: { completed: 1, retried: 0, dead: 0, lease_lost: 0 } });
    expect(queue.jobs[0]!.status).toBe('SUCCEEDED');
  });

  it('retries transient failures with exponential backoff', async () => {
    const { runner, enqueue, queue, clock } = setup(async () => {
      throw new Error('db hiccup');
    });
    await enqueue();
    await runner.runOnce();
    expect(queue.jobs[0]).toMatchObject({ status: 'QUEUED', lastError: 'Error: db hiccup' });
    expect(queue.jobs[0]!.runAt.getTime()).toBe(clock().getTime() + 30_000);
    expect((await runner.runOnce()).received).toBe(0); // not due yet
  });

  it("honours a source's retryAfter when it is later than the backoff", async () => {
    const { runner, enqueue, queue, clock } = setup(async () => {
      throw new RetryableJobError('rate limited', new Date(clock().getTime() + 10 * 60_000));
    });
    await enqueue();
    await runner.runOnce();
    expect(queue.jobs[0]!.runAt.getTime()).toBe(clock().getTime() + 10 * 60_000);
  });

  it('dead-letters permanent failures immediately', async () => {
    const { runner, enqueue, queue } = setup(async () => {
      throw new PermanentJobError('bad payload');
    });
    await enqueue();
    expect((await runner.runOnce()).outcomes.dead).toBe(1);
    expect(queue.jobs[0]).toMatchObject({ status: 'DEAD', attempts: 1 });
  });

  it('dead-letters after maxAttempts deliveries', async () => {
    let calls = 0;
    const { runner, enqueue, queue, advance } = setup(async () => {
      calls += 1;
      throw new Error('still broken');
    }, 3);
    await enqueue();
    for (let i = 0; i < 5; i += 1) {
      await runner.runOnce();
      advance(60 * 60_000);
    }
    expect(calls).toBe(3);
    expect(queue.jobs[0]).toMatchObject({ status: 'DEAD', attempts: 3 });
  });

  it('dead-letters a redelivered job that already used up its attempts (crash loop)', async () => {
    const { runner, enqueue, queue, advance } = setup(async () => {}, 1);
    await enqueue();
    await queue.receive('q', { maxJobs: 1, leaseMs: 1_000 }); // a consumer that crashed
    advance(2_000);
    expect((await runner.runOnce()).outcomes.dead).toBe(1);
    expect(queue.jobs[0]!.lastError).toBe('Gave up after 1 attempts');
  });

  it('dead-letters unknown job types', async () => {
    const { runner, enqueue, queue } = setup(async () => {});
    await enqueue('mystery');
    await runner.runOnce();
    expect(queue.jobs[0]).toMatchObject({ status: 'DEAD', lastError: 'No handler for job type "mystery"' });
  });

  it('reports a lost lease instead of overwriting the new holder', async () => {
    let queueRef!: InMemoryJobQueue;
    let advanceRef!: (ms: number) => void;
    const ctx = setup(async () => {
      advanceRef(120_000); // the handler outlives its lease ...
      await queueRef.receive('q', { maxJobs: 1, leaseMs: 60_000 }); // ... and another consumer takes the job
    });
    queueRef = ctx.queue;
    advanceRef = ctx.advance;
    await ctx.enqueue();
    expect((await ctx.runner.runOnce()).outcomes.lease_lost).toBe(1);
    expect(ctx.queue.jobs[0]).toMatchObject({ status: 'RUNNING', attempts: 2 });
  });
});

describe('exponentialBackoffMs', () => {
  it('doubles from 30s and caps at 15 minutes', () => {
    expect([1, 2, 3, 4, 10].map(exponentialBackoffMs)).toEqual([30_000, 60_000, 120_000, 240_000, 900_000]);
  });
});
