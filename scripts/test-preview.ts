#!/usr/bin/env tsx
/* eslint-disable node/no-process-env -- script scaffolds env vars before spawning preview */
// Launches Vitest Preview with ports/env resolved through config/server.ts.
import { spawn } from 'node:child_process';
import process from 'node:process';

import { env } from '../config/server.js';
import { forceVitestPreviewCacheDir } from '#config/vitest/preview-cache';

process.env.NODE_ENV ??= 'test';

process.env.HOST = env.HOST;
process.env.PORT = String(env.VITEST_PREVIEW_PORT);
process.env.VITEST_PREVIEW = 'true';

forceVitestPreviewCacheDir();

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(pnpmCmd, ['exec', 'vitest-preview'], {
  env: { ...process.env },
  stdio: 'inherit',
  shell: false,
});

child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

child.on('error', (error: unknown) => {
  console.error(error);
  process.exit(1);
});
