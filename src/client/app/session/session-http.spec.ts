import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'remdo_csrf_test=; Max-Age=0; Path=/';
});

function configResponse() {
  document.cookie = 'remdo_csrf_test=initial; Path=/';
  return Response.json({ csrfCookieName: 'remdo_csrf_test', csrfToken: 'initial' });
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

it('reads session state without depending on configuration availability', async () => {
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    requests.push(new URL(request.url).pathname);
    if (request.url.endsWith('/api/config')) throw new TypeError('Configuration unavailable');
    return Response.json({ status: 401, meta: { is_authenticated: false } }, { status: 401 });
  }));
  const { getSession } = await import('./session-http');
  await expect(getSession()).resolves.toBeNull();
  expect(requests).toEqual(['/api/auth/browser/v1/auth/session']);
});

it('does not send logout when configuration fails', async () => {
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    requests.push(new URL(request.url).pathname);
    throw new TypeError('Configuration unavailable');
  }));
  const { signOut } = await import('./session-http');
  await expect(signOut()).rejects.toThrow('Configuration unavailable');
  expect(requests).toEqual(['/api/config']);
});

it('reuses mutation configuration while reading the current CSRF cookie', async () => {
  let configRequests = 0;
  const sentTokens: (string | null)[] = [];
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    if (request.url.endsWith('/api/config')) {
      configRequests += 1;
      if (configRequests > 1) throw new TypeError('Configuration unavailable');
      return configResponse();
    }
    if (request.method === 'DELETE') {
      sentTokens.push(request.headers.get('X-CSRFToken'));
    }
    return Response.json({ status: 401, meta: { is_authenticated: false } }, { status: 401 });
  }));
  const { getSession, signOut } = await import('./session-http');
  await expect(getSession()).resolves.toBeNull();
  await expect(getSession()).resolves.toBeNull();
  expect(configRequests).toBe(0);
  await expect(signOut()).resolves.toBeUndefined();
  document.cookie = 'remdo_csrf_test=rotated; Path=/';
  await expect(signOut()).resolves.toBeUndefined();
  expect(configRequests).toBe(1);
  expect(sentTokens).toEqual(['initial', 'rotated']);
});

it.each(['sign-in', 'new logout', 'unchanged'] as const)(
  'checks logout identity after delayed configuration (%s)',
  async (transition) => {
    let notifyConfigRequested!: () => void;
    let releaseConfig!: (response: Response) => void;
    const configRequested = new Promise<void>((resolve) => { notifyConfigRequested = resolve; });
    const configReleased = new Promise<Response>((resolve) => { releaseConfig = resolve; });
    const deletions: Request[] = [];
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      if (request.url.endsWith('/api/config')) {
        notifyConfigRequested();
        return configReleased;
      }
      deletions.push(request);
      return Response.json({ status: 401, meta: { is_authenticated: false } }, { status: 401 });
    }));
    const {
      rememberPendingSignOut, rememberAuthenticatedSession, revokeServerSession,
      hasPendingSignOut, hasConfirmedSignOut,
    } = await import('./client');
    rememberPendingSignOut();
    const logout = revokeServerSession();
    await configRequested;
    if (transition !== 'unchanged') rememberAuthenticatedSession();
    if (transition === 'new logout') rememberPendingSignOut();
    releaseConfig(configResponse());
    await logout;

    expect(deletions.map(request => request.method)).toEqual(transition === 'unchanged' ? ['DELETE'] : []);
    expect(hasPendingSignOut()).toBe(transition !== 'sign-in');
    expect(hasConfirmedSignOut()).toBe(transition === 'unchanged');
  },
);

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
