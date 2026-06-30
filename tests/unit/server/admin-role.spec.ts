import { describe, expect, it } from 'vitest';
import { resolveAdminSessionUserId } from '#server/auth/admin-auth';
import { extractSessionCookie } from '#server/auth/session-cookie';
import { createTestResource } from '../_support/test-resource';
import { createServerAppHarness, TEST_ADMIN_SECRET } from './_support/server-app-harness';

const createHarness = createTestResource(createServerAppHarness);

const ENROLLEE = {
  email: 'enrollee@example.com',
  name: 'Enrollee',
  password: 'enrollee-password-1234',
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

    const user = await harness.auth.findUserByEmail(ENROLLEE.email);
    expect(user).not.toBeNull();
    await expect(harness.auth.getUserRole(user!.id)).resolves.toBe('admin');
  });

  it('signs the new admin in (the response carries a session)', async () => {
    const harness = createHarness();
    const response = await enroll(harness.app, { ...ENROLLEE, adminSecret: TEST_ADMIN_SECRET });
    const headers = new Headers({ cookie: extractSessionCookie(response) });
    await expect(resolveAdminSessionUserId(harness.auth, headers)).resolves.toBeTypeOf('string');
  });

  it('promotes an already-authenticated non-admin caller in place', async () => {
    // Sign up a plain user (signup-enabled harness), then enroll WITH that
    // session: the existing account is promoted, no new account is created.
    const harness = createHarness({ allowSignup: true });
    const signUp = await harness.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ENROLLEE),
    });
    const headers = { cookie: extractSessionCookie(signUp) };
    const userId = await harness.getSessionUserId(new Headers(headers));
    await expect(harness.auth.getUserRole(userId)).resolves.not.toBe('admin');

    const response = await enroll(harness.app, { adminSecret: TEST_ADMIN_SECRET }, headers);
    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual({ ok: true });
    await expect(harness.auth.getUserRole(userId)).resolves.toBe('admin');
    await expect(harness.auth.getUserCount()).resolves.toBe(1);
  });
});

describe('resolveAdminSessionUserId', () => {
  it('returns null without a session', async () => {
    const harness = createHarness();
    await expect(resolveAdminSessionUserId(harness.auth, new Headers())).resolves.toBeNull();
  });

  it('returns the user id for an admin session', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const userId = await harness.getSessionUserId(headers);
    await expect(resolveAdminSessionUserId(harness.auth, headers)).resolves.toBe(userId);
  });

  it('refuses a non-admin session', async () => {
    // A signup-enabled harness lets us create a plain (non-admin) user.
    const harness = createHarness({ allowSignup: true });
    const signUp = await harness.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ENROLLEE),
    });
    expect(signUp.ok).toBe(true);
    const headers = new Headers({ cookie: extractSessionCookie(signUp) });

    // The session is valid but the user has no admin role.
    const userId = await harness.getSessionUserId(headers);
    await expect(harness.auth.getUserRole(userId)).resolves.not.toBe('admin');
    await expect(resolveAdminSessionUserId(harness.auth, headers)).resolves.toBeNull();
  });
});
