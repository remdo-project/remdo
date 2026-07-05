import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestResource } from '../_support/test-resource';
import { createServerAppHarness } from './_support/server-app-harness';

const createHarness = createTestResource(createServerAppHarness);

function postJson(app: ReturnType<typeof createServerAppHarness>['app'], path: string, body: unknown, headers: Headers = new Headers()) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('content-type', 'application/json');
  return app.request(path, { method: 'POST', headers: requestHeaders, body: JSON.stringify(body) });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// This route is the only user-facing linking entry point: any signed-in user
// links any source by URL, and the home lazily self-registers a public OAuth
// client for it. Only a PRIVATE server links (allowSignup: false — see the
// public-server refusal test); a home cannot register a client on itself, so a
// real end-to-end link needs a second Better Auth instance acting as the source
// plus a rebuilt auth instance that recognizes the new provider — that full
// round-trip is covered by the Task 8 e2e. This spec proves the route's own
// logic: the public-server guard, the auth gate, and the URL validation.
describe('post /api/current-user/source-links', () => {
  it('refuses to link from a public server (public acts only as a source)', async () => {
    const harness = createHarness({ allowSignup: true });
    const headers = await harness.createSessionHeaders();
    const response = await postJson(harness.app, '/api/current-user/source-links', { url: 'https://source.example' }, headers);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('public server'),
    });
  });

  it('rejects an unauthenticated request', async () => {
    const harness = createHarness({ allowSignup: false });
    const response = await postJson(harness.app, '/api/current-user/source-links', { url: 'https://source.example' });
    expect(response.status).toBe(401);
  });

  it('rejects a missing or malformed url', async () => {
    const harness = createHarness({ allowSignup: false });
    const headers = await harness.createSessionHeaders();
    for (const url of [undefined, '', 'not-a-url', 'ws://source.example', 'https://source.example/path']) {
      const response = await postJson(harness.app, '/api/current-user/source-links', { url }, headers);
      expect(response.status, `url=${String(url)}`).toBe(400);
    }
  });

  it('ensures a source client and reaches oAuth2LinkAccount for a valid URL from any signed-in user', async () => {
    const harness = createHarness({ allowSignup: false });
    const headers = await harness.createSessionHeaders();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ client_id: 'source-client-id' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await postJson(harness.app, '/api/current-user/source-links', { url: 'https://source.example' }, headers);

    // The harness's `auth` is a plain (non-swappable) instance, so rebuildAuth()
    // is a no-op here and the freshly-registered source has no live genericOAuth
    // provider in THIS process — oAuth2LinkAccount therefore reports "Provider
    // not found" (404), not the 200/302 authorize redirect a rebuilt production
    // auth would produce. What this proves: the route validated the URL,
    // required auth, called through to ensureSourceClient (client registration
    // actually happened against the stubbed fetch) and then to
    // oAuth2LinkAccount — i.e. the route's own wiring, not the OAuth round-trip.
    // The full round-trip (real rebuild + real provider) is covered by Task 8 e2e.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://source.example/api/auth/oauth2/register',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringContaining('Provider not found'),
    });
  });
});
