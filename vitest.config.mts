import process from "node:process";
import path from "node:path";
import { config } from './config/index.ts';
import { VITEST_DEFAULT_TEST_TIMEOUT_MS } from './tests/unit/_support/timeouts.ts';
import { createViteSharedConfig } from './config/vite/shared.ts';
import { configDefaults, defineConfig, defineProject } from 'vitest/config';

const isVitestUi = process.argv.includes('--ui');
const isVitestList = process.argv.includes('list');
const directlyRunsSkillTests = process.argv.some(argument =>
  /(?:^|[/\\])\.(?:agents|claude)[/\\]skills[/\\]/.test(argument));

const shared = defineProject({
  ...createViteSharedConfig(),
  test: {
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
    testTimeout: VITEST_DEFAULT_TEST_TIMEOUT_MS,
    hookTimeout: VITEST_DEFAULT_TEST_TIMEOUT_MS,
  }
});

// These tests exercise Node boundaries and do not need a DOM or an editor.
const nodeTests = [
  'tests/unit/net.spec.ts',
  'tests/unit/config-env.spec.ts',
  'tests/unit/test-launchers.spec.ts',
  'tests/unit/collab-test-runtime.spec.ts',
  'tests/unit/docker-entrypoint-env.spec.ts',
  'config/eslint/*.spec.ts',
  'tests/unit/agent-instructions-gate.spec.ts',
  'tests/unit/collab-auth.spec.ts',
  'tests/unit/dev-runtime-launchers.spec.ts',
  'tests/unit/docker-entrypoint-lifecycle.spec.ts',
  'tests/unit/e2e-auth-context.spec.ts',
  'tests/unit/linking-preflight.spec.ts',
  'tests/unit/managed-process.spec.ts',
  'tests/unit/markdownlint-line-length.spec.ts',
  'tests/unit/prod-docker-launcher.spec.ts',
  'tests/unit/provider-headless-lifecycle.spec.ts',
  'tests/unit/server/**/*.spec.ts',
  'tests/unit/skills/embedded.spec.ts',
  'tests/unit/snapshot-backup.spec.ts',
  'tests/unit/todo-list.spec.ts',
  'tests/unit/vite-logger.spec.ts',
  'tests/unit/vite-shared.spec.ts',
  'src/server/auth/*.spec.ts',
  'src/server/db/*.spec.ts',
  'src/server/documents/*.spec.ts',
  'src/server/projection/*.spec.ts',
  'src/server/remdo-oauth/*.spec.ts',
  'src/server/collab-token.spec.ts',
  'src/server/token-url-rewrite.spec.ts',
];

// These tests render their own UI or exercise browser state without an editor.
const domTests = [
  'src/client/app/dev/*.spec.tsx',
  'src/client/app/session/*.spec.{ts,tsx}',
  'src/client/app/sharing/*.spec.tsx',
  'src/client/app/user-data/*.spec.{ts,tsx}',
  'src/client/app/workspace/document/home-view.spec.tsx',
  'src/client/app/workspace/search-result-row.spec.tsx',
  'src/client/dev/*.spec.tsx',
  'src/client/ui/AppHeader.spec.tsx',
];

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    teardownTimeout: VITEST_DEFAULT_TEST_TIMEOUT_MS,
    slowTestThreshold: config.env.COLLAB_ENABLED ? 4000 : undefined,
    globalSetup: isVitestList ? undefined : './tests/global/collab-test-runtime.ts',
    api: isVitestUi ? {
      host: config.env.HOST,
      port: config.env.VITEST_PORT,
      strictPort: true,
    } : undefined,
    coverage: {
      provider: 'v8' as const,
      reportsDirectory: path.join(config.env.DATA_DIR || 'data', 'coverage'),
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx'],
    },
    open: false,
    projects: [
      {
        ...shared,
        test: {
          ...shared.test,
          name: 'node',
          environment: 'node',
          include: nodeTests,
          setupFiles: ['./tests/unit/_support/setup/_internal/assertions/console.ts'],
        },
      },
      {
        ...shared,
        test: {
          ...shared.test,
          name: 'dom',
          environment: 'jsdom',
          include: domTests,
          setupFiles: ['./tests/unit/_support/setup/dom.ts'],
        },
      },
      {
        ...shared,
        test: {
          ...shared.test,
          name: 'editor',
          environment: 'jsdom',
          exclude: [...shared.test!.exclude!, ...nodeTests, ...domTests],
          setupFiles: ['./tests/unit/_support/setup/index.ts'],
        },
      },
    ],
  },
});
