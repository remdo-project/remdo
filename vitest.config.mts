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


// These tests exercise Node boundaries and do not need a DOM or an editor.
const nodeTests = [
  'src/collaboration-server/server.spec.ts',
  'src/mcp/server.spec.ts',
  'tests/unit/editor-state-defaults.spec.ts',
  'src/client/editor/runtime/editor-state-persistence.spec.ts',
  'src/client/editor/runtime/serialized-editor-state.spec.ts',

  'src/document-routes/document-routes.spec.ts',
  'src/note-sdk/note-sdk-core.spec.ts',
  'src/client/search/query-match.spec.ts',
  'src/client/ui/navigation-label.spec.ts',
  'src/client/editor/mobile-toolbar/mobile-toolbar-actions.spec.ts',
  'src/client/editor/mobile-toolbar/mobile-toolbar-layout.spec.ts',
  'src/client/editor/triggers/active-popup.spec.ts',
  'src/client/editor/runtime/collaboration/collaboration-indicator.spec.ts',
  'src/client/editor/runtime/collaboration/offline-document-unavailable.spec.ts',
  'tests/unit/internal/waitForSync.spec.ts',

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
  'tests/unit/managed-process.spec.ts',
  'tests/unit/markdownlint-line-length.spec.ts',
  'tests/unit/prod-docker-launcher.spec.ts',
  'tests/unit/provider-headless-lifecycle.spec.ts',
  'tests/unit/skills/embedded.spec.ts',
  'tests/unit/todo-list.spec.ts',
  'tests/unit/django-template-storage-keys.spec.ts',
  'tests/unit/vite-logger.spec.ts',
  'tests/unit/vite-shared.spec.ts',
];

// These tests need a DOM but not the shared RemDo editor fixture.
const domTests = [
  'src/client/editor/outline/selection/selection-tree.spec.ts',
  'src/client/editor/outline/selection/selection-rungs.spec.ts',
  'src/client/editor/dev/vanilla-lexical-editor.spec.tsx',
  'src/client/editor/dev/tree-view-plugin.spec.tsx',

  'src/collaboration/local-persistence-support.spec.ts',
  'src/collaboration/session-hydration.spec.ts',
  'src/collaboration/session-unsynced-documents.spec.ts',
  'src/collaboration/unsynced-local-changes.spec.ts',
  'src/platform/http/*.spec.ts',
  'src/client/editor/keymap/keymap-plugin.spec.ts',
  'src/client/editor/mobile-toolbar/MobileActionToolbar.spec.tsx',
  'src/client/editor/view/editor-view-provider.spec.tsx',
  'src/client/editor/features/zoom/zoom-breadcrumbs.spec.tsx',

  'src/client/app/dev/*.spec.tsx',
  'src/client/app/session/*.spec.{ts,tsx}',
  'src/client/app/sharing/*.spec.tsx',
  'src/client/app/user-data/*.spec.{ts,tsx}',
  'src/client/app/workspace/document/home-view.spec.tsx',
  'src/client/app/workspace/search-result-row.spec.tsx',
  'src/client/dev/*.spec.tsx',
  'src/client/ui/*.spec.tsx',
];

export default defineConfig({
  ...createViteSharedConfig(),
  test: {
    // Console spies must keep calls recorded while fixtures load; afterEach clears them.
    clearMocks: false,
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
        test: {
          name: 'node',
          environment: 'node',
          include: nodeTests,
          setupFiles: ['./tests/unit/_support/setup/_internal/assertions/console.ts'],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: domTests,
          setupFiles: ['./tests/unit/_support/setup/dom.ts'],
        },
      },
      {
        test: {
          name: 'editor',
          environment: 'jsdom',
          exclude: [...nodeTests, ...domTests],
          setupFiles: ['./tests/unit/_support/setup/index.ts'],
        },
      },
    ],
  },
});
