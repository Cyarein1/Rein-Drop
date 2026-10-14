/**
 * Account access is enforced on the server (decision 0018 phase A), against a REAL PostgreSQL:
 * the scheduler's access sweep pauses LIVE Hunts above the owner's CURRENT plan for every
 * subscription state - including ones no webhook announces (a period that simply ran out) - and
 * never deletes anything. Run with `pnpm --filter worker test:int` after migrate + seed.
 */
import { randomUUID } from 'node:crypto';
import { sweepActiveHuntLimits } from '@rein-drop/access';
import { createPrismaClient, type PrismaClient, type SubscriptionStatus } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { HuntScheduler } from '../src/pipeline/hunt-scheduler.js';
import { PostgresJobQueue } from '../src/queue/postgres-job-queue.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const TAG = `int-access-${randomUUID().slice(0, 8)}`;
const DAY = 24 * 60 * 60_000;

describe('server-side access lifecycle (integration, real database)', () => {
  let prisma: PrismaClient;
  let pro: { id: string };
  let ebay: { id: string };
  const users: string[] = [];
  const now = new Date('2036-10-14T10:00:00Z');

  /** A user with 3 LIVE Hunts (started a day apart) and, optionally, a Pro subscription. */
  async function owner(sub?: { status: SubscriptionStatus; periodEnd?: Date | null; cancelAtPeriodEnd?: boolean }) {
    const n = users.length;
    const user = await prisma.user.create({ data: { email: `${TAG}-${n}@reindrop.test`, authProvider: 'dev', authSubject: `${TAG}-${n}` } });
    users.push(user.id);
    if (sub) {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: pro.id,
          status: sub.status,
          provider: 'stripe',
          providerSubscriptionId: `sub_${TAG}_${n}`,
          currentPeriodStart: new Date(now.getTime() - 20 * DAY),
          currentPeriodEnd: sub.periodEnd === undefined ? new Date(now.getTime() + 10 * DAY) : sub.periodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
        },
      });
    }
    const hunts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const hunt = await prisma.hunt.create({
        data: { userId: user.id, name: `H${i}`, query: `item ${i}`, status: 'LIVE', activatedAt: new Date(now.getTime() - (3 - i) * DAY), marketplaces: { create: [{ marketplaceId: ebay.id }] } },
      });
      hunts.push(hunt.id);
    }
    return { userId: user.id, hunts };
  }
  const statuses = async (ids: string[]) => (await prisma.hunt.findMany({ where: { id: { in: ids } }, orderBy: { name: 'asc' } })).map((h) => h.status);

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    pro = await prisma.plan.findFirstOrThrow({ where: { code: 'pro' } });
    ebay = await prisma.marketplace.findUniqueOrThrow({ where: { key: 'ebay' } });
  });

  afterAll(async () => {
    await prisma.job.deleteMany({ where: { queue: TAG } });
    await prisma.user.deleteMany({ where: { id: { in: users } } }); // cascades hunts, events, subscriptions
    await prisma.$disconnect();
  });

  it.each([
    ['no subscription (Free: 1 live)', undefined, ['LIVE', 'PAUSED', 'PAUSED']],
    ['active Pro', { status: 'ACTIVE' as const }, ['LIVE', 'LIVE', 'LIVE']],
    ['cancelled at period end, period not over yet', { status: 'ACTIVE' as const, cancelAtPeriodEnd: true }, ['LIVE', 'LIVE', 'LIVE']],
    ['past due while Stripe retries (D36)', { status: 'PAST_DUE' as const }, ['LIVE', 'LIVE', 'LIVE']],
    ['unpaid - retries exhausted (decision 0018)', { status: 'UNPAID' as const }, ['LIVE', 'PAUSED', 'PAUSED']],
    ['period ran out without a webhook', { status: 'ACTIVE' as const, periodEnd: new Date(now.getTime() - DAY) }, ['LIVE', 'PAUSED', 'PAUSED']],
    ['cancelled', { status: 'CANCELED' as const }, ['LIVE', 'PAUSED', 'PAUSED']],
    ['expired', { status: 'EXPIRED' as const }, ['LIVE', 'PAUSED', 'PAUSED']],
    ['paused at the provider', { status: 'PAUSED' as const }, ['LIVE', 'PAUSED', 'PAUSED']],
  ])('%s', async (_name, sub, expected) => {
    const { userId, hunts } = await owner(sub);
    await sweepActiveHuntLimits(prisma, now, [userId]);
    // The longest-running Hunt stays live; the most recently started pause first.
    expect(await statuses(hunts)).toEqual(expected);
    const paused = expected.filter((s) => s === 'PAUSED').length;
    const events = await prisma.huntEvent.findMany({ where: { huntId: { in: hunts }, type: 'PAUSED' } });
    expect(events).toHaveLength(paused);
    expect(events.every((e) => e.actorUserId === null && (e.changes as { reason?: string }).reason === 'plan_limit')).toBe(true);
    // Idempotent; nothing deleted.
    await sweepActiveHuntLimits(prisma, now, [userId]);
    expect(await prisma.huntEvent.count({ where: { huntId: { in: hunts }, type: 'PAUSED' } })).toBe(paused);
    expect(await prisma.hunt.count({ where: { userId } })).toBe(3);
  });

  it('a period that runs out later pauses the extra Hunts on the next sweep (cancel at period end)', async () => {
    const { userId, hunts } = await owner({ status: 'ACTIVE', cancelAtPeriodEnd: true, periodEnd: new Date(now.getTime() + DAY) });
    await sweepActiveHuntLimits(prisma, now, [userId]);
    expect(await statuses(hunts)).toEqual(['LIVE', 'LIVE', 'LIVE']);
    await sweepActiveHuntLimits(prisma, new Date(now.getTime() + 2 * DAY), [userId]);
    expect(await statuses(hunts)).toEqual(['LIVE', 'PAUSED', 'PAUSED']);
  });

  it('the scheduler sweeps before planning: Hunts without access are never monitored', async () => {
    const { userId, hunts } = await owner({ status: 'UNPAID' });
    const scheduler = new HuntScheduler(prisma, new PostgresJobQueue(prisma, () => now), { pollIntervalMs: 15 * 60_000, maxAttempts: 3, batchSize: 50, queue: TAG, onlyUserIds: [userId] }, () => now);
    const summary = await scheduler.scheduleDue();
    expect(summary.pausedForAccess).toBe(2);
    expect(summary.claimed).toBe(1); // only the one Hunt Free covers
    const jobs = await prisma.job.findMany({ where: { queue: TAG } });
    expect(jobs.flatMap((j) => (j.payload as { huntIds: string[] }).huntIds)).toEqual([hunts[0]]);
  });
});
