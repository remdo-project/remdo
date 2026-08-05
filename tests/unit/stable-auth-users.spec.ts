import { afterEach, describe, expect, it } from 'vitest';
import type { ServerAuth } from '#server/auth/auth';
import { createServerAuth } from '#server/auth/auth';
import { extractSessionCookie } from '#server/auth/session-cookie';
import type { SqliteServerDatabaseClient } from '#server/db/client';
import { createServerDatabaseClient } from '#server/db/client';
import { STABLE_AUTH_USERS, restoreStableDevUsers } from '#tools/stable-auth-users';

const BASE_URL = 'http://127.0.0.1:4000';

async function signIn(auth: ServerAuth, email: string, password: string): Promise<Response> {
  return auth.auth.handler(new Request(new URL('/api/auth/sign-in/email', BASE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }));
}

describe('stable development users', () => {
  let database: SqliteServerDatabaseClient | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  it('restores stable passwords without replacing users or revoking sessions', async () => {
    database = createServerDatabaseClient({ dbPath: ':memory:' });
    const auth = createServerAuth({
      allowSignup: true,
      baseURL: BASE_URL,
      database,
      secret: 'stable-users-test-secret-0123456789',
      sourceServers: [],
      trustedOrigins: [BASE_URL],
    });
    await auth.ensureReady();

    const initial = await restoreStableDevUsers(auth);
    const initialAlice = initial.find(({ definition }) => definition.email === STABLE_AUTH_USERS.alice.email)!;
    const initialSession = await signIn(
      auth,
      STABLE_AUTH_USERS.alice.email,
      STABLE_AUTH_USERS.alice.password,
    );
    expect(initialSession.ok).toBe(true);
    const sessionHeaders = new Headers({ cookie: extractSessionCookie(initialSession) });

    const changedPassword = 'temporarily-changed-password';
    const changeResponse = await auth.auth.handler(new Request(new URL('/api/auth/change-password', BASE_URL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionHeaders.get('cookie')!,
      },
      body: JSON.stringify({
        currentPassword: STABLE_AUTH_USERS.alice.password,
        newPassword: changedPassword,
        revokeOtherSessions: false,
      }),
    }));
    expect(changeResponse.ok).toBe(true);
    expect((await signIn(auth, STABLE_AUTH_USERS.alice.email, changedPassword)).ok).toBe(true);

    const restored = await restoreStableDevUsers(auth);
    const restoredAlice = restored.find(({ definition }) => definition.email === STABLE_AUTH_USERS.alice.email)!;

    expect(restoredAlice.account.id).toBe(initialAlice.account.id);
    expect((await signIn(
      auth,
      STABLE_AUTH_USERS.alice.email,
      STABLE_AUTH_USERS.alice.password,
    )).ok).toBe(true);
    expect((await signIn(auth, STABLE_AUTH_USERS.alice.email, changedPassword)).ok).toBe(false);
    await expect(auth.getSession(sessionHeaders)).resolves.toMatchObject({
      user: { id: initialAlice.account.id },
    });
  });
});
