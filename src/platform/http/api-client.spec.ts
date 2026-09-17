import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'remdo_csrf_reconnect=; Max-Age=0; Path=/';
});

it('loads CSRF configuration before the first mutation after an offline launch', async () => {
  vi.resetModules();
  let offline = true;
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    if (offline) throw new TypeError('Failed to fetch');
    if (request.url.endsWith('/api/config')) {
      document.cookie = 'remdo_csrf_reconnect=token; Path=/';
      return Response.json({ csrfCookieName: 'remdo_csrf_reconnect' });
    }
    expect(request.method).toBe('POST');
    expect(request.headers.get('X-CSRFToken')).toBe('token');
    return Response.json({ id: 'reconnected', title: 'After reconnect' }, { status: 201 });
  }));
  const { api, getApiConfig, requireData } = await import('./api-client');
  await expect(getApiConfig()).rejects.toThrow('Failed to fetch');
  offline = false;
  const result = await api.POST('/api/documents', { body: { title: 'After reconnect' } });
  expect(requireData(result).id).toBe('reconnected');
});
