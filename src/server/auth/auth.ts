import os from 'node:os';
import {
  oauthProvider,
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from '@better-auth/oauth-provider';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import type Database from 'better-sqlite3';
import { genericOAuth, jwt } from 'better-auth/plugins';
import { config } from '#config';
import type { SqliteServerDatabaseClient } from '@/server/db/client';
import type { LinkableRemdoServer } from '@/server/remdo-oauth/config';
import { getLinkableRemdoServers } from '@/server/remdo-oauth/config';

interface CreateServerAuthOptions {
  allowSignup?: boolean;
  baseURL?: string;
  database: SqliteServerDatabaseClient;
  linkableRemdoServers?: readonly LinkableRemdoServer[];
  oauthClientCredentials?: OAuthClientCredentials;
  secret?: string;
}

export const REMDO_SERVER_OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
] as const;

interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

function appendOrigin(origins: string[], origin: string): void {
  if (!origins.includes(origin)) {
    origins.push(origin);
  }
}

export function createAuthTrustedOrigins(
  baseURL: string,
  options: { mode?: string; machineHostname?: string } = {},
): string[] {
  const baseOrigin = new URL(baseURL).origin;
  const origins = [baseOrigin];
  const mode = options.mode ?? config.runtime.mode;
  if (mode === 'production') {
    return origins;
  }

  const url = new URL(baseOrigin);
  const port = url.port;
  if (!port) {
    return origins;
  }

  appendOrigin(origins, `${url.protocol}//localhost:${port}`);
  appendOrigin(origins, `${url.protocol}//127.0.0.1:${port}`);
  const hostname = options.machineHostname ?? os.hostname();
  if (hostname) {
    appendOrigin(origins, `${url.protocol}//${hostname}:${port}`);
  }
  return origins;
}

function createBetterAuthInstance({
  allowSignup,
  baseURL,
  database,
  linkableRemdoServers,
  oauthClientCredentials,
  secret,
}: {
  allowSignup: boolean;
  baseURL: string;
  database: Database.Database;
  linkableRemdoServers: readonly LinkableRemdoServer[];
  oauthClientCredentials?: OAuthClientCredentials;
  secret: string;
}) {
  return betterAuth({
    basePath: '/api/auth',
    baseURL,
    trustedOrigins: createAuthTrustedOrigins(baseURL),
    secret,
    logger: config.isProd ? undefined : { level: 'error' },
    database,
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowSignup,
    },
    plugins: [
      jwt({
        disableSettingJwtHeader: true,
        jwt: {
          issuer: baseURL,
          audience: baseURL,
        },
      }),
      oauthProvider({
        consentPage: '/oauth/consent',
        loginPage: '/login',
        ...(oauthClientCredentials
          ? {
              generateClientId: () => oauthClientCredentials.clientId,
              generateClientSecret: () => oauthClientCredentials.clientSecret,
            }
          : {}),
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
      }),
      genericOAuth({
        config: linkableRemdoServers.map((server) => {
          const tokenBaseUrl = server.tokenBaseUrl ?? server.baseUrl;
          return {
            providerId: server.id,
            authorizationUrl: `${server.baseUrl}/api/auth/oauth2/authorize`,
            tokenUrl: `${tokenBaseUrl}/api/auth/oauth2/token`,
            issuer: server.baseUrl,
            requireIssuerValidation: true,
            clientId: server.clientId,
            clientSecret: server.clientSecret,
            scopes: [...REMDO_SERVER_OAUTH_SCOPES],
            accessType: 'offline',
            pkce: true,
            authorizationUrlParams: {
              resource: server.baseUrl,
            },
          };
        }),
      }),
    ],
  });
}

type BetterAuthInstance = ReturnType<typeof createBetterAuthInstance>;

export interface CreateAuthUserInput {
  email: string;
  name: string;
  password: string;
}

export interface ServerAuth {
  allowSignup: boolean;
  auth: BetterAuthInstance;
  linkableRemdoServers: readonly LinkableRemdoServer[];
  createUser: (user: CreateAuthUserInput, headers: Headers) => Promise<Response>;
  ensureReady: () => Promise<void>;
  handleAuthServerMetadata: (request: Request) => Promise<Response>;
  handleOpenIdConfigMetadata: (request: Request) => Promise<Response>;
  getSession: (headers: Headers) => Promise<Awaited<ReturnType<BetterAuthInstance['api']['getSession']>>>;
  getUserCount: () => Promise<number>;
  listLinkedRemdoServerIds: (headers: Headers) => Promise<Set<string>>;
}

export function createServerAuth({
  allowSignup = config.env.ALLOW_SIGNUP,
  baseURL = config.env.AUTH_URL,
  database,
  linkableRemdoServers = getLinkableRemdoServers(),
  oauthClientCredentials,
  secret = config.env.AUTH_SECRET,
}: CreateServerAuthOptions): ServerAuth {
  if (!baseURL) {
    throw new Error('A canonical public URL is required for auth.');
  }

  if (!secret) {
    throw new Error('AUTH_SECRET is required for auth.');
  }

  const auth = createBetterAuthInstance({
    allowSignup,
    baseURL,
    database: database.sqlite,
    linkableRemdoServers,
    oauthClientCredentials,
    secret,
  });
  const userProvisioningAuth = allowSignup
    ? auth
    : createBetterAuthInstance({
        allowSignup: true,
        baseURL,
        database: database.sqlite,
        linkableRemdoServers,
        oauthClientCredentials,
        secret,
      });
  const handleAuthServerMetadata = oauthProviderAuthServerMetadata(auth);
  const handleOpenIdConfigMetadata = oauthProviderOpenIdConfigMetadata(auth);

  let readyPromise: Promise<void> | null = null;

  return {
    allowSignup,
    auth,
    linkableRemdoServers,
    createUser(user, headers) {
      return userProvisioningAuth.api.signUpEmail({
        body: user,
        headers,
        asResponse: true,
      });
    },
    async ensureReady() {
      if (!readyPromise) {
        readyPromise = (async () => {
          const { runMigrations } = await getMigrations(auth.options);
          await runMigrations();
        })().catch((error) => {
          readyPromise = null;
          throw error;
        });
      }

      return readyPromise;
    },
    getSession(headers) {
      return auth.api.getSession({ headers });
    },
    async getUserCount() {
      const row = await database.db
        .selectFrom('user')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
      return row.count;
    },
    handleAuthServerMetadata,
    handleOpenIdConfigMetadata,
    async listLinkedRemdoServerIds(headers) {
      const accounts = await auth.api.listUserAccounts({ headers });
      return new Set(
        accounts
          .map((account) => account.providerId)
          .filter((providerId) => linkableRemdoServers.some((server) => server.id === providerId)),
      );
    },
  };
}
