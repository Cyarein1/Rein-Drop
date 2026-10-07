/**
 * PostgresJobQueue against a REAL PostgreSQL (local Docker by default). Run with
 * `pnpm --filter worker test:int` after `pnpm infra:up` and `pnpm db:migrate`.
 * Every test uses its own queue name and deletes its jobs afterwards.
 */
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { describeJobQueueContract } from '../src/queue/job-queue.contract.js';
import { PostgresJobQueue } from '../src/queue/postgres-job-queue.js';

const prisma = createPrismaClient(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL);
afterAll(() => prisma.$disconnect());

describeJobQueueContract('postgres', async () => {
  let offset = 0;
  const queueName = `int-test-${randomUUID()}`;
  return {
    queue: new PostgresJobQueue(prisma, () => new Date(Date.now() + offset)),
    queueName,
    advance: (ms) => (offset += ms),
    cleanup: async () => {
      await prisma.job.deleteMany({ where: { queue: queueName } });
    },
  };
});

describe('PostgresJobQueue under concurrency', () => {
  const queueName = `int-test-${randomUUID()}`;
  afterAll(() => prisma.job.deleteMany({ where: { queue: queueName } }));

  it('never leases the same job to two consumers', async () => {
    const queue = new PostgresJobQueue(prisma);
    for (let i = 0; i < 40; i += 1) await queue.enqueue({ queue: queueName, type: 't', payload: { i }, maxAttempts: 1 });
    // Separate clients = separate connections, like separate worker processes.
    const others = [1, 2, 3].map(() => createPrismaClient(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL));
    try {
      const batches = await Promise.all(
        [prisma, ...others].map((client) => new PostgresJobQueue(client).receive(queueName, { maxJobs: 15, leaseMs: 60_000 })),
      );
      const ids = batches.flat().map((j) => j.id);
      expect(ids).toHaveLength(40);
      expect(new Set(ids).size).toBe(40);
    } finally {
      await Promise.all(others.map((c) => c.$disconnect()));
    }
  });
});
