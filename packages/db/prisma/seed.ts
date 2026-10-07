/**
 * Idempotent seed: safe to run repeatedly (upserts by unique key).
 * - Marketplaces: the launch marketplaces (all environments).
 * - Development plans: only outside production. No prices or entitlements -
 *   both are pending product/billing decisions.
 */
import type { MarketplaceId } from '@rein-drop/marketplace-core';
import { LOCAL_DATABASE_URL, loadDotEnvFile } from '@rein-drop/env';
import { createPrismaClient } from '../src/index.js';

const MARKETPLACES = {
  ebay: 'eBay',
  facebook: 'Facebook Marketplace',
} as const satisfies Record<MarketplaceId, string>;

const DEVELOPMENT_PLANS = [
  { code: 'dev-free', name: 'Development Free' },
  { code: 'dev-pro', name: 'Development Pro' },
] as const;

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

    if (isProduction) {
      console.log('NODE_ENV=production - skipped development plans');
      return;
    }
    for (const plan of DEVELOPMENT_PLANS) {
      await prisma.plan.upsert({
        where: { code: plan.code },
        create: { ...plan, isDevelopmentOnly: true },
        update: { name: plan.name, isDevelopmentOnly: true },
      });
    }
    console.log(`Seeded ${DEVELOPMENT_PLANS.length} development plans`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
