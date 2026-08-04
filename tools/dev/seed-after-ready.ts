#!/usr/bin/env tsx
import process from 'node:process';

import { config } from '#config';
import { INTERNAL_SERVICE_HOST } from '#platform/net/origins';
import { isPortOpen } from '../lib/net';
import { runPnpm } from '../lib/process';
import { waitForDevelopmentCollaboration } from './seed-after-ready-lib';

async function main(): Promise<void> {
  await waitForDevelopmentCollaboration({
    collabReady: () => isPortOpen(INTERNAL_SERVICE_HOST, config.env.COLLAB_SERVER_PORT),
    port: config.env.COLLAB_SERVER_PORT,
  });
  await runPnpm(['run', 'dev:data-reset']);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
