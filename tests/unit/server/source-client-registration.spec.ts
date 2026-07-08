import { describe, expect, it, vi } from 'vitest';
import { registerPublicSourceClient } from '#server/remdo-oauth/source-client-registration';

describe('registerPublicSourceClient', () => {
  it('registers a public client and returns its id', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://source.example/api/auth/oauth2/register');
      const body = JSON.parse(String(init?.body));
      expect(body.token_endpoint_auth_method).toBe('none');
      expect(body.redirect_uris).toEqual([
        'https://home.private/api/auth/oauth2/callback/src-id',
      ]);
      return new Response(JSON.stringify({ client_id: 'abc123' }), { status: 201 });
    });
    const result = await registerPublicSourceClient(
      {
        sourceBaseUrl: 'https://source.example',
        homeOrigin: 'https://home.private',
        sourceId: 'src-id',
        scopes: ['openid', 'remdo'],
      },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(result).toEqual({ clientId: 'abc123' });
  });

  it('throws when the source returns no client_id', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    await expect(
      registerPublicSourceClient(
        { sourceBaseUrl: 'https://s.example', homeOrigin: 'https://h.example', sourceId: 'x', scopes: [] },
        { fetch: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toThrow(/client_id/);
  });

  it('throws on a non-2xx response', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 403 }));
    await expect(
      registerPublicSourceClient(
        { sourceBaseUrl: 'https://s.example', homeOrigin: 'https://h.example', sourceId: 'x', scopes: [] },
        { fetch: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toThrow();
  });
});
