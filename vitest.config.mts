import process from "node:process";
import path from "node:path";
import { config } from './config';
import { VITEST_DEFAULT_TEST_TIMEOUT_MS } from './tests/unit/_support/timeouts';
import { createViteSharedConfig } from './config/vite/shared';
import { configDefaults, defineConfig } from 'vitest/config';

const isVitestUi = process.argv.includes('--ui');
const isVitestList = process.argv.includes('list');

export default defineConfig({
  ...createViteSharedConfig(),
  test: {
    environment: 'jsdom',
    globalSetup: isVitestList ? undefined : './tests/global/collab-server-setup.ts',
    setupFiles: ['./tests/unit/_support/setup/index.ts'],
    include: [
      ...configDefaults.include,
      'tests/unit/**/*.spec.{ts,tsx}',
      // Skill-local specs under .claude/ are hidden from the crawler; they
      // register via tests/unit/skills/embedded.spec.ts (self-guarded).
    ],
    // Root config/manifest edits affect every test but aren't imported by any
    // test file, so `--changed` would otherwise find nothing and false-pass.
    // `--changed` matches these against absolute paths, so single-file patterns
    // need a `**/` prefix and no trailing `/**` (the vitest defaults assume
    // config is a dir); directory triggers use a trailing `/**` to match any
    // file within. Skill-local tools (plus the cli2 config) are spawned or read
    // at runtime by their specs, never imported, so `--changed` can't reach
    // them either — trigger their specs to rerun when any file under them
    // changes.
    forceRerunTriggers: [
      ...configDefaults.forceRerunTriggers,
      '**/vitest.config.*',
      '**/package.json',
      '**/pnpm-lock.yaml',
      '**/tsconfig*.json',
      '**/.agents/skills/**/tools/**',
      // Prompt/reference templates a skill tool reads at runtime (e.g.
      // advocate-run.sh substitutes references/advocate.md; its spec asserts
      // that coupling) are also never imported, so trigger their specs on edit.
      '**/.agents/skills/**/references/**',
      // A newly added/renamed skill spec under hidden skill roots is not
      // imported by the embedded.spec.ts bridge until wired in; trigger the
      // bridge so its self-guard (which fails on a missing import) runs under
      // --changed rather than passing until the next full suite. The guard
      // scans every hidden root it treats as canonical (`.agents` plus the real
      // `.claude`/`.codex` skill dirs), so the trigger must span the same roots
      // or a spec added under `.claude`/`.codex` would false-pass changed-only.
      '**/.agents/skills/**/tests/**',
      '**/.claude/skills/**/tests/**',
      '**/.codex/skills/**/tests/**',
      '**/.markdownlint-cli2.jsonc',
    ],
    exclude: [
      ...configDefaults.exclude,
      '**/.pnpm-store/**',
      '**/data/**',
      'tests/e2e/**',
      'tests/perf/**',
      ...(config.env.COLLAB_ENABLED ? [] : ['tests/unit/collab/**']),
    ],
    css: true,
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
