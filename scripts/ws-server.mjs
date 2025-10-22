#!/usr/bin/env node
/* eslint-disable node/no-process-env -- script scaffolds env vars before spawning WS server */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);
const jiti = require('jiti')(import.meta.url);

const { env } = jiti('../config/env.server.ts');

process.env.HOST = env.HOST;
process.env.PORT = String(env.COLLAB_SERVER_PORT);

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(pnpmCmd, ['exec', 'y-websocket'], {
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
