import { Inject, Injectable } from '@nestjs/common';
import {
  answeredQuestionCount,
  SELLER_SNAPSHOT_QUESTION_COUNT,
  type SaveSellerSnapshotRequest,
  type SellerSnapshot,
  type UpdateSellerSnapshotRequest,
} from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import { PRISMA } from '../../database/database.module.js';
import { toSellerSnapshot, toSnapshotColumns } from './seller-snapshot.mapper.js';

/** Seller Snapshot persistence for one user (the five onboarding answers on SellerProfile). */
@Injectable()
export class SellerSnapshotService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Read-only: a user without a profile gets an empty snapshot (nothing is created). */
  async get(userId: string): Promise<SellerSnapshot> {
    const row = await this.prisma.sellerProfile.findUnique({ where: { userId } });
    return toSellerSnapshot(row);
  }

  /** Saves the answers present in `answers`; creates the profile on first save. */
  async update(userId: string, answers: UpdateSellerSnapshotRequest): Promise<SellerSnapshot> {
    const data = toSnapshotColumns(answers);
    return this.prisma.$transaction(async (tx) => {
      let row = await tx.sellerProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      // Completed = all five answered. Stamped once; later edits keep the original time.
      const snapshot = toSellerSnapshot(row);
      if (!row.snapshotCompletedAt && answeredQuestionCount(snapshot) === SELLER_SNAPSHOT_QUESTION_COUNT) {
        row = await tx.sellerProfile.update({ where: { userId }, data: { snapshotCompletedAt: new Date() } });
      }
      return toSellerSnapshot(row);
    });
  }

  /** Saves all five answers at once (PUT). Same rules as `update`. */
  save(userId: string, answers: SaveSellerSnapshotRequest): Promise<SellerSnapshot> {
    return this.update(userId, answers);
  }
}
