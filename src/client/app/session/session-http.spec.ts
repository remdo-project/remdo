import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); });
afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'remdo_csrf_test=; Max-Age=0; Path=/';
});

function configResponse() {
  document.cookie = 'remdo_csrf_test=initial; Path=/';
  return Response.json({ publicServer: false, csrfCookieName: 'remdo_csrf_test', csrfToken: 'initial' });
}

it('uses native allauth login and acknowledges its unauthenticated logout response', async () => {
  const requests: Request[] = [];
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    requests.push(request);
    if (request.url.endsWith('/api/config')) return configResponse();
    if (request.method === 'POST') {
      expect(request.headers.get('X-CSRFToken')).toBe('initial');
      expect(await request.json()).toEqual({ email: 'user@example.com', password: 'test-password' });
      document.cookie = 'remdo_csrf_test=rotated; Path=/';
      return Response.json({ status: 200, data: { user: { id: 1 } }, meta: { is_authenticated: true } });
    }
    expect(request.method).toBe('DELETE');
    expect(request.headers.get('X-CSRFToken')).toBe('rotated');
    return Response.json({ status: 401, data: { flows: [] }, meta: { is_authenticated: false } }, { status: 401 });
  }));
  const { signIn, signOut } = await import('./session-http');
  await signIn({ email: 'user@example.com', password: 'test-password' });
  await expect(signOut()).resolves.toBeUndefined();
  expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
    '/api/config', '/api/auth/browser/v1/auth/login', '/api/auth/browser/v1/auth/session',
  ]);
});

it('surfaces account validation errors and does not acknowledge a rejected logout', async () => {
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    if (request.url.endsWith('/api/config')) return configResponse();
    return request.method === 'POST'
      ? Response.json({ status: 400, errors: [{ message: 'Invalid credentials.', code: 'invalid_login' }] }, { status: 400 })
      : Response.json({ status: 403 }, { status: 403 });
  }));
  const { signIn, signOut } = await import('./session-http');
  await expect(signIn({ email: 'user@example.com', password: 'wrong' })).rejects.toThrow('Invalid credentials.');
  await expect(signOut()).rejects.toMatchObject({ status: 403 });
});

it('distinguishes an absent session from an unavailable account server', async () => {
  let status = 401;
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => request.url.endsWith('/api/config')
    ? configResponse()
    : Response.json({ status, meta: { is_authenticated: false } }, { status })));
  const { getSession } = await import('./session-http');
  await expect(getSession()).resolves.toBeNull();
  status = 503;
  await expect(getSession()).rejects.toMatchObject({ status: 503 });
});

it.each([200, 401, 503])('rechecks the session after a login conflict (session status %i)', async (status) => {
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    if (request.url.endsWith('/api/config')) return configResponse();
    if (request.url.endsWith('/auth/login')) return Response.json({ status: 409 }, { status: 409 });
    return status === 200
      ? Response.json({ status: 200, data: { user: { id: 1 } }, meta: { is_authenticated: true } })
      : Response.json({ status }, { status });
  }));
  const { signIn } = await import('./session-http');
  const result = signIn({ email: 'user@example.com', password: 'test-password' });
  if (status === 200) {
    await expect(result).resolves.toBeUndefined();
  } else {
    await expect(result).rejects.toMatchObject({ status: status === 401 ? 409 : status });
  }
});

it('reports an offline first request so the session gate can use remembered state', async () => {
  const { onlineManager } = await import('@tanstack/query-core');
  onlineManager.setOnline(false);
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
  try {
    const { getSession } = await import('./session-http');
    await expect(getSession()).rejects.toThrow('Failed to fetch');
  } finally {
    onlineManager.setOnline(true);
  }
});
