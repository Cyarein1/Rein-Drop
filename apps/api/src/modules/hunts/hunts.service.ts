import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  createHuntRequestSchema,
  HUNT_TRANSITIONS,
  huntLiveReadinessProblems,
  type ApiErrorDetail,
  type CreateHuntRequest,
  type Hunt,
  type HuntAction,
  type HuntEvent,
  type HuntEventType,
  type ListHuntsQuery,
  type MarketplaceKey,
  type Page,
  type UpdateHuntRequest,
} from '@rein-drop/contracts';
import type { Prisma, PrismaClient } from '@rein-drop/db';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { PRISMA } from '../../database/database.module.js';
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
};

/**
 * Hunt CRUD + lifecycle for one user. Every change runs in a transaction together
 * with its HuntEvent, so history is never out of step with the hunt. Hunts are
 * never deleted.
 */
@Injectable()
export class HuntsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

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
    const criteria: HuntCriteria = { ...request, name: request.name ?? defaultHuntName(request.query) };
    return this.prisma.$transaction(async (tx) => {
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
  }

  /**
   * Edits criteria in place (same id). The merged result is re-validated as a whole;
   * a LIVE hunt must stay live-ready. Records an EDITED event with the changes.
   */
  async update(userId: string, huntId: string, request: UpdateHuntRequest): Promise<Hunt> {
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

      if (row.status === 'LIVE') this.assertLiveReady(merged, 'This change would stop the hunt from running');

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

  /** Lifecycle move (activate / pause / resume / archive). Invalid moves -> 409. */
  async transition(userId: string, huntId: string, action: HuntAction): Promise<Hunt> {
    const { from, to } = HUNT_TRANSITIONS[action];
    return this.prisma.$transaction(async (tx) => {
      const row = await this.findOwned(tx, userId, huntId);
      if (!from.includes(row.status)) {
        throw new AppException(
          'CONFLICT',
          `Cannot ${action} a hunt that is ${row.status.toLowerCase()}`,
          HttpStatus.CONFLICT,
        );
      }
      if (to === 'LIVE') {
        // TODO(plan-gate): check plan entitlements (active hunts, marketplaces) here
        // before going live (App Flow Blueprint sections 6 and 14).
        this.assertLiveReady(criteriaOf(toHunt(row)), 'This hunt is not ready to go live');
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
  }

  /** The hunt's history, oldest first. */
  async events(userId: string, huntId: string): Promise<HuntEvent[]> {
    const row = await this.findOwned(this.prisma, userId, huntId);
    const events = await this.prisma.huntEvent.findMany({ where: { huntId: row.id }, orderBy: { createdAt: 'asc' } });
    return events.map(toHuntEvent);
  }

  // -------------------------------------------------------------------------

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

  private assertLiveReady(criteria: HuntCriteria, message: string): void {
    const problems = huntLiveReadinessProblems(criteria);
    if (problems.length > 0) {
      const details: ApiErrorDetail[] = problems.map((p) => ({ path: 'body.location', message: p }));
      throw new AppException('CONFLICT', message, HttpStatus.CONFLICT, details);
    }
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
