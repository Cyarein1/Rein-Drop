import { defineConfig } from 'prisma/config';
import { LOCAL_DATABASE_URL, loadDotEnvFile } from '@rein-drop/env';

// Prisma 7 does not load .env itself. packages/db/.env is optional; without it the
// CLI targets the local docker-compose database.
loadDotEnvFile();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL?.trim() || LOCAL_DATABASE_URL,
  },
});
