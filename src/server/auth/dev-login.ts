import { HTTP_STATUS } from '#lib/http/status';
import type { ServerAuth } from './auth';

const DEV_AUTH_ACCOUNT = {
  email: 'dev@example.test',
  name: 'Development User',
  password: 'dev-password-1234',
} as const;

function signInDevAuthAccount(auth: ServerAuth, request: Request): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');
  return auth.auth.handler(new Request(new URL('/api/auth/sign-in/email', request.url), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: DEV_AUTH_ACCOUNT.email,
      password: DEV_AUTH_ACCOUNT.password,
    }),
  }));
}

function copySetCookieHeaders(from: Headers, to: Headers): void {
  const extendedHeaders = from as Headers & { getSetCookie?: () => string[] };
  const setCookies = typeof extendedHeaders.getSetCookie === 'function'
    ? extendedHeaders.getSetCookie()
    : [];
  const fallbackCookie = setCookies.length === 0 ? from.get('set-cookie') : null;

  for (const setCookie of setCookies) {
    to.append('set-cookie', setCookie);
  }
  if (fallbackCookie) {
    to.append('set-cookie', fallbackCookie);
  }
}

export async function handleDevLoginRequest(auth: ServerAuth, request: Request): Promise<Response> {
  await auth.ensureReady();
  await auth.createUser(DEV_AUTH_ACCOUNT, request.headers);

  const signInResponse = await signInDevAuthAccount(auth, request);
  if (!signInResponse.ok) {
    return signInResponse;
  }

  const headers = new Headers({
    location: '/home',
  });
  copySetCookieHeaders(signInResponse.headers, headers);
  return new Response(null, {
    status: HTTP_STATUS.SEE_OTHER,
    headers,
  });
}
