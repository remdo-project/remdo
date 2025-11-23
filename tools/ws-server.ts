#!/usr/bin/env tsx
/* eslint-disable node/no-process-env -- script scaffolds env vars before spawning WS server */
import process from 'node:process';

import { config } from '#config';
import { spawnPnpm } from './lib/process';

process.env.HOST = config.env.HOST;

spawnPnpm([
  'exec',
  'y-sweet',
  'serve',
  '--host',
  config.env.HOST,
  '--port',
  String(config.env.COLLAB_SERVER_PORT),
]);
