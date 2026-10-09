import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests de base de données : nécessitent TEST_DATABASE_URL (Postgres local avec l'émulation Supabase).
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
  test: { include: ['tests/db/**/*.test.ts'], environment: 'node', fileParallelism: false },
});
