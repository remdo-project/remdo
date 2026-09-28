#!/usr/bin/env tsx
import process from 'node:process';

import { demoAccount, resetDemoAccount } from './lib/demo-account';

const USAGE = 'Usage: pnpm hosted:demo-reset [origin], default https://remdo.com';

async function main(): Promise<void> {
  const [originArgument = 'https://remdo.com', ...extra] = process.argv.slice(2);
  if (extra.length > 0) {
    throw new Error(USAGE);
  }
  const origin = new URL(originArgument).origin;
  // eslint-disable-next-line node/no-process-env -- a deployment secret, absent from the development config schema.
  const password = process.env.REMDO_USER_PASSWORD;
  if (!password) {
    throw new Error('REMDO_USER_PASSWORD must hold the target service\'s generated user password.');
  }
  const account = demoAccount(origin, password);
  const { deleted, sharedRemaining } = await resetDemoAccount(origin, account);
  const remaining = sharedRemaining > 0 ? `; ${sharedRemaining} document(s) shared by others remain` : '';
  console.info(`Reset ${account.email}: deleted ${deleted} document(s), created 1 empty document${remaining}.`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
