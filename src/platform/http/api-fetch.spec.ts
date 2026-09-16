import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch, setCsrfCookieName } from './api-fetch';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'remdo_csrf_4000=; Max-Age=0; Path=/';
  document.cookie = 'remdo_csrf_5000=; Max-Age=0; Path=/';
});

it('uses the server-selected cookie and picks up rotated tokens', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json({}));
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'remdo_csrf_4000=first; Path=/';
  document.cookie = 'remdo_csrf_5000=other-server; Path=/';
  setCsrfCookieName('remdo_csrf_4000');
  await apiFetch('/api/documents', { method: 'POST' });
  expect((fetchMock.mock.calls[0]![0] as Request).headers.get('X-CSRFToken')).toBe('first');
  document.cookie = 'remdo_csrf_4000=rotated; Path=/';
  await apiFetch('/api/documents', { method: 'POST' });
  expect((fetchMock.mock.calls[1]![0] as Request).headers.get('X-CSRFToken')).toBe('rotated');
});

it('does not attach session CSRF tokens to a foreign origin', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json({}));
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'remdo_csrf_4000=private; Path=/';
  setCsrfCookieName('remdo_csrf_4000');
  await apiFetch('https://foreign.example/api/documents', { method: 'POST' });
  expect((fetchMock.mock.calls[0]![0] as Request).headers.has('X-CSRFToken')).toBe(false);
});
