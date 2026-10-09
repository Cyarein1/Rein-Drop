/**
 * One-command reset for repeatable local demos / acceptance runs (docs/LOCAL_MVP_ACCEPTANCE.md):
 *   pnpm db:reset-demo
 *
 * 1. Refuses NODE_ENV=production, and any database that isn't on this machine unless
 *    `--allow-remote` is passed (it still never runs in production).
 * 2. `prisma migrate reset --force`: drops every table and re-applies all migrations.
 * 3. `prisma db seed`: marketplaces, plans and the development user (seed.ts, idempotent).
 *
 * The result is a clean slate: the development user exists but has not answered the Seller
 * Snapshot, has no Hunts, deals, alerts, inventory, sales or subscription.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_DATABASE_URL, loadDotEnvFile } from '@rein-drop/env';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Why this database must not be reset, or null when it may. Exported for tests. */
export function resetRefusal(databaseUrl: string, nodeEnv: string | undefined, allowRemote: boolean): string | null {
  if (nodeEnv === 'production') return 'NODE_ENV=production - the demo reset never runs in production.';
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    return 'DATABASE_URL is not a valid URL.';
  }
  if (!LOCAL_HOSTS.has(host) && !allowRemote) {
    return `DATABASE_URL points at "${host}", not this machine. Pass --allow-remote if you really mean to wipe it.`;
  }
  return null;
}

/** Runs this package's Prisma CLI with Node directly (no shell: arguments are passed as-is). */
function run(args: string[], cwd: string): void {
  const cli = createRequire(resolve(cwd, 'package.json')).resolve('prisma/build/index.js');
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    console.error(`\nprisma ${args.join(' ')} failed (exit ${result.status ?? 'unknown'}).`);
    process.exit(result.status ?? 1);
  }
}

function main(): void {
  loadDotEnvFile();
  const databaseUrl = process.env.DATABASE_URL?.trim() || LOCAL_DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  const refusal = resetRefusal(databaseUrl, process.env.NODE_ENV, process.argv.includes('--allow-remote'));
  if (refusal) {
    console.error(`Refusing to reset: ${refusal}`);
    process.exit(1);
  }
  const host = new URL(databaseUrl);
  console.log(`Resetting ${host.hostname}:${host.port || 5432}${host.pathname} - ALL DATA in it will be deleted.`);
  console.log('Tip: stop the worker first (it would keep writing during the reset), then start it again for fresh listings.\n');

  const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  run(['migrate', 'reset', '--force'], packageDir);
  run(['db', 'seed'], packageDir);

  console.log('\nDemo database ready: development user dev@reindrop.local, no Snapshot answers, no Hunts.');
  console.log('Next: restart the worker (fresh development listings), open http://localhost:3000 and follow docs/LOCAL_MVP_ACCEPTANCE.md.');
}

// Run only when executed directly (tests import resetRefusal).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
