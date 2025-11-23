#!/usr/bin/env tsx
import process from 'node:process';

import { ensureCollabServer } from './lib/collab-server';

try {
  await ensureCollabServer();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
