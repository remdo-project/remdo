import { createViteSharedConfig } from './vite.shared';
import { defineConfig } from 'vitest/config';

const PERF_TIMEOUT_MS = 4 * 60 * 1000;

export default defineConfig({
  ...createViteSharedConfig(),
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/unit/_support/setup/index.ts'],
    benchmark: {
      include: ['tests/perf/**/*.bench.ts'],
    },
    css: true,
    testTimeout: PERF_TIMEOUT_MS,
    hookTimeout: PERF_TIMEOUT_MS,
    teardownTimeout: PERF_TIMEOUT_MS,
  },
});
