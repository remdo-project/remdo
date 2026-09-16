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

it('acknowledges allauth logout while rejecting failed revocation', async () => {
  let status = 401;
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    if (request.url.endsWith('/api/config')) return configResponse();
    expect(request.method).toBe('DELETE');
    expect(request.headers.get('X-CSRFToken')).toBe('initial');
    return Response.json({ status, meta: { is_authenticated: false } }, { status });
  }));
  const { signOut } = await import('./session-http');
  await expect(signOut()).resolves.toBeUndefined();
  status = 403;
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

it('reuses deployment configuration for session checks and logout while reading the current CSRF cookie', async () => {
  let configRequests = 0;
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    if (request.url.endsWith('/api/config')) {
      configRequests += 1;
      if (configRequests > 1) throw new TypeError('Configuration unavailable');
      return configResponse();
    }
    if (request.method === 'DELETE') {
      expect(request.headers.get('X-CSRFToken')).toBe('rotated');
    }
    return Response.json({ status: 401, meta: { is_authenticated: false } }, { status: 401 });
  }));
  const { getSession, signOut } = await import('./session-http');
  await expect(getSession()).resolves.toBeNull();
  await expect(getSession()).resolves.toBeNull();
  document.cookie = 'remdo_csrf_test=rotated; Path=/';
  await expect(signOut()).resolves.toBeUndefined();
  expect(configRequests).toBe(1);
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
