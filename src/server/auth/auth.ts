import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { config } from '#config';
import { resolveServerDatabasePath } from '@/server/db/client';

interface CreateServerAuthOptions {
  allowSignup?: boolean;
  baseURL?: string;
  dbPath?: string;
  secret?: string;
}

function createAuthTrustedOrigins(baseURL: string) {
  return [new URL(baseURL).origin];
}

function shouldCreateParentDirectory(dbPath: string): boolean {
  return dbPath !== ':memory:' && dbPath !== '';
}

function createBetterAuthInstance({
  allowSignup,
  baseURL,
  database,
  secret,
}: {
  allowSignup: boolean;
  baseURL: string;
  database: Database.Database;
  secret: string;
}) {
  return betterAuth({
    basePath: '/api/auth',
    baseURL,
    trustedOrigins: createAuthTrustedOrigins(baseURL),
    secret,
    database,
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowSignup,
    },
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
  close: () => void;
  createUser: (user: CreateAuthUserInput, headers: Headers) => Promise<Response>;
  db: Database.Database;
  ensureReady: () => Promise<void>;
  getSession: (headers: Headers) => Promise<Awaited<ReturnType<BetterAuthInstance['api']['getSession']>>>;
  getUserCount: () => number;
}

export function createServerAuth({
  allowSignup = config.env.ALLOW_SIGNUP,
  baseURL = config.env.AUTH_URL,
  dbPath = resolveServerDatabasePath(),
  secret = config.env.AUTH_SECRET,
}: CreateServerAuthOptions = {}): ServerAuth {
  if (!baseURL) {
    throw new Error('A canonical public URL is required for auth.');
  }

  if (!secret) {
    throw new Error('AUTH_SECRET is required for auth.');
  }

  if (shouldCreateParentDirectory(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  const auth = createBetterAuthInstance({
    allowSignup,
    baseURL,
    database: db,
    secret,
  });
  const userProvisioningAuth = allowSignup
    ? auth
    : createBetterAuthInstance({
        allowSignup: true,
        baseURL,
        database: db,
        secret,
      });

  let readyPromise: Promise<void> | null = null;

  return {
    allowSignup,
    auth,
    db,
    close() {
      db.close();
    },
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
    getUserCount() {
      const row = db.prepare('SELECT COUNT(*) AS count FROM "user"').get() as { count: number };
      return row.count;
    },
  };
}

let defaultServerAuth: ServerAuth | null = null;

export function getServerAuth(): ServerAuth {
  if (!defaultServerAuth) {
    defaultServerAuth = createServerAuth();
  }

  return defaultServerAuth;
}
