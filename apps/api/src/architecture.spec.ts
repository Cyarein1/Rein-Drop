import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiSrc = fileURLToPath(new URL('.', import.meta.url));
const workerSrc = join(apiSrc, '..', '..', 'worker', 'src');

/** Only this file may choose concrete marketplace adapters. */
const ADAPTER_WIRING = join('modules', 'marketplaces', 'marketplace-registry.provider.ts');
/** Wiring files allowed to import `/adapters` (config validates the dev scenario names). */
const ADAPTER_IMPORT_ALLOWED = new Set([
  ADAPTER_WIRING,
  join('config', 'api-config.ts'),
  join('worker', 'pipeline', 'marketplace-registry.ts'),
  join('worker', 'config', 'worker-config.ts'),
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(e.parentPath, e.name));
}

const importsOf = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);

/**
 * Domain modules depend on the marketplace abstraction (`@rein-drop/marketplace-core`), never
 * on concrete adapters, mock sources or marketplace payloads.
 */
describe('marketplace boundary', () => {
  const files = [
    ...sourceFiles(apiSrc).map((f) => ({ f, rel: relative(apiSrc, f) })),
    ...sourceFiles(workerSrc).map((f) => ({ f, rel: `worker${sep}${relative(workerSrc, f)}` })),
  ];

  it('finds the source files', () => {
    expect(files.some((x) => x.rel === ADAPTER_WIRING)).toBe(true);
  });

  it('only the registry wiring (and config) import concrete adapters', () => {
    const offenders = files
      .filter(({ rel }) => !ADAPTER_IMPORT_ALLOWED.has(rel))
      .filter(({ f }) => importsOf(f).some((i) => i === '@rein-drop/marketplace-core/adapters'))
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  it('application code never imports the contract test kit', () => {
    const offenders = files
      .filter(({ rel }) => !rel.endsWith('.spec.ts'))
      .filter(({ f }) => importsOf(f).some((i) => i === '@rein-drop/marketplace-core/testing'))
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  it('no code reaches into marketplace-core internals', () => {
    const offenders = files
      .filter(({ f }) => importsOf(f).some((i) => /marketplace-core\/(src|dist)\b/.test(i)))
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });
});
