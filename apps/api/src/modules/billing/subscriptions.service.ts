import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { SubscriptionSummary } from '@rein-drop/contracts';
import type { Prisma, PrismaClient } from '@rein-drop/db';
import { AppException } from '../../common/errors/app.exception.js';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { PRISMA } from '../../database/database.module.js';

type Db = PrismaClient | Prisma.TransactionClient;

/** Provider name for subscriptions created by the DEVELOPMENT-ONLY fake billing. */
export const DEV_FAKE_PROVIDER = 'dev-fake';

const CURRENT_WHERE = (userId: string): Prisma.SubscriptionWhereInput => ({
  userId,
  status: { in: ['ACTIVE', 'TRIALING'] },
  OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
  plan: { isActive: true },
});

/**
 * The user's current subscription. TODO(billing): the real billing provider (Stripe leading
 * candidate; app-store billing for mobile TBD) will create and update subscriptions. Until
 * then only the development fake billing writes them.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  /** Plan id of the user's current subscription, or null (= free plan). */
  async activePlanId(userId: string, db: Db = this.prisma): Promise<string | null> {
    const subscription = await db.subscription.findFirst({
      where: CURRENT_WHERE(userId),
      orderBy: { createdAt: 'desc' },
      select: { planId: true },
    });
    return subscription?.planId ?? null;
  }

  /** The user's current subscription, or null when they have not chosen a plan yet. */
  async current(userId: string, db: Db = this.prisma): Promise<SubscriptionSummary | null> {
    const subscription = await db.subscription.findFirst({
      where: CURRENT_WHERE(userId),
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { code: true } } },
    });
    if (!subscription) return null;
    return {
      planCode: subscription.plan.code,
      status: subscription.status,
      provider: subscription.provider,
      isDevelopment: subscription.provider === DEV_FAKE_PROVIDER,
    };
  }

  /**
   * DEVELOPMENT ONLY: records a plan choice as if billing had succeeded - no card, no
   * charge, no provider call. Keeps exactly one current subscription per user (others are
   * canceled). Refused in production.
   */
  async confirmDevelopmentPlan(userId: string, planCode: string): Promise<SubscriptionSummary> {
    if (this.config.nodeEnv === 'production' || process.env.NODE_ENV === 'production') {
      throw new AppException('NOT_FOUND', 'Not found', HttpStatus.NOT_FOUND);
    }
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.findFirst({
        where: { code: planCode, isActive: true, isDevelopmentOnly: false },
      });
      if (!plan) throw new AppException('NOT_FOUND', `Plan "${planCode}" is not available`, HttpStatus.NOT_FOUND);

      const now = new Date();
      await tx.subscription.updateMany({
        where: { userId, status: { in: ['ACTIVE', 'TRIALING'] }, provider: { not: DEV_FAKE_PROVIDER } },
        data: { status: 'CANCELED', canceledAt: now },
      });
      const providerSubscriptionId = `${DEV_FAKE_PROVIDER}:${userId}`;
      await tx.subscription.upsert({
        where: { providerSubscriptionId },
        create: {
          userId,
          planId: plan.id,
          status: 'ACTIVE',
          provider: DEV_FAKE_PROVIDER,
          providerSubscriptionId,
          currentPeriodStart: now,
        },
        update: { planId: plan.id, status: 'ACTIVE', canceledAt: null, currentPeriodStart: now, currentPeriodEnd: null },
      });
      const summary = await this.current(userId, tx);
      if (!summary) throw new Error('Development subscription was not created');
      return summary;
    });
  }
}
