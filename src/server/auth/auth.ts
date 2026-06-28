import {
  oauthProvider,
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from '@better-auth/oauth-provider';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import type Database from 'better-sqlite3';
import { genericOAuth, jwt } from 'better-auth/plugins';
import type { ExpressionBuilder } from 'kysely';
import { config } from '#config';
import { deriveAuthTrustedOrigins } from '#config/env/auth-origins';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import type { RemdoDatabase } from '#server/db/schema';
import type { LinkableRemdoServer } from '#server/remdo-oauth/config';
import { getLinkableRemdoServers } from '#server/remdo-oauth/config';

interface CreateServerAuthOptions {
  allowSignup?: boolean;
  baseURL?: string;
  database: SqliteServerDatabaseClient;
  linkableRemdoServers?: readonly LinkableRemdoServer[];
  oauthClientCredentials?: OAuthClientCredentials;
  secret?: string;
  trustedOrigins?: readonly string[];
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

function createBetterAuthInstance({
  allowSignup,
  baseURL,
  database,
  linkableRemdoServers,
  oauthClientCredentials,
  secret,
  trustedOrigins,
}: {
  allowSignup: boolean;
  baseURL: string;
  database: Database.Database;
  linkableRemdoServers: readonly LinkableRemdoServer[];
  oauthClientCredentials?: OAuthClientCredentials;
  secret: string;
  trustedOrigins: readonly string[];
}) {
  return betterAuth({
    basePath: '/api/auth',
    baseURL,
    trustedOrigins: [...trustedOrigins],
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

export interface ServerAuthUser {
  email: string;
  id: string;
  name: string | null;
}

export interface ServerAuth {
  allowSignup: boolean;
  auth: BetterAuthInstance;
  linkableRemdoServers: readonly LinkableRemdoServer[];
  createUser: (user: CreateAuthUserInput, headers: Headers) => Promise<Response>;
  ensureReady: () => Promise<void>;
  findUserByEmail: (email: string) => Promise<ServerAuthUser | null>;
  handleAuthServerMetadata: (request: Request) => Promise<Response>;
  handleOpenIdConfigMetadata: (request: Request) => Promise<Response>;
  getSession: (headers: Headers) => Promise<Awaited<ReturnType<BetterAuthInstance['api']['getSession']>>>;
  getLinkedRemdoServerAccessToken: (userId: string, serverId: string) => Promise<string | null>;
  getUserCount: () => Promise<number>;
  listUsersByIds: (userIds: readonly string[]) => Promise<ServerAuthUser[]>;
  listLinkedRemdoServerIds: (headers: Headers) => Promise<Set<string>>;
  resolveBearerUser: (authorization: string | null) => Promise<ServerAuthUser | null>;
}

export function createServerAuth({
  allowSignup = config.env.ALLOW_SIGNUP,
  baseURL = config.env.AUTH_URL,
  database,
  linkableRemdoServers = getLinkableRemdoServers(),
  oauthClientCredentials,
  secret = config.env.AUTH_SECRET,
  trustedOrigins,
}: CreateServerAuthOptions): ServerAuth {
  if (!baseURL) {
    throw new Error('A canonical public URL is required for auth.');
  }

  if (!secret) {
    throw new Error('AUTH_SECRET is required for auth.');
  }

  // Default trusted origins are derived from THIS instance's baseURL (not the
  // config singleton), so an overridden baseURL still trusts its own origin.
  const resolvedTrustedOrigins = trustedOrigins ?? deriveAuthTrustedOrigins({
    baseURL,
    isProduction: config.isProd,
    hostname: config.server.MACHINE_HOSTNAME,
    previewPort: config.env.PREVIEW_PORT,
  });

  const auth = createBetterAuthInstance({
    allowSignup,
    baseURL,
    database: database.sqlite,
    linkableRemdoServers,
    oauthClientCredentials,
    secret,
    trustedOrigins: resolvedTrustedOrigins,
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
        trustedOrigins: resolvedTrustedOrigins,
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
    async findUserByEmail(email) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        return null;
      }
      const row = await database.db
        .selectFrom('user')
        .select(['email', 'id', 'name'])
        .where('email', '=', normalizedEmail)
        .limit(1)
        .executeTakeFirst();
      return row ?? null;
    },
    getSession(headers) {
      return auth.api.getSession({ headers });
    },
    async getLinkedRemdoServerAccessToken(userId, serverId) {
      if (!linkableRemdoServers.some((server) => server.id === serverId)) {
        return null;
      }
      try {
        const token = await auth.api.getAccessToken({
          body: {
            providerId: serverId,
            userId,
          },
        });
        return token.accessToken;
      } catch {
        return null;
      }
    },
    async getUserCount() {
      const row = await database.db
        .selectFrom('user')
        .select((eb: ExpressionBuilder<RemdoDatabase, 'user'>) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
      return row.count;
    },
    handleAuthServerMetadata,
    handleOpenIdConfigMetadata,
    async listUsersByIds(userIds) {
      const uniqueUserIds = [...new Set(userIds)];
      if (uniqueUserIds.length === 0) {
        return [];
      }
      return database.db
        .selectFrom('user')
        .select(['email', 'id', 'name'])
        .where('id', 'in', uniqueUserIds)
        .execute();
    },
    async listLinkedRemdoServerIds(headers) {
      const accounts = await auth.api.listUserAccounts({ headers });
      return new Set(
        accounts
          .map((account) => account.providerId)
          .filter((providerId) => linkableRemdoServers.some((server) => server.id === providerId)),
      );
    },
    async resolveBearerUser(authorization) {
      if (!authorization?.startsWith('Bearer ')) {
        return null;
      }
      try {
        const response = await auth.handler(new Request(new URL('/api/auth/oauth2/userinfo', baseURL), {
          headers: new Headers({ authorization }),
        }));
        if (!response.ok) {
          return null;
        }
        const userInfo = await response.json() as {
          email?: string | null;
          name?: string | null;
          sub?: string;
        };
        if (!userInfo.sub) {
          return null;
        }
        return {
          email: userInfo.email ?? '',
          id: userInfo.sub,
          name: userInfo.name ?? null,
        };
      } catch {
        return null;
      }
    },
  };
}
