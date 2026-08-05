#!/usr/bin/env tsx
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { config } from '#config';
import { createServerRuntime } from '#server/runtime';
import { INTERNAL_SERVICE_HOST } from '#platform/net/origins';
import { readFixtureState } from '#tools/fixtures';
import { waitForPortOpen } from '../lib/net';
import { resetDevelopmentData } from './reset-development-data';

const FIXTURE_DIR = path.resolve('tests/fixtures');

async function listFixtureNames(): Promise<string[]> {
  const entries = await fs.readdir(FIXTURE_DIR);
  return entries
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.slice(0, -'.json'.length))
    .sort();
}

async function main(): Promise<void> {
  if (!config.isDev) {
    throw new Error('dev:data-reset only runs in development.');
  }
  if (process.argv.length > 2) {
    throw new Error('Usage: pnpm run dev:data-reset');
  }
  const collabReady = waitForPortOpen(INTERNAL_SERVICE_HOST, config.env.COLLAB_SERVER_PORT);
  const fixtureNames = await listFixtureNames();
  const fixtures = new Map(await Promise.all(
    fixtureNames.map(async (name) => [name, await readFixtureState(name)] as const),
  ));
  console.info(`Found ${fixtures.size} fixtures.`);

  const runtime = createServerRuntime();
  try {
    await runtime.auth.ensureReady();
    if (!(await collabReady)) {
      throw new Error(
        `Development collaboration service did not become ready on port ${config.env.COLLAB_SERVER_PORT}.`,
      );
    }
    const result = await resetDevelopmentData(runtime, fixtures);
    console.info(`Seeded ${result.documentCount} documents across ${result.userCount} users.`);
  } finally {
    await runtime.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
