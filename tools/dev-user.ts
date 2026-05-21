#!/usr/bin/env tsx
import crypto from 'node:crypto';
import process from 'node:process';
import { config } from '#config';
import type { ServerAuth } from '@/server/auth/auth';
import { createServerAuth } from '@/server/auth/auth';

const DEV_USER = {
  email: 'dev@example.test',
  name: 'Development User',
} as const;

function createDevPassword(): string {
  const seed = config.env.AUTH_SECRET || config.env.ADMIN_SECRET || 'remdo-dev-user';
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  return hash.slice(0, 24);
}

function signInDevUser(auth: ServerAuth, password: string): Promise<Response> {
  return auth.auth.handler(new Request(new URL('/api/auth/sign-in/email', config.env.AUTH_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: DEV_USER.email,
      password,
    }),
  }));
}

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new Error('Usage: pnpm run dev:user');
  }
  if (!config.isDev) {
    throw new Error('dev:user only runs in development.');
  }

  const auth = createServerAuth();
  const password = createDevPassword();
  try {
    await auth.ensureReady();
    const response = await auth.createUser({ ...DEV_USER, password }, new Headers());
    if (!response.ok && !await signInDevUser(auth, password).then((signInResponse) => signInResponse.ok)) {
      throw new Error(`Failed to create or verify ${DEV_USER.email}. Delete the existing debug user or auth DB.`);
    }
  } finally {
    auth.close();
  }

  console.info(`Email: ${DEV_USER.email}`);
  console.info(`Password: ${password}`);
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
