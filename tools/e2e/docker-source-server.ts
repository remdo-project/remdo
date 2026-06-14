#!/usr/bin/env tsx
import { once } from 'node:events';
import process from 'node:process';

import { config } from '#config';
import { ensureCollabServer } from '#tools/collab-server-helper';
import { spawnPnpm } from '#tools/process';

async function main(): Promise<void> {
  const stopCollab = await ensureCollabServer({ reuseExisting: false });
  const vite = spawnPnpm(
    ['exec', 'vite', '--host', config.env.HOST],
    { forwardExit: false, stdio: 'inherit' },
  );

  const stop = async () => {
    if (vite.exitCode === null && vite.signalCode === null) {
      vite.kill('SIGTERM');
    }
    await stopCollab();
  };

  process.once('SIGINT', () => {
    void stop().finally(() => {
      process.exit(130);
    });
  });
  process.once('SIGTERM', () => {
    void stop().finally(() => {
      process.exit(143);
    });
  });

  const [code, signal] = await once(vite, 'exit') as [number | null, NodeJS.Signals | null];
  await stopCollab();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 0;
}

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
