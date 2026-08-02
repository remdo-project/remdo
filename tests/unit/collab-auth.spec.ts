import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('reports both failures when an existing collab test user cannot sign in', async () => {
  vi.resetModules();
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, {
      status: 422,
      statusText: 'Unprocessable Entity',
    }))
    .mockResolvedValueOnce(new Response(null, {
      status: 401,
      statusText: 'Unauthorized',
    }));
  vi.stubGlobal('fetch', fetchMock);
  const { getCollabTestSessionCookie } = await import('./collab/_support/auth');

  await expect(getCollabTestSessionCookie()).rejects.toThrow(
    'Failed to authenticate collab test user: enrollment 422 Unprocessable Entity; sign-in 401 Unauthorized',
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
