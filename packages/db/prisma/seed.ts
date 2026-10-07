/**
 * Idempotent seed: safe to run repeatedly (upserts by unique key).
 * - Marketplaces: the launch marketplaces (all environments).
 * - Plans + entitlements: Free and placeholder paid plans (all environments). NO prices.
 * - Development user: only outside production. Identified by the API's
 *   DEVELOPMENT-ONLY DevAuthProvider (no password exists for it).
 */
import type { MarketplaceId } from '@rein-drop/marketplace-core';
import { DEV_AUTH_SUBJECT, DEV_AUTH_USER_EMAIL, ENTITLEMENT_KEYS as K } from '@rein-drop/contracts';
import { LOCAL_DATABASE_URL, loadDotEnvFile } from '@rein-drop/env';
import { createPrismaClient } from '../src/index.js';

const MARKETPLACES = {
  ebay: 'eBay',
  facebook: 'Facebook Marketplace',
} as const satisfies Record<MarketplaceId, string>;

type EntitlementSeed = { key: string; limit: number | null; value?: string };

/**
 * ============================== PLACEHOLDER ==============================
 * Plan limits below are NOT product decisions. They exist so entitlement
 * enforcement can be built and tested. Final values come from the product
 * owner's infrastructure cost calculations; then update this table, set
 * `limitsFinal: true`, and re-run `pnpm db:seed`.
 * Prices are deliberately absent (billing TBD). Names follow the Mobile UI
 * Screenbook ("Free - Pro - Ultimate").
 * =========================================================================
 */
const PLAN_CATALOGUE: {
  code: string;
  name: string;
  isFree: boolean;
  sortOrder: number;
  limitsFinal: boolean;
  entitlements: EntitlementSeed[];
}[] = [
  {
    code: 'free',
    name: 'Free',
    isFree: true,
    sortOrder: 0,
    limitsFinal: false,
    entitlements: [
      { key: K.activeHuntsMax, limit: 1 }, // PLACEHOLDER
      { key: `${K.marketplacePrefix}ebay`, limit: null },
      { key: `${K.marketplacePrefix}facebook`, limit: null },
      { key: K.hotHuntsEnabled, limit: 0 }, // future feature: off
      { key: K.hotHuntsMax, limit: 0 },
      { key: K.monitoringPriority, limit: null, value: 'NORMAL' },
      { key: K.analyticsHistoryDays, limit: 30 }, // PLACEHOLDER
      { key: K.seatsMax, limit: 1 },
    ],
  },
  {
    code: 'pro',
    name: 'Pro',
    isFree: false,
    sortOrder: 1,
    limitsFinal: false,
    entitlements: [
      { key: K.activeHuntsMax, limit: 10 }, // PLACEHOLDER
      { key: `${K.marketplacePrefix}ebay`, limit: null },
      { key: `${K.marketplacePrefix}facebook`, limit: null },
      { key: K.hotHuntsEnabled, limit: 0 }, // future feature: off
      { key: K.hotHuntsMax, limit: 0 },
      { key: K.monitoringPriority, limit: null, value: 'NORMAL' },
      { key: K.analyticsHistoryDays, limit: null }, // PLACEHOLDER (full history)
      { key: K.seatsMax, limit: 1 },
    ],
  },
  {
    code: 'ultimate',
    name: 'Ultimate',
    isFree: false,
    sortOrder: 2,
    limitsFinal: false,
    entitlements: [
      { key: K.activeHuntsMax, limit: 25 }, // PLACEHOLDER
      { key: `${K.marketplacePrefix}ebay`, limit: null },
      { key: `${K.marketplacePrefix}facebook`, limit: null },
      { key: K.hotHuntsEnabled, limit: 0 }, // future feature: off
      { key: K.hotHuntsMax, limit: 0 },
      { key: K.monitoringPriority, limit: null, value: 'NORMAL' },
      { key: K.analyticsHistoryDays, limit: null }, // PLACEHOLDER (full history)
      { key: K.seatsMax, limit: 3 }, // PLACEHOLDER (teams are roadmap)
    ],
  },
];

/** Codes from earlier seeds; deactivated (kept for history, never offered). */
const RETIRED_PLAN_CODES = ['dev-free', 'dev-pro'];

async function main() {
  loadDotEnvFile();
  const isProduction = process.env.NODE_ENV === 'production';
  const prisma = createPrismaClient(process.env.DATABASE_URL?.trim() || LOCAL_DATABASE_URL);

  try {
    for (const [key, name] of Object.entries(MARKETPLACES)) {
      await prisma.marketplace.upsert({
        where: { key },
        create: { key, name },
        update: { name },
      });
    }
    console.log(`Seeded ${Object.keys(MARKETPLACES).length} marketplaces`);

    for (const { entitlements, ...plan } of PLAN_CATALOGUE) {
      const row = await prisma.plan.upsert({
        where: { code: plan.code },
        create: { ...plan, isActive: true },
        update: { ...plan, isActive: true, isDevelopmentOnly: false },
      });
      // Make the plan's entitlements exactly match the catalogue (removed keys = not granted).
      await prisma.entitlement.deleteMany({
        where: { planId: row.id, key: { notIn: entitlements.map((e) => e.key) } },
      });
      for (const e of entitlements) {
        await prisma.entitlement.upsert({
          where: { planId_key: { planId: row.id, key: e.key } },
          create: { planId: row.id, key: e.key, limit: e.limit, value: e.value ?? null },
          update: { limit: e.limit, value: e.value ?? null },
        });
      }
    }
    const retired = await prisma.plan.updateMany({
      where: { code: { in: RETIRED_PLAN_CODES } },
      data: { isActive: false },
    });
    console.log(
      `Seeded ${PLAN_CATALOGUE.length} plans (limits are PLACEHOLDERS, no prices)` +
        (retired.count ? `; deactivated ${retired.count} retired development plan(s)` : ''),
    );

    if (isProduction) {
      console.log('NODE_ENV=production - skipped development user');
      return;
    }
    const devUser = await prisma.user.upsert({
      where: { email: DEV_AUTH_USER_EMAIL },
      create: { email: DEV_AUTH_USER_EMAIL, authProvider: 'dev', authSubject: DEV_AUTH_SUBJECT },
      update: { authProvider: 'dev', authSubject: DEV_AUTH_SUBJECT },
    });
    await prisma.sellerProfile.upsert({
      where: { userId: devUser.id },
      create: { userId: devUser.id },
      update: {},
    });
    console.log(`Seeded development user ${DEV_AUTH_USER_EMAIL} (dev auth subject "${DEV_AUTH_SUBJECT}")`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
