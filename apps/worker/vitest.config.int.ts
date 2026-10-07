import { defineConfig } from 'vitest/config';

/** Integration tests against a real database - see test/*.int-spec.ts. */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.int-spec.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
