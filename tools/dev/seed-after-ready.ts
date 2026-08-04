#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { config } from '#config';
import { isPortOpen } from '../lib/net';
import { waitForDevelopmentCollaboration } from './seed-after-ready-lib';

async function main(): Promise<void> {
  await waitForDevelopmentCollaboration({
    collabReady: () => isPortOpen('127.0.0.1', config.env.COLLAB_SERVER_PORT),
    port: config.env.COLLAB_SERVER_PORT,
  });
  const result = spawnSync('pnpm', ['run', 'dev:data-reset'], {
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`dev:data-reset exited with status ${String(result.status)}.`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
