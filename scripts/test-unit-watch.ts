#!/usr/bin/env node
/* eslint-disable node/no-process-env -- script derives env vars for Vitest watch mode */
// Runs Vitest with dynamically calculated API port from config/server.ts.
// Required because Vitest doesn't support runtime port configuration.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);
const jiti = require('jiti')(import.meta.url);

process.env.NODE_ENV ??= 'test';

const { env } = jiti('../config/server.ts');

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
