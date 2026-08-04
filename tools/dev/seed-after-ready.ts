#!/usr/bin/env tsx
import process from 'node:process';

import { config } from '#config';
import { INTERNAL_SERVICE_HOST } from '#platform/net/origins';
import { waitForPortOpen } from '../lib/net';
import { runPnpm } from '../lib/process';

async function main(): Promise<void> {
  const port = config.env.COLLAB_SERVER_PORT;
  if (!(await waitForPortOpen(INTERNAL_SERVICE_HOST, port))) {
    throw new Error(`Development collaboration service did not become ready on port ${port}.`);
  }
  await runPnpm(['run', 'dev:data-reset']);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
