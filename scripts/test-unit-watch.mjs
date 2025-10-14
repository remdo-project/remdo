#!/usr/bin/env node
// Runs Vitest with dynamically calculated API port from env.server.ts.
// Required because Vitest doesn't support runtime port configuration.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);
const jiti = require('jiti')(import.meta.url);

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

const { env } = jiti('../config/env.server.ts');

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const vitestArgs = [
  'exec',
  'vitest',
  '--watch',
  '--ui',
  '--coverage',
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
