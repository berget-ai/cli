import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/types/**', 'src/schemas/**', 'src/**/__tests__/**'],
      include: ['src/**'],
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 52,
        functions: 48,
        lines: 50,
        statements: 50,
      },
    },
    environment: 'node',
    exclude: ['node_modules', 'dist'],
    globals: true,
  },
});
