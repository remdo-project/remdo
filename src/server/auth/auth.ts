import {
  oauthProvider,
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from '@better-auth/oauth-provider';
import { isLoopbackHost } from '@better-auth/core/utils/host';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import type Database from 'better-sqlite3';
import { admin, genericOAuth, jwt } from 'better-auth/plugins';
import type { GenericOAuthConfig } from 'better-auth/plugins';
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

// Better Auth upgrades non-loopback HTTP issuers to HTTPS. The home's callback
// issuer guard must normalize with the same exported host classifier or it can
// reject a valid callback. Preferred long-term fix (see
// docs/access-model.md#future):
// reject non-loopback http sources at add time so every stored origin is one
// upstream leaves alone, making this normalization deletable.

export function normalizeSourceIssuer(sourceOrigin: string): string {
  const url = new URL(sourceOrigin);
  if (url.protocol !== 'https:' && !isLoopbackHost(url.host)) {
    url.protocol = 'https:';
  }
  return url.origin;
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
  const serverOrigin = new URL(baseURL).origin;
  return betterAuth({
    basePath: '/api/auth',
    baseURL,
    trustedOrigins: [...trustedOrigins],
    secret,
    logger: config.isProd ? undefined : { level: 'error' },
    database,
    account: {
      accountLinking: {
        // Source linking is an explicit, authenticated delegation between two
        // independently identified accounts, so their emails need not match.
        // Trust configured sources for that flow without allowing same-email
        // OAuth sign-ins to attach a source account implicitly.
        allowDifferentEmails: true,
        disableImplicitLinking: true,
        trustedProviders: sourceServers.map((server) => server.id),
      },
    },
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
        loginPage: '/',
        scopes: [...REMDO_SERVER_OAUTH_SCOPES],
        // Better Auth's resource model binds access-token audiences to explicit
        // protected resources. A RemDo source exposes exactly its own canonical
        // origin, and dynamic registration links each home client to that origin;
        // keep the provider's default per-client resource enforcement enabled.
        resources: [serverOrigin],
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
        // Build a provider only for sources whose public client id has been
        // cached. A source row created by the first link attempt has no provider
        // until self-registration claims its client id and auth is rebuilt.
        config: sourceServers.flatMap((server) => {
          if (!server.credentials) {
            return [];
          }
          return [{
            providerId: server.id,
            authorizationUrl: `${server.baseUrl}/api/auth/oauth2/authorize`,
            tokenUrl: `${server.baseUrl}/api/auth/oauth2/token`,
            userInfoUrl: `${server.baseUrl}/api/auth/oauth2/userinfo`,
            clientId: server.credentials.clientId,
            // Public client: no secret; PKCE authenticates the token exchange.
            scopes: [...REMDO_SERVER_OAUTH_SCOPES],
            accessType: 'offline',
            pkce: true,
            authorizationUrlParams: {
              resource: server.baseUrl,
            },
          } satisfies GenericOAuthConfig];
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
          // Better Auth starts plugin initialization at construction time. Keep
          // every instance that shares this database inside RemDo's readiness
          // boundary so resource seeding cannot outlive the database owner.
          const results = await Promise.allSettled([
            (async () => {
              const { runMigrations } = await getMigrations(auth.options);
              await runMigrations();
            })(),
            auth.$context,
            userProvisioningAuth.$context,
          ]);
          const failure = results.find((result) => result.status === 'rejected');
          if (failure) {
            throw failure.reason;
          }
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
  rebuild: () => Promise<void>;
  // Waits until initialization and every queued rebuild have settled, so the
  // shared database can be closed without auth work still using it.
  waitForIdle: () => Promise<void>;
}

export function createSwappableServerAuth(
  options: CreateServerAuthOptions,
): SwappableServerAuth {
  let current = createServerAuth(options);
  let closing = false;
  let rebuildTail = Promise.resolve();
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
      if (closing) {
        return Promise.reject(new Error('Auth is shutting down.'));
      }
      const pending = rebuildTail.then(async () => {
        await current.ensureReady();
        const replacement = createServerAuth({
          ...options,
          sourceServers: readSourceServersSync(options.database),
        });
        await replacement.ensureReady();
        current = replacement;
      });
      // A failed rebuild must reject its caller without poisoning later queued
      // rebuilds, which can retry from the latest database state.
      rebuildTail = pending.catch(() => {});
      return pending;
    },
    async waitForIdle() {
      closing = true;
      await rebuildTail;
      await current.ensureReady();
    },
  };
}
