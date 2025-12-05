#!/usr/bin/env tsx
import { config } from '#config';
import { spawnPnpm } from './lib/process';

const host = config.env.HOST;
const port = config.env.PLAYWRIGHT_UI_PORT;

spawnPnpm([
  'exec',
  'playwright',
  'test',
  '--ui',
  '--ui-host',
  host,
  '--ui-port',
  String(port),
]);
