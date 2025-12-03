#!/usr/bin/env tsx
import { once } from 'node:events';
import process from 'node:process';

import type { ChildProcess } from 'node:child_process';

import { spawnPnpm } from './lib/process';

async function main() {
  let child: ChildProcess | undefined;
  let cleanedUp = false;

  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  };

  child = spawnPnpm(['run', 'dev:web'], {
    forwardExit: false,
  });

  const teardownSignals = ['SIGINT', 'SIGTERM', 'exit'] as const;
  for (const signal of teardownSignals) {
    process.on(signal, () => {
      // Fire and forget; Playwright waits on the port, not this promise.
      void cleanup();
    });
  }

  const [code] = await once(child, 'close');
  await cleanup();
  process.exit(typeof code === 'number' ? code : 0);
}

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
