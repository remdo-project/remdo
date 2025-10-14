#!/usr/bin/env node
// Launches Vitest Preview with ports/env resolved through env.server.ts.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

process.env.NODE_ENV ??= 'test';

const require = createRequire(import.meta.url);
const jiti = require('jiti')(import.meta.url);

const {
  env,
  applyVitestPreviewCacheEnv,
} = jiti('../config/vitest-preview-env.ts');

process.env.HOST = env.HOST;
process.env.PORT = String(env.VITEST_PREVIEW_PORT);
process.env.VITEST_PREVIEW = 'true';

applyVitestPreviewCacheEnv();

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(pnpmCmd, ['exec', 'vitest-preview'], {
  env: { ...process.env },
  stdio: 'inherit',
  shell: false,
});

child.on('close', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
