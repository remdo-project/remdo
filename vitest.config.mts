import process from "node:process";
import path from "node:path";
import { config } from './config/index.ts';
import { VITEST_DEFAULT_TEST_TIMEOUT_MS } from './tests/unit/_support/timeouts.ts';
import { createViteSharedConfig } from './config/vite/shared.ts';
import { configDefaults, defineConfig } from 'vitest/config';

const isVitestUi = process.argv.includes('--ui');
const isVitestList = process.argv.includes('list');
const directlyRunsSkillTests = process.argv.some(argument =>
  /(?:^|[/\\])\.(?:agents|claude)[/\\]skills[/\\]/.test(argument));

export default defineConfig({
  ...createViteSharedConfig(),
  test: {
    environment: 'jsdom',
    globalSetup: isVitestList ? undefined : './tests/global/collab-test-runtime.ts',
    setupFiles: ['./tests/unit/_support/setup/index.ts'],
    exclude: [
      ...configDefaults.exclude,
      '**/.agent/**',
      '**/.pnpm-store/**',
      '**/data/**',
      ...(directlyRunsSkillTests ? [] : [
        '**/.agents/skills/**/tests/**',
        '**/.claude/skills/**/tests/**',
      ]),
      'tests/e2e/**',
      'tests/perf/**',
      ...(config.env.COLLAB_ENABLED ? [] : ['tests/unit/collab/**']),
    ],
    css: true,
    // Date labels resolve their format from the runtime locale and zone
    // (`formatDateNodeLabel`), so pin both to keep expected text
    // machine-independent. LC_ALL is deliberately not set: it would leak into
    // shell subprocesses that lack the locale. Node reads ICU's default from
    // LANG, which every environment already accepts.
    env: {
      LANG: 'en_US.UTF-8',
      TZ: 'UTC',
    },
    slowTestThreshold: config.env.COLLAB_ENABLED ? 4000 : undefined,
    api: isVitestUi ? {
      host: config.env.HOST,
      port: config.env.VITEST_PORT,
      strictPort: true,
    } : undefined,
    testTimeout: VITEST_DEFAULT_TEST_TIMEOUT_MS,
    hookTimeout: VITEST_DEFAULT_TEST_TIMEOUT_MS,
    teardownTimeout: VITEST_DEFAULT_TEST_TIMEOUT_MS,
    coverage: {
      provider: 'v8' as const,
      reportsDirectory: path.join(config.env.DATA_DIR || 'data', 'coverage'),
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx'],
    },
    open: false,
  }
});
