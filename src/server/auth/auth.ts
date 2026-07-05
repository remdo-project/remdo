import {
  oauthProvider,
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from '@better-auth/oauth-provider';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import type Database from 'better-sqlite3';
import { admin, genericOAuth, jwt } from 'better-auth/plugins';
import type { ExpressionBuilder } from 'kysely';
import { config } from '#config';
import { deriveAuthTrustedOrigins } from '#config/env/auth-origins';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import type { RemdoDatabase } from '#server/db/schema';
import type { StoredSourceServer } from '#server/remdo-oauth/source-server-store';
import { readSourceServersSync } from '#server/remdo-oauth/source-server-store';

interface CreateServerAuthOptions {
  allowSignup?: boolean;
  baseURL?: string;
  database: SqliteServerDatabaseClient;
  sourceServers?: readonly StoredSourceServer[];
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

// Deliberate mirror of Better Auth's `validateIssuerUrl` (in
// @better-auth/oauth-provider): it hard-codes `if (protocol !== 'https:' &&
// !isLoopbackHost(host)) protocol = 'https:'` when a source advertises its
// issuer, and that upgrade is not configurable. The home's requireIssuerValidation
// compares against this value, so we must classify loopback the same way or a
// token is rejected as an issuer mismatch. Keep this in sync with upstream's
// `isLoopbackHost`. Preferred long-term fix (see docs/todo.md): reject
// non-loopback http sources at add time so every stored origin is one upstream
// leaves alone, making `issuer: server.baseUrl` correct and this mirror deletable.
// Matches the 127.0.0.0/8 loopback block by shape (four numeric octets, first
// 127), not by textual prefix — `127.example.com` is a public DNS name, not
// loopback, and must not skip the https upgrade.
const IPV4_LOOPBACK_PATTERN = /^127(?:\.\d{1,3}){3}$/u;

function isLoopbackForDevScheme(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || IPV4_LOOPBACK_PATTERN.test(hostname);
}

export function normalizeSourceIssuer(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    // url.hostname keeps the brackets for IPv6 (e.g. `[::1]`); strip them so the
    // `::1` loopback check matches, mirroring Better Auth's host normalization.
    const hostname = url.hostname.replace(/^\[|\]$/gu, '');
    if (url.protocol !== 'https:' && !isLoopbackForDevScheme(hostname)) {
      url.protocol = 'https:';
    }
    return url.origin;
  } catch {
    return baseUrl;
  }
}

interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

function createBetterAuthInstance({
  allowSignup,
  baseURL,
  database,
  sourceServers,
  oauthClientCredentials,
  secret,
  trustedOrigins,
}: {
  allowSignup: boolean;
  baseURL: string;
  database: Database.Database;
  sourceServers: readonly StoredSourceServer[];
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
      admin({
        defaultRole: 'user',
        adminRoles: ['admin'],
      }),
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
        scopes: [...REMDO_SERVER_OAUTH_SCOPES],
        // A public server acts as a source: a home self-registers its OAuth client
        // by a server-to-server call (no source session), so the source must accept
        // UNAUTHENTICATED dynamic registration. The registered client is public
        // (token_endpoint_auth_method: "none", PKCE) and redirect-locked, so it
        // grants no access on its own — only a source user consenting does. Both
        // flags gate on allowSignup: a private (non-public) source refuses
        // registration outright. (allowUnauthenticatedClientRegistration is the
        // supported option for this today; its eventual replacement is CIMD, which
        // does not fit RemDo's private-home topology — see docs/access-model.md.)
        allowDynamicClientRegistration: allowSignup,
        allowUnauthenticatedClientRegistration: allowSignup,
        clientRegistrationDefaultScopes: [...REMDO_SERVER_OAUTH_SCOPES],
        rateLimit: {
          register: { window: 60, max: 5 },
        },
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
        // Build a provider only for sources whose OAuth client has been issued
        // (the home registered on that source). A source added but not yet
        // registered has no credentials and no provider; it becomes usable at the
        // next auth-instance build after registration persists its credentials.
        config: sourceServers.flatMap((server) => {
          if (!server.credentials) {
            return [];
          }
          return [{
            providerId: server.id,
            authorizationUrl: `${server.baseUrl}/api/auth/oauth2/authorize`,
            tokenUrl: `${server.baseUrl}/api/auth/oauth2/token`,
            issuer: normalizeSourceIssuer(server.baseUrl),
            requireIssuerValidation: true,
            clientId: server.credentials.clientId,
            // Public client: no secret; PKCE authenticates the token exchange.
            scopes: [...REMDO_SERVER_OAUTH_SCOPES],
            accessType: 'offline',
            pkce: true,
            authorizationUrlParams: {
              resource: server.baseUrl,
            },
          }];
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
  // The canonical public origin this auth instance was built with (may be a
  // per-instance override, not the config singleton). Routes that advertise this
  // home's own URL (e.g. cross-server registration) must use this, not
  // config.env.AUTH_URL, or an overridden instance sends the wrong origin.
  baseURL: string;
  sourceServers: readonly StoredSourceServer[];
  createUser: (user: CreateAuthUserInput, headers: Headers) => Promise<Response>;
  ensureReady: () => Promise<void>;
  findUserByEmail: (email: string) => Promise<ServerAuthUser | null>;
  getUserRole: (userId: string) => Promise<string | null>;
  grantAdminRole: (userId: string) => Promise<void>;
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
  sourceServers = readSourceServersSync(database),
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
    sourceServers,
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
        sourceServers,
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
    baseURL,
    sourceServers,
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
    async getUserRole(userId) {
      const row = await database.db
        .selectFrom('user')
        .select('role')
        .where('id', '=', userId)
        .limit(1)
        .executeTakeFirst();
      return row?.role ?? null;
    },
    async grantAdminRole(userId) {
      // Direct write rather than the admin plugin's setRole: granting the FIRST
      // admin has no existing admin caller to authorize setRole, and enrollment
      // is gated by ADMIN_SECRET at the route, not by an admin session.
      await database.db
        .updateTable('user')
        .set({ role: 'admin' })
        .where('id', '=', userId)
        .execute();
    },
    getSession(headers) {
      return auth.api.getSession({ headers });
    },
    async getLinkedRemdoServerAccessToken(userId, serverId) {
      if (!sourceServers.some((server) => server.id === serverId)) {
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
          .filter((providerId) => sourceServers.some((server) => server.id === providerId)),
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

export interface SwappableServerAuth {
  // A ServerAuth-shaped proxy that always delegates to the current instance, so
  // route handlers holding this reference transparently see a rebuilt auth.
  auth: ServerAuth;
  // Rebuilds the underlying auth from the current DB source list, so a source
  // registered this session becomes a usable OAuth provider without a restart.
  rebuild: () => void;
}

export function createSwappableServerAuth(
  options: CreateServerAuthOptions,
): SwappableServerAuth {
  let current = createServerAuth(options);
  // The Proxy target is only a structural placeholder; every access reads the
  // live `current` instance (updated by rebuild()), not the target.
  const proxy = new Proxy(current, {
    get(_target, property) {
      const value = current[property as keyof ServerAuth];
      return typeof value === 'function' ? value.bind(current) : value;
    },
  });
  return {
    auth: proxy,
    rebuild() {
      current = createServerAuth({
        ...options,
        sourceServers: readSourceServersSync(options.database),
      });
    },
  };
}
