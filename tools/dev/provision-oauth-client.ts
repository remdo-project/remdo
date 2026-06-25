#!/usr/bin/env tsx
import process from 'node:process';
import { config } from '#config';
import { REMDO_SERVER_OAUTH_SCOPES } from '#server/auth/auth';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import { createServerRuntime } from '#server/runtime';
import {
  STABLE_AUTH_USERS,
  createStableAuthUserSessionHeaders,
  provisionDevUsers,
} from '../lib/stable-auth-users';

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

async function provisionDevSourceOAuthClient(): Promise<void> {
  const homeOrigin = config.env.REMDO_DEV_HOME_ORIGIN.trim();
  if (!homeOrigin || new URL(config.env.AUTH_URL).origin === new URL(homeOrigin).origin) {
    return;
  }

  const clientId = readDevEnv(config.env.REMDO_DEV_OAUTH_CLIENT_ID, 'REMDO_DEV_OAUTH_CLIENT_ID');
  const clientSecret = readDevEnv(config.env.REMDO_DEV_OAUTH_CLIENT_SECRET, 'REMDO_DEV_OAUTH_CLIENT_SECRET');
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
    throw new Error('Usage: pnpm run dev:oauth-client');
  }
  if (!config.isDev) {
    throw new Error('dev:oauth-client only runs in development.');
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
  await provisionDevSourceOAuthClient();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
