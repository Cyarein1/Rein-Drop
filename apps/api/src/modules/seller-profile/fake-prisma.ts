import type { PrismaClient } from '@rein-drop/db';
import type { SnapshotRow } from './seller-snapshot.mapper.js';

type ProfileRow = SnapshotRow & { userId: string };

const emptyRow = (userId: string): ProfileRow => ({
  userId,
  isReseller: null,
  huntCategories: [],
  huntCategoriesOther: null,
  resellerStage: null,
  sourcingChannels: [],
  sourcingChannelsOther: null,
  dealCriterion: null,
  dealTargetAmountMinor: null,
  dealTargetCurrency: null,
  dealTargetMarginPercent: null,
  improvementGoal: null,
  snapshotCompletedAt: null,
  updatedAt: new Date(),
});

/** Minimal in-memory stand-in for the sellerProfile delegate (tests only). */
export function createFakeSellerProfilePrisma() {
  const rows = new Map<string, ProfileRow>();
  const sellerProfile = {
    findUnique: async ({ where }: { where: { userId: string } }) => rows.get(where.userId) ?? null,
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { userId: string };
      create: Partial<ProfileRow>;
      update: Partial<ProfileRow>;
    }) => {
      const existing = rows.get(where.userId);
      const next = { ...(existing ?? emptyRow(where.userId)), ...(existing ? update : create), updatedAt: new Date() };
      rows.set(where.userId, next);
      return next;
    },
    update: async ({ where, data }: { where: { userId: string }; data: Partial<ProfileRow> }) => {
      const existing = rows.get(where.userId);
      if (!existing) throw new Error('Record not found');
      const next = { ...existing, ...data, updatedAt: new Date() };
      rows.set(where.userId, next);
      return next;
    },
  };
  const prisma = {
    sellerProfile,
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(prisma),
  };
  return { prisma: prisma as unknown as PrismaClient, rows, sellerProfile };
}
