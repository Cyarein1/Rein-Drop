import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@rein-drop/db';
import { PRISMA } from '../../database/database.module.js';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The user's current subscription. TODO(billing): the billing provider (Stripe leading
 * candidate) will create and update subscriptions; nothing writes them yet, so every user
 * is on the free plan unless a subscription row is added manually (e.g. in tests).
 */
@Injectable()
export class SubscriptionsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Plan id of the user's current subscription, or null (= free plan). */
  async activePlanId(userId: string, db: Db = this.prisma): Promise<string | null> {
    const now = new Date();
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'TRIALING'] },
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
        plan: { isActive: true },
      },
      orderBy: { createdAt: 'desc' },
      select: { planId: true },
    });
    return subscription?.planId ?? null;
  }
}
