/**
 * Backend data layer. Server-only (api, worker) - never import from web or mobile.
 *
 * Re-exports the generated Prisma client: PrismaClient, the Prisma namespace,
 * model types (User, Listing, ...) and enums (HuntStatus, ...).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

/** Creates a client using the node-postgres driver adapter (required by Prisma 7). */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
