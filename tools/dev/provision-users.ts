#!/usr/bin/env tsx
import process from 'node:process';
import { config } from '#config';
import { createServerRuntime } from '#server/runtime';
import {
  STABLE_AUTH_USERS,
  provisionDevUsers,
} from '../lib/stable-auth-users';

// Provisions the stable dev users (Alice/Bob) on a server. Source-server OAuth
// clients are no longer created out-of-band: a home registers itself on a source
// through the browser (docs/access-model.md#registering-a-home-on-a-source), so
// this command only seeds the users the linking flows sign in as.
async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new Error('Usage: pnpm run dev:users');
  }
  if (!config.isDev) {
    throw new Error('dev:users only runs in development.');
  }

  const runtime = createServerRuntime();
  try {
    await runtime.auth.ensureReady();
    await provisionDevUsers(runtime.auth);
  } finally {
    await runtime.close();
  }

  for (const [label, user] of Object.entries(STABLE_AUTH_USERS)) {
    console.info(`${label}:`);
    console.info(`  Email: ${user.email}`);
    // Public dev fixture credentials; this command is dev-only and prints them intentionally.
    // The CodeQL js/clear-text-logging alert is dismissed as a false positive in
    // code scanning (default setup ignores inline // codeql[...] suppressions).
    console.info(`  Password: ${user.password}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
