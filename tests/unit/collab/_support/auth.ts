import { config } from '#config';
import { HTTP_STATUS } from '#lib/http/status';
import { resolveApiServerOrigin } from '#lib/net/origins';
import { TEST_AUTH_ACCOUNT } from '#tests-common/auth-account';

const SESSION_COOKIE_PATTERN = /better-auth\.session_token=([^;]+)/u;

let sessionCookiePromise: Promise<string> | null = null;

function toApiUrl(pathname: string): string {
  return `${resolveApiServerOrigin({ loopback: true })}${pathname}`;
}

function extractSessionCookie(response: Response): string {
  const extendedHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const getSetCookie = typeof extendedHeaders.getSetCookie === 'function' ? extendedHeaders.getSetCookie() : [];
  const header = getSetCookie[0] ?? response.headers.get('set-cookie') ?? '';
  const match = header.match(SESSION_COOKIE_PATTERN);
  if (!match) {
    throw new Error('Collab test session cookie missing from response.');
  }
  return `better-auth.session_token=${match[1]}`;
}

async function createOrSignInTestUser(): Promise<string> {
  const provisionResponse = await fetch(toApiUrl('/api/admin/users'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...TEST_AUTH_ACCOUNT,
      adminSecret: config.env.ADMIN_SECRET,
    }),
  });
  if (provisionResponse.ok) {
    return extractSessionCookie(provisionResponse);
  }
  if (provisionResponse.status !== HTTP_STATUS.UNPROCESSABLE_ENTITY) {
    throw new Error(`Failed to provision collab test user: ${provisionResponse.status} ${provisionResponse.statusText}`);
  }

  const signInResponse = await fetch(toApiUrl('/api/auth/sign-in/email'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: TEST_AUTH_ACCOUNT.email,
      password: TEST_AUTH_ACCOUNT.password,
    }),
  });
  if (signInResponse.ok) {
    return extractSessionCookie(signInResponse);
  }

  throw new Error(`Failed to provision collab test user: ${provisionResponse.status} ${provisionResponse.statusText}`);
}

export async function getCollabTestSessionCookie(): Promise<string> {
  if (!sessionCookiePromise) {
    sessionCookiePromise = createOrSignInTestUser().catch((error) => {
      sessionCookiePromise = null;
      throw error;
    });
  }
  return sessionCookiePromise;
}

export function withSessionCookie(input: RequestInfo | URL, init: RequestInit | undefined, sessionCookie: string): Request {
  const request = new Request(input, init);
  const url = new URL(request.url, toApiUrl('/'));
  if (url.origin !== new URL(toApiUrl('/')).origin || !url.pathname.startsWith('/api/')) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.set('cookie', sessionCookie);
  return new Request(request, { headers });
}

export async function installAuthenticatedApiFetch(): Promise<() => void> {
  const sessionCookie = await getCollabTestSessionCookie();
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    return originalFetch(withSessionCookie(input, init, sessionCookie));
  }) as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}
