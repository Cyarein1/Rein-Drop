import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { enforceActiveHuntLimit } from '@rein-drop/access';
import {
  createHuntRequestSchema,
  evaluateActivation,
  HUNT_TRANSITIONS,
  restoredStatus,
  type ActivationCheck,
  type CreateHuntRequest,
  type Hunt,
  type HuntActivity,
  type HuntAction,
  type HuntEvent,
  type HuntEventType,
  type ListHuntsQuery,
  type MarketplaceKey,
  type Page,
  type UpdateHuntRequest,
} from '@rein-drop/contracts';
import type { Prisma, PrismaClient } from '@rein-drop/db';
import type { ProductEvents } from '@rein-drop/telemetry';
import {
  ActivationBlockedException,
  AppException,
  ValidationFailedException,
} from '../../common/errors/app.exception.js';
import { PRISMA } from '../../database/database.module.js';
import { GeoService } from '../geo/geo.service.js';
import { PlansService } from '../plans/plans.service.js';
import { PRODUCT_EVENTS } from '../telemetry/telemetry.tokens.js';
import { loadHuntActivity } from './hunt-activity.js';
import {
  criteriaOf,
  defaultHuntName,
  diffCriteria,
  HUNT_INCLUDE,
  toHunt,
  toHuntColumns,
  toHuntEvent,
  type HuntCriteria,
  type HuntRow,
} from './hunts.mapper.js';

type Tx = Prisma.TransactionClient;

const ACTION_EVENT: Record<HuntAction, HuntEventType> = {
  activate: 'ACTIVATED',
  pause: 'PAUSED',
  resume: 'RESUMED',
  archive: 'ARCHIVED',
  restore: 'RESTORED',
};

/**
 * Hunt CRUD + lifecycle for one user. Every change runs in a transaction together
 * with its HuntEvent, so history is never out of step with the hunt. Hunts are
 * never deleted.
 */

/** Most hunt-history events returned (a hunt edited daily for years stays a bounded response). */
const HUNT_EVENTS_MAX = 500;
@Injectable()
export class HuntsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly plans: PlansService,
    @Inject(PRODUCT_EVENTS) private readonly productEvents: ProductEvents,
    private readonly geo: GeoService,
  ) {}

  /** Newest first. Without a status filter, archived hunts are left out. */
  async list(userId: string, query: ListHuntsQuery): Promise<Page<Hunt>> {
    const rows = await this.prisma.hunt.findMany({
      where: {
        userId,
        status: query.status ?? { not: 'ARCHIVED' },
        // ids are UUIDv7 (time-ordered), so the cursor is simply the last id seen.
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      include: HUNT_INCLUDE,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(toHunt),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(userId: string, huntId: string): Promise<Hunt> {
    return toHunt(await this.findOwned(this.prisma, userId, huntId));
  }

  /** Creates a DRAFT. Activation is a separate step (plan gate goes there later). */
  async create(userId: string, request: CreateHuntRequest): Promise<Hunt> {
    // Coordinates for the distance check: the picked / pinned point, else the text placed now.
    const location = await this.geo.withPoint(request.location, userId);
    const criteria: HuntCriteria = { ...request, location, name: request.name ?? defaultHuntName(request.query) };
    const hunt = await this.prisma.$transaction(async (tx) => {
      const marketplaceIds = await this.resolveMarketplaces(tx, criteria.marketplaces);
      const row = await tx.hunt.create({
        data: {
          userId,
          ...toHuntColumns(criteria),
          marketplaces: { create: [...marketplaceIds.values()].map((marketplaceId) => ({ marketplaceId })) },
          events: { create: { type: 'CREATED', toStatus: 'DRAFT', actorUserId: userId } },
        },
        include: HUNT_INCLUDE,
      });
      return toHunt(row);
    });
    this.productEvents.track('hunt_created', userId, {
      huntId: hunt.id,
      marketplaces: [...criteria.marketplaces],
      hasMaxPrice: criteria.maxPrice !== null,
      hasTarget: criteria.target !== null,
    });
    return hunt;
  }

  /**
   * Edits criteria in place (same id). The merged result is re-validated as a whole;
   * a LIVE hunt must stay live-ready. Records an EDITED event with the changes.
   */
  async update(userId: string, huntId: string, request: UpdateHuntRequest): Promise<Hunt> {
    // Placed before the transaction (a network call must not hold a database transaction open).
    if (request.location !== undefined) request = { ...request, location: await this.geo.withPoint(request.location, userId) };
    return this.prisma.$transaction(async (tx) => {
      const row = await this.findOwned(tx, userId, huntId);
      if (row.status === 'ARCHIVED') {
        throw new AppException('CONFLICT', 'Archived hunts cannot be edited', HttpStatus.CONFLICT);
      }

      const current = toHunt(row);
      const before = criteriaOf(current);
      const merged = this.validateMerged({ ...before, ...stripUndefined(request) });
      const changes = diffCriteria(before, merged);
      if (Object.keys(changes).length === 0) return current;

      if (row.status === 'LIVE') {
        // A live hunt must stay runnable under the plan (the active-hunt count is unchanged by an edit).
        const plan = await this.plans.planForUser(userId, tx);
        const reasons = evaluateActivation(plan.entitlements, 0, merged);
        if (reasons.length > 0) {
          throw new ActivationBlockedException(
            { planCode: plan.code, reasons },
            'This change would stop the hunt from running',
          );
        }
      }

      if (changes.marketplaces) await this.syncMarketplaces(tx, row, merged.marketplaces);
      const updated = await tx.hunt.update({
        where: { id: row.id },
        data: {
          ...toHuntColumns(merged),
          lastEditedAt: new Date(),
          events: {
            create: {
              type: 'EDITED',
              fromStatus: row.status,
              toStatus: row.status,
              changes: changes as Prisma.InputJsonValue,
              actorUserId: userId,
            },
          },
        },
        include: HUNT_INCLUDE,
      });
      return toHunt(updated);
    });
  }

  /**
   * Lifecycle move (activate / pause / resume / archive / restore). Invalid moves -> 409.
   * Restore returns an archived hunt to DRAFT (never activated) or PAUSED - never straight
   * to LIVE, so going live again passes the go-live checks via `resume`.
   */
  async transition(userId: string, huntId: string, action: HuntAction): Promise<Hunt> {
    const { from } = HUNT_TRANSITIONS[action];
    let activatedOnPlan: string | null = null;
    const hunt = await this.prisma.$transaction(async (tx) => {
      const row = await this.findOwned(tx, userId, huntId);
      if (!from.includes(row.status)) {
        throw new AppException(
          'CONFLICT',
          `Cannot ${action} a hunt that is ${row.status.toLowerCase()}`,
          HttpStatus.CONFLICT,
        );
      }
      const to = action === 'restore' ? await this.statusBeforeArchive(tx, row.id) : HUNT_TRANSITIONS[action].to;
      if (to === 'LIVE') {
        // Serialize go-live per user so two concurrent activations cannot both pass the limit.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
        const check = await this.evaluate(tx, userId, row);
        if (check.reasons.length > 0) {
          // The hunt is left untouched: a draft stays a draft (Blueprint section 14).
          throw new ActivationBlockedException({ planCode: check.planCode, reasons: check.reasons });
        }
        if (action === 'activate') activatedOnPlan = check.planCode;
        // TODO(plan-gate): the plan-selection / payment step (Blueprint section 6) comes before
        // activation in the product flow; limits are placeholders until the cost model is done.
      }

      const now = new Date();
      // Guarded on the current status so two concurrent moves cannot both win.
      const { count } = await tx.hunt.updateMany({
        where: { id: row.id, status: row.status },
        data: {
          status: to,
          ...(action === 'activate' && !row.activatedAt ? { activatedAt: now } : {}),
          ...(action === 'pause' ? { pausedAt: now } : {}),
          ...(action === 'archive' ? { archivedAt: now } : {}),
          // When it was archived stays in the event history.
          ...(action === 'restore' ? { archivedAt: null } : {}),
        },
      });
      if (count === 0) {
        throw new AppException('CONFLICT', 'The hunt changed at the same time - please retry', HttpStatus.CONFLICT);
      }
      await tx.huntEvent.create({
        data: { huntId: row.id, type: ACTION_EVENT[action], fromStatus: row.status, toStatus: to, actorUserId: userId },
      });
      return toHunt(await tx.hunt.findUniqueOrThrow({ where: { id: row.id }, include: HUNT_INCLUDE }));
    });
    // Activation is DRAFT -> LIVE only, so this is each hunt's first go-live (resume is not counted).
    if (activatedOnPlan) this.productEvents.track('hunt_activated', userId, { huntId: hunt.id, planCode: activatedOnPlan });
    return hunt;
  }

  /**
   * After the user's plan changed (e.g. a paid subscription ended): LIVE hunts beyond the new
   * plan's active-hunt limit are paused - the most recently started first, the longest-running
   * stay live. A system action (no actor), recorded in each hunt's history. Idempotent.
   * Returns the ids of the hunts it paused.
   */
  async enforcePlanLimit(userId: string): Promise<string[]> {
    // Shared with the worker's scheduled access sweep (@rein-drop/access, decision 0018).
    return enforceActiveHuntLimit(this.prisma, userId);
  }

  /** Preview: could this hunt go live now, and if not, why (same rules as activation). */
  async activationCheck(userId: string, huntId: string): Promise<ActivationCheck> {
    const row = await this.findOwned(this.prisma, userId, huntId);
    if (row.status === 'LIVE') {
      return { huntId, canActivate: false, planCode: (await this.plans.planForUser(userId)).code, reasons: [] };
    }
    const { planCode, reasons } = await this.evaluate(this.prisma, userId, row);
    return { huntId, canActivate: reasons.length === 0 && row.status !== 'ARCHIVED', planCode, reasons };
  }

  /** LIVE hunts the user has (the active-hunt allowance counts these). */
  countLive(userId: string, db: Tx | PrismaClient = this.prisma, excludeHuntId?: string): Promise<number> {
    return db.hunt.count({
      where: { userId, status: 'LIVE', ...(excludeHuntId ? { id: { not: excludeHuntId } } : {}) },
    });
  }

  /** The hunt's history, oldest first - the most recent HUNT_EVENTS_MAX events (bounded response). */
  async events(userId: string, huntId: string): Promise<HuntEvent[]> {
    const row = await this.findOwned(this.prisma, userId, huntId);
    const events = await this.prisma.huntEvent.findMany({ where: { huntId: row.id }, orderBy: { createdAt: 'desc' }, take: HUNT_EVENTS_MAX });
    return events.reverse().map(toHuntEvent);
  }

  // -------------------------------------------------------------------------

  /** Plan + usage + readiness for taking `row` live. */
  private async evaluate(db: Tx | PrismaClient, userId: string, row: HuntRow) {
    const plan = await this.plans.planForUser(userId, db);
    const inUse = await this.countLive(userId, db, row.id);
    return { planCode: plan.code, reasons: evaluateActivation(plan.entitlements, inUse, criteriaOf(toHunt(row))) };
  }

  /** Status a restored hunt returns to, from its most recent ARCHIVED event. */
  private async statusBeforeArchive(tx: Tx, huntId: string) {
    const archived = await tx.huntEvent.findFirst({
      where: { huntId, type: 'ARCHIVED' },
      orderBy: { createdAt: 'desc' },
      select: { fromStatus: true },
    });
    return restoredStatus(archived?.fromStatus ?? null);
  }

  /** Monitoring state + counts for all of the user's hunts. */
  activityAll(userId: string): Promise<HuntActivity[]> {
    return loadHuntActivity(this.prisma, userId);
  }

  async activity(userId: string, huntId: string): Promise<HuntActivity> {
    await this.findOwned(this.prisma, userId, huntId);
    const [activity] = await loadHuntActivity(this.prisma, userId, [huntId]);
    return activity!;
  }

  /** Another user's hunt is indistinguishable from a missing one (404). */
  private async findOwned(db: Tx | PrismaClient, userId: string, huntId: string): Promise<HuntRow> {
    const row = await db.hunt.findFirst({ where: { id: huntId, userId }, include: HUNT_INCLUDE });
    if (!row) throw new AppException('NOT_FOUND', 'Hunt not found', HttpStatus.NOT_FOUND);
    return row;
  }

  /** Re-validates the merged criteria with the create rules (e.g. exclusions vs a changed query). */
  private validateMerged(candidate: HuntCriteria): HuntCriteria {
    const result = createHuntRequestSchema.safeParse(candidate);
    if (!result.success) {
      throw new ValidationFailedException(
        result.error.issues.map((issue) => ({ path: ['body', ...issue.path.map(String)].join('.'), message: issue.message })),
      );
    }
    return { ...result.data, name: result.data.name ?? candidate.name };
  }

  /** Marketplace keys -> ids; only enabled marketplaces can be chosen. */
  private async resolveMarketplaces(tx: Tx, keys: readonly MarketplaceKey[]): Promise<Map<MarketplaceKey, string>> {
    const rows = await tx.marketplace.findMany({ where: { key: { in: [...keys] }, isEnabled: true } });
    const found = new Map(rows.map((m) => [m.key as MarketplaceKey, m.id]));
    const missing = keys.filter((k) => !found.has(k));
    if (missing.length > 0) {
      throw new AppException(
        'CONFLICT',
        `Marketplace not available: ${missing.join(', ')} (is the database seeded?)`,
        HttpStatus.CONFLICT,
      );
    }
    return found;
  }

  /** Enables chosen marketplaces and disables removed ones - rows are never deleted. */
  private async syncMarketplaces(tx: Tx, row: HuntRow, keys: readonly MarketplaceKey[]): Promise<void> {
    const ids = await this.resolveMarketplaces(tx, keys);
    const wanted = new Set(ids.values());
    for (const link of row.marketplaces) {
      const enable = wanted.has(link.marketplaceId);
      if (link.isEnabled !== enable) {
        await tx.huntMarketplace.update({
          where: { huntId_marketplaceId: { huntId: row.id, marketplaceId: link.marketplaceId } },
          data: { isEnabled: enable },
        });
      }
      wanted.delete(link.marketplaceId);
    }
    if (wanted.size > 0) {
      await tx.huntMarketplace.createMany({
        data: [...wanted].map((marketplaceId) => ({ huntId: row.id, marketplaceId })),
      });
    }
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
