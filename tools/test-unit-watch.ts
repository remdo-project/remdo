#!/usr/bin/env tsx
/* eslint-disable node/no-process-env -- script derives env vars for Vitest watch mode */
// Runs Vitest with dynamically calculated API port from the shared config module.
// Required because Vitest doesn't support runtime port configuration.
import process from 'node:process';

import { config } from '#config';
import { spawnPnpm } from './lib/process';

process.env.NODE_ENV ??= 'test';

const vitestArgs = [
  'exec',
  'vitest',
  '--watch',
  '--ui',
  '--api.host',
  '0.0.0.0',
  '--api.port',
  String(config.env.VITEST_PORT),
];

spawnPnpm(vitestArgs, process.env);
