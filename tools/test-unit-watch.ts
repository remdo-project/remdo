#!/usr/bin/env tsx
// Runs Vitest with dynamically calculated API port from the shared config module.
// Required because Vitest doesn't support runtime port configuration.

import { config } from '#config';
import { setTmpDir } from '#config/vitest/tmpdir';
import { spawnPnpm } from './lib/process';

// Vitest stores its transformed modules under os.tmpdir(); when the host cleans
// /tmp during a long watch session, the cache disappears and watch mode
// crashes with ENOENT. Point temp vars at a repo-local directory so the cache
// survives for the lifetime of the process.
setTmpDir();

const vitestArgs = [
  'exec',
  'vitest',
  '--watch',
  '--ui',
  '--api.host',
  config.env.HOST,
  '--api.port',
  String(config.env.VITEST_PORT),
];

spawnPnpm(vitestArgs);
