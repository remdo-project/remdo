import { config } from '#config';
import type { ServerAuth } from '@/server/auth/auth';

const SESSION_COOKIE_PATTERN = /((?:__Secure-)?better-auth\.session_token)=([^;]+)/u;

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

function extractSessionCookie(response: Response): string {
  const extendedHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const getSetCookie = typeof extendedHeaders.getSetCookie === 'function' ? extendedHeaders.getSetCookie() : [];
  const header = getSetCookie[0] ?? response.headers.get('set-cookie') ?? '';
  const match = header.match(SESSION_COOKIE_PATTERN);
  if (!match) {
    throw new Error('Better Auth session cookie missing from response.');
  }
  return `${match[1]}=${match[2]}`;
}

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
