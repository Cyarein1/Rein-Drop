import { Logger } from '@nestjs/common';
import type { NotificationCategory } from '@rein-drop/contracts';
import { Prisma, type PrismaClient } from '@rein-drop/db';
import type { Clock } from '../queue/job-queue.js';
import { exponentialBackoffMs } from '../queue/job-runner.js';
import type { NotificationSenders } from './senders.js';

export interface DispatcherOptions {
  batchSize: number;
  /** How long a claimed delivery is hidden from other workers while it's being sent. */
  leaseMs: number;
  /** Attempts before a delivery is marked FAILED. */
  maxAttempts: number;
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  simulated: number;
  skipped: number;
  failed: number;
  retrying: number;
}

/**
 * Outbox sender: PENDING NotificationDelivery rows are the queue. Each tick claims due rows with
 * `FOR UPDATE SKIP LOCKED` (several workers can run), sends them through the channel's sender and
 * records the outcome. Nothing is lost if the process dies between writing an alert and sending
 * it - the row simply stays PENDING until a worker claims it again.
 *
 * Status changes are conditional on PENDING, so a delivery is finalised at most once.
 * Azure later: the same table, or a queue fed from it (see decision 0006).
 */
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly senders: NotificationSenders,
    private readonly options: DispatcherOptions,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async dispatchPending(): Promise<DispatchSummary> {
    const now = this.clock();
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE "NotificationDelivery" d
      SET "attempts" = d."attempts" + 1, "lockedUntil" = ${new Date(now.getTime() + this.options.leaseMs)}
      WHERE d."id" IN (
        SELECT "id" FROM "NotificationDelivery"
        WHERE "status" = 'PENDING' AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${now})
        ORDER BY "createdAt"
        LIMIT ${this.options.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING d."id"::text AS "id"`);

    const summary: DispatchSummary = { claimed: claimed.length, sent: 0, simulated: 0, skipped: 0, failed: 0, retrying: 0 };
    for (const { id } of claimed) summary[await this.deliver(id, now)] += 1;
    return summary;
  }

  private async deliver(id: string, now: Date): Promise<'sent' | 'simulated' | 'skipped' | 'failed' | 'retrying'> {
    const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({
      where: { id },
      include: { alert: { include: { user: { select: { id: true, email: true } } } } },
    });
    const finish = (data: Prisma.NotificationDeliveryUpdateManyMutationInput) =>
      this.prisma.notificationDelivery.updateMany({ where: { id, status: 'PENDING' }, data: { lockedUntil: null, ...data } });

    const channel = delivery.channel;
    const sender = channel === 'PUSH' || channel === 'EMAIL' ? this.senders[channel] : undefined;
    if (!sender) {
      await finish({ status: 'SKIPPED', reason: 'not_configured' });
      return 'skipped';
    }
    try {
      await sender.send({
        deliveryId: id,
        alertId: delivery.alertId,
        channel: channel as 'PUSH' | 'EMAIL',
        category: delivery.alert.category as NotificationCategory,
        title: delivery.alert.title,
        body: delivery.alert.body,
        recipient: { userId: delivery.alert.user.id, email: delivery.alert.user.email },
      });
      await finish({ status: sender.simulated ? 'SIMULATED' : 'SENT', provider: sender.id, sentAt: now, reason: null });
      return sender.simulated ? 'simulated' : 'sent';
    } catch (err) {
      const reason = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      if (delivery.attempts >= this.options.maxAttempts) {
        this.logger.warn(`Delivery ${id} (${channel}) failed after ${delivery.attempts} attempts: ${reason}`);
        await finish({ status: 'FAILED', provider: sender.id, reason });
        return 'failed';
      }
      // Stay PENDING; not claimable again until the backoff has passed.
      await this.prisma.notificationDelivery.updateMany({
        where: { id, status: 'PENDING' },
        data: { reason, lockedUntil: new Date(now.getTime() + exponentialBackoffMs(delivery.attempts)) },
      });
      return 'retrying';
    }
  }
}
