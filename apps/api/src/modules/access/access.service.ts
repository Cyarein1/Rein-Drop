import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { isSuspended, resolveProductAccess, savedHuntLimit, type ResolvedProductAccess } from '@rein-drop/access';
import { ENTITLEMENT_KEYS, type AccessResponse, type Product } from '@rein-drop/contracts';
import type { Prisma, PrismaClient } from '@rein-drop/db';
import { AppException } from '../../common/errors/app.exception.js';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { PRISMA } from '../../database/database.module.js';
import { PLAN_INCLUDE, toEntitlements } from '../plans/plans.mapper.js';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The account's effective access (decision 0018) - the read model behind GET /me/access and the
 * checks protected operations call. Built on the shared resolver (@rein-drop/access) the worker
 * uses too. Never returns provider ids, customer ids, prices or other billing details.
 */
@Injectable()
export class AccessService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private options() {
    return { now: new Date(), policy: this.config.accessPolicy };
  }

  async access(userId: string): Promise<AccessResponse> {
    const opts = this.options();
    const [source, sell] = await Promise.all([
      resolveProductAccess(this.prisma, userId, 'source', opts),
      resolveProductAccess(this.prisma, userId, 'sell', opts),
    ]);
    const [sourcePlan, sellPlan, live, saved] = await Promise.all([
      source.planId ? this.prisma.plan.findUnique({ where: { id: source.planId }, include: PLAN_INCLUDE }) : null,
      sell.planId ? this.prisma.plan.findUnique({ where: { id: sell.planId }, include: PLAN_INCLUDE }) : null,
      this.prisma.hunt.count({ where: { userId, status: 'LIVE' } }),
      this.prisma.hunt.count({ where: { userId, status: { not: 'ARCHIVED' } } }),
    ]);
    // Suspended: nothing is allowed (limits 0); the data stays.
    const e = toEntitlements(sourcePlan?.entitlements ?? []);
    const usage = (limit: number | null, used: number) => ({ limit, used, remaining: limit === null ? null : Math.max(0, limit - used) });
    const listings = sellPlan?.entitlements.find((r) => r.key === ENTITLEMENT_KEYS.sellListingsMax);
    return {
      suspended: source.state === 'suspended',
      products: {
        source: {
          ...this.base(source, sourcePlan),
          limits: {
            activeHunts: usage(source.hasAccess ? e.activeHunts.limit : 0, live),
            savedHunts: usage(source.hasAccess ? e.savedHunts.limit : 0, saved),
            marketplaces: source.hasAccess ? e.marketplaces : [],
            monitoringPriority: e.monitoringPriority,
            hotHunts: source.hasAccess ? e.hotHunts : { available: false, limit: 0 },
            analyticsHistoryDays: e.analyticsHistoryDays,
            seats: e.seats,
          },
        },
        sell: {
          ...this.base(sell, sellPlan),
          limits: sell.hasAccess ? { listings: { limit: listings ? listings.limit : 0 } } : null,
        },
      },
    };
  }

  private base(access: ResolvedProductAccess, plan: { code: string; name: string; family: 'SOURCE' | 'SELL' | 'COMPLETE' } | null) {
    return {
      state: access.state,
      hasAccess: access.hasAccess,
      paid: access.paid,
      plan: plan ? { code: plan.code, name: plan.name, family: plan.family } : null,
      periodEndsAt: access.subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelsAtPeriodEnd: access.subscription?.cancelAtPeriodEnd ?? false,
      graceEndsAt: access.subscription?.graceEndsAt?.toISOString() ?? null,
    };
  }

  /** Protected operations: refused while Rein Drop has suspended the account (403). */
  async assertNotSuspended(userId: string, db: Db = this.prisma): Promise<void> {
    if (await isSuspended(db, userId)) {
      throw new AppException('ACCOUNT_SUSPENDED', 'Access to this account is suspended. Your data is kept - contact support.', HttpStatus.FORBIDDEN);
    }
  }

  /** Operations of a product (e.g. Sell) need that product right now (403 otherwise). */
  async assertProduct(userId: string, product: Product, db: Db = this.prisma): Promise<void> {
    await this.assertNotSuspended(userId, db);
    const access = await resolveProductAccess(db, userId, product, this.options());
    if (!access.hasAccess) {
      throw new AppException('PRODUCT_NOT_INCLUDED', `Your current access doesn't include Rein Drop ${product === 'sell' ? 'Sell' : 'Source'}.`, HttpStatus.FORBIDDEN);
    }
  }

  /** Saving one more Hunt (create / restore) must stay within the saved-Hunt limit (409). */
  async assertCanSaveHunt(userId: string, db: Db = this.prisma): Promise<void> {
    await this.assertNotSuspended(userId, db);
    const limit = await savedHuntLimit(db, userId, new Date(), this.config.accessPolicy);
    if (limit === null) return;
    const saved = await db.hunt.count({ where: { userId, status: { not: 'ARCHIVED' } } });
    if (saved >= limit) {
      throw new AppException('LIMIT_REACHED', `Your current access includes ${limit} saved ${limit === 1 ? 'Hunt' : 'Hunts'}. Archive one to save another - archived Hunts are kept.`, HttpStatus.CONFLICT);
    }
  }
}
