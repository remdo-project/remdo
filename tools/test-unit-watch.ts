#!/usr/bin/env tsx
// Runs Vitest with dynamically calculated API port from the shared config module.
// Required because Vitest doesn't support runtime port configuration.

import { config } from '#config';
import { spawnPnpm } from './lib/process';

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

spawnPnpm(vitestArgs);
