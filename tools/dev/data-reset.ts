#!/usr/bin/env tsx
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { config } from '#config';
import type { ServerAuth } from '#server/auth/auth';
import { createServerRuntime } from '#server/runtime';
import { STABLE_AUTH_USERS, createStableAuthUserSessionHeaders } from '../lib/stable-auth-users';
import type { StableAuthUser } from '../lib/stable-auth-users';

const FIXTURE_DIR = path.resolve('tests/fixtures');

interface CliOptions {
  fresh: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { fresh: false };
  for (const arg of argv) {
    if (arg === '--fresh') {
      options.fresh = true;
    } else {
      throw new Error(`Unknown argument: ${arg}. Usage: pnpm run dev:data-reset [--fresh]`);
    }
  }
  return options;
}

// Mirrors tools/dev/users.ts provisionDevUser: create, else verify by signing in.
async function provisionDevUser(auth: ServerAuth, user: StableAuthUser): Promise<void> {
  const response = await auth.createUser(user, new Headers());
  if (response.ok) {
    return;
  }
  try {
    await createStableAuthUserSessionHeaders(auth, user);
    return;
  } catch {
    // Fall through to actionable error.
  }
  throw new Error(`Failed to create or verify ${user.email}. Delete the existing debug user or auth DB.`);
}

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
  const options = parseArgs(process.argv.slice(2));
  const fixtureNames = await listFixtureNames();
  console.info(`Found ${fixtureNames.length} fixtures.${options.fresh ? ' (--fresh)' : ''}`);

  const runtime = createServerRuntime();
  try {
    await runtime.auth.ensureReady();
    for (const user of Object.values(STABLE_AUTH_USERS)) {
      await provisionDevUser(runtime.auth, user);
    }
    // Seeding wired up in later tasks.
  } finally {
    await runtime.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
