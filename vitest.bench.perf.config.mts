import { createViteSharedConfig } from './config/vite/shared.ts';
import { defineConfig } from 'vitest/config';

const PERF_TIMEOUT_MS = 4 * 60 * 1000;

export default defineConfig({
  ...createViteSharedConfig(),
  test: {
    environment: 'jsdom',
    // Console spies must keep calls recorded while fixtures load; afterEach clears them.
    clearMocks: false,
    setupFiles: ['./tests/unit/_support/setup/index.ts'],
    benchmark: {
      include: ['tests/perf/**/*.bench.ts'],
    },
    css: true,
    reporters: ['verbose'],
    testTimeout: PERF_TIMEOUT_MS,
    hookTimeout: PERF_TIMEOUT_MS,
    teardownTimeout: PERF_TIMEOUT_MS,
  },
});
