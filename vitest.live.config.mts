import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests contre les sources publiques réelles (réseau requis) : npm run test:live
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.'), 'server-only': path.resolve(import.meta.dirname, 'tests/live/server-only.ts') } },
  test: { include: ['tests/live/**/*.test.ts'], environment: 'node', testTimeout: 120_000, fileParallelism: false },
});
