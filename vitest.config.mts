import process from "node:process";
import { config } from './config';
import { createViteSharedConfig } from './vite.shared';
import { configDefaults, defineConfig } from 'vitest/config';

const isVitestUi = process.argv.includes('--ui');

export default defineConfig({
  ...createViteSharedConfig(),
  test: {
    environment: 'jsdom',
    globalSetup: './tests/global/collab-server-setup.ts',
    setupFiles: ['./tests/unit/_support/setup/index.ts'],
    include: [
      ...configDefaults.include,
      'tests/unit/**/*.spec.{ts,tsx}',
    ],
    exclude: [
      ...configDefaults.exclude,
      '**/.pnpm-store/**',
      '**/data/**',
      'tests/e2e/**',
      ...(config.env.COLLAB_ENABLED ? [] : ['tests/unit/collab/**']),
    ],
    css: true,
    slowTestThreshold: config.env.COLLAB_ENABLED ? 4000 : undefined,
    api: isVitestUi ? {
      host: config.env.HOST,
      port: config.env.VITEST_PORT,
      strictPort: true,
    } : undefined,
    testTimeout: 5000,
    hookTimeout: 5000,
    teardownTimeout: 5000,
    coverage: {
      provider: 'v8' as const,
      reportsDirectory: 'data/coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx'],
    },
    open: false,
  }
});
