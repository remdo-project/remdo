#!/usr/bin/env tsx
/* eslint-disable node/no-process-env -- script derives env vars for Vitest watch mode */
// Runs Vitest with dynamically calculated API port from config/server.ts.
// Required because Vitest doesn't support runtime port configuration.
import { spawn } from 'node:child_process';
import process from 'node:process';

import { env } from '../config/server.js';

process.env.NODE_ENV ??= 'test';

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const vitestArgs = [
  'exec',
  'vitest',
  '--watch',
  '--ui',
  '--api.host',
  '0.0.0.0',
  '--api.port',
  String(env.VITEST_PORT),
];

const child = spawn(pnpmCmd, vitestArgs, {
  stdio: 'inherit',
  shell: false,
  env: { ...process.env },
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
