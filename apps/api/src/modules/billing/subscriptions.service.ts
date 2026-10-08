import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { SubscriptionSummary } from '@rein-drop/contracts';
import type { Prisma, PrismaClient, SubscriptionStatus } from '@rein-drop/db';
import { AppException } from '../../common/errors/app.exception.js';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { PRISMA } from '../../database/database.module.js';

type Db = PrismaClient | Prisma.TransactionClient;

/** Provider name for subscriptions created by the DEVELOPMENT-ONLY fake billing. */
export const DEV_FAKE_PROVIDER = 'dev-fake';
/** Provider name for "the user chose Free" (no payment, no provider). */
export const FREE_PROVIDER = 'free';
export const STRIPE_PROVIDER = 'stripe';

/**
 * Statuses that grant the plan's entitlements. PAST_DUE keeps access while the provider retries
 * the renewal payment (decision 0014, D36); INCOMPLETE / PAUSED / CANCELED / EXPIRED don't.
 */
export const ENTITLED_STATUSES: SubscriptionStatus[] = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

export const CURRENT_WHERE = (userId: string, now = new Date()): Prisma.SubscriptionWhereInput => ({
  userId,
  status: { in: ENTITLED_STATUSES },
  OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
  plan: { isActive: true },
});

/**
 * Which plan a user is on - server-owned: only Rein Drop writes subscriptions (verified billing
 * webhooks for paid plans, this service for Free and the development fake). No subscription = Free.
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
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  /** The user's current paid (provider-billed) subscription id, if any. */
  async currentPaid(userId: string, db: Db = this.prisma): Promise<{ id: string; providerSubscriptionId: string } | null> {
    const row = await db.subscription.findFirst({
      where: { ...CURRENT_WHERE(userId), provider: STRIPE_PROVIDER, providerSubscriptionId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, providerSubscriptionId: true },
    });
    return row ? { id: row.id, providerSubscriptionId: row.providerSubscriptionId! } : null;
  }

  /**
   * The user chooses the Free plan: no card, no charge, no provider. Refused while a paid plan is
   * current - that is ended in the billing portal, after which the user is on Free automatically.
   */
  async chooseFree(userId: string): Promise<SubscriptionSummary> {
    return this.prisma.$transaction(async (tx) => {
      if (await this.currentPaid(userId, tx)) {
        throw new AppException('CONFLICT', 'You have a paid plan. Cancel it in billing to move to Free - you keep it until the period ends.', HttpStatus.CONFLICT);
      }
      const plan = await tx.plan.findFirst({ where: { isFree: true, isActive: true } });
      if (!plan) throw new AppException('SERVICE_UNAVAILABLE', 'Plans are not configured (is the database seeded?)', HttpStatus.SERVICE_UNAVAILABLE);
      const now = new Date();
      await tx.subscription.updateMany({
        where: { userId, status: { in: ENTITLED_STATUSES }, provider: DEV_FAKE_PROVIDER },
        data: { status: 'CANCELED', canceledAt: now },
      });
      const providerSubscriptionId = `${FREE_PROVIDER}:${userId}`;
      await tx.subscription.upsert({
        where: { providerSubscriptionId },
        create: { userId, planId: plan.id, status: 'ACTIVE', provider: FREE_PROVIDER, providerSubscriptionId, currentPeriodStart: now },
        update: { planId: plan.id, status: 'ACTIVE', canceledAt: null, currentPeriodEnd: null },
      });
      return (await this.current(userId, tx))!;
    });
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
        where: { userId, status: { in: ENTITLED_STATUSES }, provider: { not: DEV_FAKE_PROVIDER } },
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
