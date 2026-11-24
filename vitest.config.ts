import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['shared/**/*.ts', 'server/**/*.ts', 'src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'server.ts', '**/*.d.ts'],
    },
  },
});
