#!/usr/bin/env tsx
import process from 'node:process';
import { config } from '#config';
import type { ServerAuth } from '@/server/auth/auth';
import { createServerAuth } from '@/server/auth/auth';
import { STABLE_AUTH_USERS } from './lib/stable-auth-users';

type StableAuthUser = (typeof STABLE_AUTH_USERS)[keyof typeof STABLE_AUTH_USERS];

function signInDevUser(auth: ServerAuth, user: StableAuthUser): Promise<Response> {
  return auth.auth.handler(new Request(new URL('/api/auth/sign-in/email', config.env.AUTH_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
    }),
  }));
}

async function provisionDevUser(auth: ServerAuth, user: StableAuthUser): Promise<void> {
  const response = await auth.createUser(user, new Headers());
  if (response.ok || await signInDevUser(auth, user).then((signInResponse) => signInResponse.ok)) {
    return;
  }

  throw new Error(`Failed to create or verify ${user.email}. Delete the existing debug user or auth DB.`);
}

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new Error('Usage: pnpm run dev:users');
  }
  if (!config.isDev) {
    throw new Error('dev:users only runs in development.');
  }

  const auth = createServerAuth();
  try {
    await auth.ensureReady();
    for (const user of Object.values(STABLE_AUTH_USERS)) {
      await provisionDevUser(auth, user);
    }
  } finally {
    auth.close();
  }

  for (const [label, user] of Object.entries(STABLE_AUTH_USERS)) {
    console.info(`${label}:`);
    console.info(`  Email: ${user.email}`);
    console.info(`  Password: ${user.password}`);
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
