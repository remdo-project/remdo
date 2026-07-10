import { describe, expect, it } from 'vitest';
import { extractSessionCookie } from '#server/auth/session-cookie';
import { createTestResource } from '../_support/test-resource';
import { createServerAppHarness, TEST_ADMIN_SECRET } from './_support/server-app-harness';

const createHarness = createTestResource(createServerAppHarness);

const ENROLLEE = {
  email: 'enrollee@example.com',
  name: 'Enrollee',
  password: 'enrollee-password-1234',
} as const;

const OTHER_ENROLLEE = {
  email: 'other-enrollee@example.com',
  name: 'Other Enrollee',
  password: 'other-enrollee-password-1234',
} as const;

function enroll(
  app: ReturnType<typeof createHarness>['app'],
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.request('/api/admin/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('admin self-enrollment', () => {
  it('rejects enrollment without the admin secret', async () => {
    const harness = createHarness();
    const response = await enroll(harness.app, { ...ENROLLEE, adminSecret: 'wrong' });
    expect(response.status).toBe(403);
    await expect(harness.auth.getUserCount()).resolves.toBe(0);
  });

  it('bootstraps the first admin from an empty server with signup off', async () => {
    // The harness runs with allowSignup: false, so this proves the secret-gated
    // path creates the account even when public signup is disabled.
    const harness = createHarness();
    const response = await enroll(harness.app, { ...ENROLLEE, adminSecret: TEST_ADMIN_SECRET });
    expect(response.ok).toBe(true);

    const session = await harness.auth.getSession(new Headers({
      cookie: extractSessionCookie(response),
    }));
    expect(session?.user.role).toBe('admin');
  });

  it('signs the new admin in (the response carries a session)', async () => {
    const harness = createHarness();
    const response = await enroll(harness.app, { ...ENROLLEE, adminSecret: TEST_ADMIN_SECRET });
    const headers = new Headers({ cookie: extractSessionCookie(response) });
    const session = await harness.auth.getSession(headers);
    expect(session?.user.id).toBeTypeOf('string');
    expect(session?.user.role).toBe('admin');
  });

  it('registers a new admin account rather than promoting the caller in place', async () => {
    // Enrollment is always account-registration: a signed-in non-admin who
    // enrolls creates a NEW admin account; their existing account is untouched
    // (promoting an existing user is the later, panel-gated capability).
    const harness = createHarness({ allowSignup: true });
    const signUp = await harness.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ENROLLEE),
    });
    const headers = { cookie: extractSessionCookie(signUp) };
    const existingSession = await harness.auth.getSession(new Headers(headers));
    expect(existingSession?.user.role).toBe('user');

    const response = await enroll(harness.app, {
      ...OTHER_ENROLLEE,
      adminSecret: TEST_ADMIN_SECRET,
    }, headers);
    expect(response.ok).toBe(true);

    // The pre-existing account stays a non-admin; a new admin account was created.
    const persistedExistingUser = await harness.database.db
      .selectFrom('user')
      .select('role')
      .where('id', '=', existingSession!.user.id)
      .executeTakeFirstOrThrow();
    expect(persistedExistingUser.role).toBe('user');
    const createdSession = await harness.auth.getSession(new Headers({
      cookie: extractSessionCookie(response),
    }));
    expect(createdSession?.user.role).toBe('admin');
    expect(createdSession?.user.id).not.toBe(existingSession?.user.id);
    await expect(harness.auth.getUserCount()).resolves.toBe(2);
  });

  it('leaves a normally-signed-up user without the admin role', async () => {
    // A signup-enabled harness creates a plain (non-admin) user; only the
    // secret-gated enroll path grants the admin role.
    const harness = createHarness({ allowSignup: true });
    const signUp = await harness.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ENROLLEE),
    });
    expect(signUp.ok).toBe(true);
    const session = await harness.auth.getSession(new Headers({ cookie: extractSessionCookie(signUp) }));
    expect(session?.user.role).toBe('user');
  });
});
