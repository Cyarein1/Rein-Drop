import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Plan } from '@rein-drop/contracts';
import type { Prisma, PrismaClient } from '@rein-drop/db';
import { AppException } from '../../common/errors/app.exception.js';
import { PRISMA } from '../../database/database.module.js';
import { SubscriptionsService } from '../billing/subscriptions.service.js';
import { PLAN_INCLUDE, toPlan } from './plans.mapper.js';

type Db = PrismaClient | Prisma.TransactionClient;

/** Plans and what they entitle. Prices are not modelled (TBD). */
@Injectable()
export class PlansService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** Plans offered on the plan gate: active, not development-only, in display order. */
  async list(): Promise<Plan[]> {
    const rows = await this.prisma.plan.findMany({
      where: { isActive: true, isDevelopmentOnly: false },
      include: PLAN_INCLUDE,
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map(toPlan);
  }

  /** The user's current plan: their active subscription's plan, otherwise the free plan. */
  async planForUser(userId: string, db: Db = this.prisma): Promise<Plan> {
    const planId = await this.subscriptions.activePlanId(userId, db);
    const row = planId
      ? await db.plan.findUnique({ where: { id: planId }, include: PLAN_INCLUDE })
      : await db.plan.findFirst({ where: { isFree: true, isActive: true }, include: PLAN_INCLUDE });
    if (!row) {
      throw new AppException(
        'SERVICE_UNAVAILABLE',
        'Plans are not configured (is the database seeded?)',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return toPlan(row);
  }
}
