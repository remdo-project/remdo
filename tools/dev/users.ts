#!/usr/bin/env tsx
import process from 'node:process';
import { config } from '#config';
import { REMDO_SERVER_OAUTH_SCOPES } from '@/server/auth/auth';
import type { ServerAuth } from '@/server/auth/auth';
import type { SqliteServerDatabaseClient } from '@/server/db/client';
import { createServerRuntime } from '@/server/runtime';
import { STABLE_AUTH_USERS, createStableAuthUserSessionHeaders } from '../lib/stable-auth-users';
import type { StableAuthUser } from '../lib/stable-auth-users';

function readDevEnv(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} is required.`);
  }
  return trimmed;
}

async function oauthClientExists(database: SqliteServerDatabaseClient, clientId: string): Promise<boolean> {
  const row = await database.db
    .selectFrom('oauthClient')
    .select('clientId')
    .where('clientId', '=', clientId)
    .executeTakeFirst();
  return Boolean(row);
}

async function provisionDevUser(auth: ServerAuth, user: StableAuthUser): Promise<void> {
  const response = await auth.createUser(user, new Headers());
  if (response.ok) {
    return;
  }
  try {
    await createStableAuthUserSessionHeaders(auth, user);
    return;
  } catch {
    // Fall through to the existing actionable error.
  }

  throw new Error(`Failed to create or verify ${user.email}. Delete the existing debug user or auth DB.`);
}

async function provisionDevSourceOAuthClient(): Promise<void> {
  if (new URL(config.env.AUTH_URL).origin === new URL(config.env.REMDO_DEV_HOME_ORIGIN).origin) {
    return;
  }

  const clientId = readDevEnv(config.env.REMDO_DEV_OAUTH_CLIENT_ID, 'REMDO_DEV_OAUTH_CLIENT_ID');
  const clientSecret = readDevEnv(config.env.REMDO_DEV_OAUTH_CLIENT_SECRET, 'REMDO_DEV_OAUTH_CLIENT_SECRET');
  const homeOrigin = readDevEnv(config.env.REMDO_DEV_HOME_ORIGIN, 'REMDO_DEV_HOME_ORIGIN');
  const redirectUri = `${homeOrigin}/api/auth/oauth2/callback/source`;
  const clientConfig = {
    client_name: 'RemDo dev Docker home',
    grant_types: ['authorization_code', 'refresh_token'] as ('authorization_code' | 'refresh_token')[],
    redirect_uris: [redirectUri],
    response_types: ['code'] as 'code'[],
    scope: REMDO_SERVER_OAUTH_SCOPES.join(' '),
    skip_consent: true,
  };
  const runtime = createServerRuntime({ oauthClientCredentials: { clientId, clientSecret } });
  const auth = runtime.auth;

  try {
    await auth.ensureReady();
    const headers = await createStableAuthUserSessionHeaders(auth, STABLE_AUTH_USERS.alice);
    if (await oauthClientExists(runtime.database, clientId)) {
      await auth.auth.api.adminUpdateOAuthClient({
        body: {
          client_id: clientId,
          update: clientConfig,
        },
        headers,
      });
      await auth.auth.api.rotateClientSecret({
        body: {
          client_id: clientId,
        },
        headers,
      });
    } else {
      await auth.auth.api.adminCreateOAuthClient({
        body: {
          ...clientConfig,
          require_pkce: true,
          token_endpoint_auth_method: 'client_secret_basic',
        },
        headers,
      });
    }
  } finally {
    await runtime.close();
  }

  console.info(`source OAuth client: ${redirectUri}`);
}

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new Error('Usage: pnpm run dev:users');
  }
  if (!config.isDev) {
    throw new Error('dev:users only runs in development.');
  }

  const runtime = createServerRuntime();
  const auth = runtime.auth;
  try {
    await auth.ensureReady();
    for (const user of Object.values(STABLE_AUTH_USERS)) {
      await provisionDevUser(auth, user);
    }
  } finally {
    await runtime.close();
  }

  for (const [label, user] of Object.entries(STABLE_AUTH_USERS)) {
    console.info(`${label}:`);
    console.info(`  Email: ${user.email}`);
    console.info(`  Password: ${user.password}`);
  }
  await provisionDevSourceOAuthClient();
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
