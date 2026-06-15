import { config } from '#config';
import type { ServerAuth } from '#server/auth/auth';
import { extractSessionCookie } from '#server/auth/session-cookie';

export const STABLE_AUTH_USERS = {
  alice: {
    email: 'alice@example.test',
    name: 'Alice',
    password: 'alice-password-1234',
  },
  bob: {
    email: 'bob@example.test',
    name: 'Bob',
    password: 'bob-password-1234',
  },
} as const;

export type StableAuthUser = (typeof STABLE_AUTH_USERS)[keyof typeof STABLE_AUTH_USERS];

export async function createStableAuthUserSessionHeaders(
  auth: ServerAuth,
  user: StableAuthUser,
): Promise<Headers> {
  const response = await auth.auth.handler(new Request(new URL('/api/auth/sign-in/email', config.env.AUTH_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
    }),
  }));
  if (!response.ok) {
    throw new Error(`Failed to sign in ${user.email}.`);
  }
  return new Headers({ cookie: extractSessionCookie(response) });
}
