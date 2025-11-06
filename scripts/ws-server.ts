#!/usr/bin/env tsx
/* eslint-disable node/no-process-env -- script scaffolds env vars before spawning WS server */
import { spawn } from 'node:child_process';
import process from 'node:process';

import { env } from '../config/server.js';

process.env.HOST = env.HOST;
process.env.PORT = String(env.COLLAB_SERVER_PORT);

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(pnpmCmd, ['exec', 'y-websocket'], {
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
