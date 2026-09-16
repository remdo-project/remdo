import { request as playwrightRequest } from 'playwright';
import { resolveApiServerOrigin } from '#platform/net/origins';
import { TEST_AUTH_ACCOUNT } from '#tests-common/auth-account';
import { authenticateDjangoTestUser } from '#tests-common/django-auth';
import { provisionDjangoUser } from '#tools/django-user';

interface CollabTestAuthentication {
  cookie: string;
  csrfToken: string;
}

let authenticationPromise: Promise<CollabTestAuthentication> | null = null;

function toApiUrl(pathname: string): string {
  return `${resolveApiServerOrigin()}${pathname}`;
}

async function signInTestUser(): Promise<CollabTestAuthentication> {
  await provisionDjangoUser(TEST_AUTH_ACCOUNT);
  const request = await playwrightRequest.newContext();
  try {
    const csrfToken = await authenticateDjangoTestUser(request, resolveApiServerOrigin(), TEST_AUTH_ACCOUNT);
    const { cookies } = await request.storageState();
    return { cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '), csrfToken };
  } finally {
    await request.dispose();
  }
}

export async function getCollabTestAuthentication(): Promise<CollabTestAuthentication> {
  authenticationPromise ??= signInTestUser().catch((error: unknown) => {
    authenticationPromise = null;
    throw error;
  });
  return authenticationPromise;
}

export function withTestAuthentication(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  authentication: CollabTestAuthentication,
): Request {
  const request = typeof input === 'string'
    ? new Request(new URL(input, toApiUrl('/')), init)
    : new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== new URL(toApiUrl('/')).origin || !url.pathname.startsWith('/api/')) {
    return request;
  }
  const headers = new Headers(request.headers);
  headers.set('cookie', authentication.cookie);
  headers.set('X-CSRFToken', authentication.csrfToken);
  return new Request(request, { headers });
}

export async function installAuthenticatedApiFetch(): Promise<() => void> {
  const authentication = await getCollabTestAuthentication();
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => originalFetch(withTestAuthentication(input, init, authentication));
  return () => { globalThis.fetch = originalFetch; };
}
