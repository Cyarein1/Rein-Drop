import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  RESELLER_INTENT_COPY,
  type SaveSellerSnapshotRequest,
  type SellerSnapshot,
  type UpdateSellerSnapshotRequest,
} from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import type { ProductEvents } from '@rein-drop/telemetry';
import { AppException } from '../../common/errors/app.exception.js';
import { PRISMA } from '../../database/database.module.js';
import { PRODUCT_EVENTS } from '../telemetry/telemetry.tokens.js';
import { hasProfileAnswers, toSellerSnapshot, toSnapshotColumns } from './seller-snapshot.mapper.js';

/**
 * Seller Snapshot persistence for one user: the "Are you a reseller?" gate plus the
 * five onboarding answers on SellerProfile.
 */
@Injectable()
export class SellerSnapshotService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PRODUCT_EVENTS) private readonly events: ProductEvents,
  ) {}

  /** Read-only: a user without a profile gets an empty snapshot (nothing is created). */
  async get(userId: string): Promise<SellerSnapshot> {
    const row = await this.prisma.sellerProfile.findUnique({ where: { userId } });
    return toSellerSnapshot(row);
  }

  /**
   * Saves the answers present in `answers`; creates the profile on first save.
   * The five profile answers are only accepted for resellers (409 otherwise).
   * Answering the gate with "no" keeps any earlier answers (switching back restores them).
   */
  async update(userId: string, answers: UpdateSellerSnapshotRequest): Promise<SellerSnapshot> {
    const data = toSnapshotColumns(answers);
    const saved = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.sellerProfile.findUnique({ where: { userId }, select: { isReseller: true } });
      if (hasProfileAnswers(answers)) {
        const isReseller = answers.isReseller ?? existing?.isReseller ?? null;
        if (isReseller !== true) {
          throw new AppException(
            'CONFLICT',
            `The Seller Snapshot questions are for resellers - answer "${RESELLER_INTENT_COPY.question}" with yes first`,
            HttpStatus.CONFLICT,
          );
        }
      }

      let row = await tx.sellerProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      // Completed = a reseller answered all five. Stamped once; later edits keep the original time.
      let completedNow = false;
      if (!row.snapshotCompletedAt && toSellerSnapshot(row).status === 'complete') {
        row = await tx.sellerProfile.update({ where: { userId }, data: { snapshotCompletedAt: new Date() } });
        completedNow = true;
      }
      return { snapshot: toSellerSnapshot(row), startedNow: !existing, completedNow };
    });
    // After commit: started = the profile was created by this save; completed = stamped by it.
    if (saved.startedNow) this.events.track('onboarding_started', userId, {});
    if (saved.completedNow) this.events.track('onboarding_completed', userId, {});
    return saved.snapshot;
  }

  /** Saves all five answers at once (PUT). Saving the full snapshot means the user is a reseller. */
  save(userId: string, answers: SaveSellerSnapshotRequest): Promise<SellerSnapshot> {
    return this.update(userId, { ...answers, isReseller: true });
  }
}
