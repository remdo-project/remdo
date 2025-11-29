#!/usr/bin/env tsx
// Launches Vitest Preview with ports/env resolved through the shared config module.
import process from 'node:process';

import { config } from '#config';
import { setTmpDir } from '#config/vitest/tmpdir';
import { spawnPnpm } from './lib/process';

const previewEnv = {
  NODE_ENV: process.env.NODE_ENV ?? 'test',
  HOST: config.env.HOST,
  PORT: String(config.env.VITEST_PREVIEW_PORT),
  VITEST_PREVIEW: 'true',
};

setTmpDir();

spawnPnpm(['exec', 'vitest-preview'], { env: previewEnv });
