#!/usr/bin/env tsx
import { config } from '#config';
import { spawnPnpm } from './lib/process';

const wsEnv = {
  HOST: config.env.HOST,
};

spawnPnpm([
  'exec',
  'y-sweet',
  'serve',
  '--host',
  config.env.HOST,
  '--port',
  String(config.env.COLLAB_SERVER_PORT),
], wsEnv);
