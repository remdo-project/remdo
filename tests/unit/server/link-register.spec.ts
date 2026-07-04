import { describe, expect, it } from 'vitest';
import { deriveSourceId } from '#server/remdo-oauth/config';
import { extractSessionCookie } from '#server/auth/session-cookie';
import { createTestResource } from '../_support/test-resource';
import { TEST_BASE_URL, createServerAppHarness } from './_support/server-app-harness';

const createHarness = createTestResource(createServerAppHarness);
const SOURCE_ID = deriveSourceId('https://source.example');

type Harness = ReturnType<typeof createHarness>;

function postJson(app: Harness['app'], path: string, body: unknown, headers: Headers = new Headers()) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('content-type', 'application/json');
  return app.request(path, { method: 'POST', headers: requestHeaders, body: JSON.stringify(body) });
}

// The home admin acts through a session with the admin role (created via
// enrollment); source-server management and registration gate on that role.
async function adminHeaders(harness: Harness): Promise<Headers> {
  return harness.createSessionHeaders();
}

// A signed-in but non-admin session (normal signup grants role 'user'). The
// role gate must refuse it — the behavior that distinguishes the role model from
// the old shared-secret gate, where any secret-holder passed.
async function nonAdminHeaders(harness: Harness): Promise<Headers> {
  const signUp = await harness.app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', password: 'user-password-01', name: 'Plain User' }),
  });
  return new Headers({ cookie: extractSessionCookie(signUp) });
}

async function addSource(harness: Harness, headers: Headers): Promise<string> {
  await postJson(harness.app, '/api/admin/source-servers', { url: 'https://source.example' }, headers);
  return SOURCE_ID;
}

// Seeds the home's server-side handle state for a source (the claim later
// recovers it via findBySource); callers don't need the handle value.
async function startRegistration(harness: Harness, headers: Headers, id: string): Promise<void> {
  await postJson(harness.app, `/api/link/source-servers/${id}/register`, {}, headers);
}

describe('home-side registration initiation', () => {
  it('requires the admin role', async () => {
    const harness = createHarness();
    const headers = await adminHeaders(harness);
    const id = await addSource(harness, headers);
    // No session → not an admin → 403.
    const response = await postJson(harness.app, `/api/link/source-servers/${id}/register`, {});
    expect(response.status).toBe(403);
  });

  it('refuses a signed-in non-admin user (role gate, not just session)', async () => {
    const harness = createHarness({ allowSignup: true });
    const admin = await adminHeaders(harness);
    const id = await addSource(harness, admin);
    const user = await nonAdminHeaders(harness);
    // A valid session that lacks the admin role must be refused — this is the
    // gate the old shared-secret model did not enforce.
    const register = await postJson(harness.app, `/api/link/source-servers/${id}/register`, {}, user);
    expect(register.status).toBe(403);
    // Same gate on the source-server admin API.
    const list = await harness.app.request('/api/admin/source-servers', { headers: user });
    expect(list.status).toBe(403);
    const add = await postJson(harness.app, '/api/admin/source-servers', { url: 'https://other.example' }, user);
    expect(add.status).toBe(403);
  });

  it('returns a source redirect URL carrying a handle and the home origin', async () => {
    const harness = createHarness();
    const headers = await adminHeaders(harness);
    const id = await addSource(harness, headers);
    const response = await postJson(harness.app, `/api/link/source-servers/${id}/register`, {}, headers);
    expect(response.status).toBe(200);
    const url = new URL((await response.json() as { redirectUrl: string }).redirectUrl);
    expect(url.origin).toBe('https://source.example');
    // The browser is sent to the source's confirmation page, not a server route,
    // so registration is a deliberate POST the source user makes there.
    expect(url.pathname).toBe('/oauth/register-home');
    // The advertised home origin is THIS auth instance's baseURL (the harness
    // override), not the env singleton — a home built with a per-instance origin
    // must send that origin to the source.
    expect(url.searchParams.get('home')).toBe(new URL(TEST_BASE_URL).origin);
    expect(url.searchParams.get('handle')).toBeTruthy();
    expect(url.searchParams.get('state')).toBe(id);
  });
});

describe('home-side registration claim', () => {
  // The claim no longer takes the handle from the request; it recovers it from
  // this home's own server state (findBySource), so the handle never rides in the
  // browser. Registration must have been started for a claim to proceed.
  it('rejects a claim without the admin role', async () => {
    const harness = createHarness();
    const headers = await adminHeaders(harness);
    const id = await addSource(harness, headers);
    await startRegistration(harness, headers, id);
    const response = await postJson(harness.app, `/api/link/source-servers/${id}/claim`, { code: 'x' });
    expect(response.status).toBe(403);
  });

  it('rejects a claim with no in-flight registration for the source', async () => {
    const harness = createHarness();
    const headers = await adminHeaders(harness);
    const id = await addSource(harness, headers);
    // No startRegistration → no server-side handle → cannot claim.
    const response = await postJson(
      harness.app,
      `/api/link/source-servers/${id}/claim`,
      { code: 'x' },
      headers,
    );
    expect(response.status).toBe(403);
  });

  it('does not burn the handle when the source pull fails, so it can be retried', async () => {
    const harness = createHarness();
    const headers = await adminHeaders(harness);
    const id = await addSource(harness, headers);
    await startRegistration(harness, headers, id);

    // The source pull fails here (no real source), so this is a recoverable
    // error — not a handle/auth failure. The handle must survive for a retry.
    const first = await postJson(
      harness.app,
      `/api/link/source-servers/${id}/claim`,
      { code: 'some-code' },
      headers,
    );
    expect(first.status).not.toBe(403);

    const retry = await postJson(
      harness.app,
      `/api/link/source-servers/${id}/claim`,
      { code: 'some-code' },
      headers,
    );
    expect(retry.status).not.toBe(403);
  });
});

describe('source-side registration', () => {
  it('requires an authenticated source account to register a home', async () => {
    const harness = createHarness({ allowSignup: true });
    const response = await postJson(harness.app, '/api/link/register-home', {
      handle: 'h',
      home: 'https://home.example',
      state: 'sid',
    });
    expect(response.status).toBe(401);
  });

  it('rejects an invalid or non-http(s) home origin', async () => {
    const harness = createHarness({ allowSignup: true });
    for (const home of ['not-an-origin', 'ws://home.example', 'ftp://home.example', 'https://home.example/path']) {
      const response = await postJson(harness.app, '/api/link/register-home', { handle: 'h', home, state: 'sid' });
      expect(response.status, `home=${home}`).toBe(400);
    }
  });

  it('rejects a malformed source id (state) before registration', async () => {
    const harness = createHarness({ allowSignup: true });
    for (const state of ['has space', 'path/seg', 'semi;colon']) {
      const response = await postJson(harness.app, '/api/link/register-home', {
        handle: 'h',
        home: 'https://home.example',
        state,
      });
      expect(response.status, `state=${state}`).toBe(400);
    }
  });

  it('rejects home registration on a non-public source with 403, not 500', async () => {
    const harness = createHarness({ allowSignup: false });
    const headers = await harness.createSessionHeaders();
    const response = await postJson(harness.app, '/api/link/register-home', {
      handle: 'h',
      home: 'https://home.example',
      state: 'sid',
    }, headers);
    expect(response.status).toBe(403);
  });

  it('refuses claim-registration entirely on a non-public source', async () => {
    const harness = createHarness({ allowSignup: false });
    const response = await postJson(harness.app, '/api/link/claim-registration', { code: 'whatever' });
    expect(response.status).toBe(403);
  });

  it('requires both a code and a handle to claim', async () => {
    const harness = createHarness({ allowSignup: true });
    const response = await postJson(harness.app, '/api/link/claim-registration', { code: 'never-issued' });
    expect(response.status).toBe(400);
  });

  it('rejects claiming an unknown code (with a handle) on a public source', async () => {
    const harness = createHarness({ allowSignup: true });
    const response = await postJson(harness.app, '/api/link/claim-registration', {
      code: 'never-issued',
      handle: 'some-handle',
    });
    expect(response.status).toBe(403);
  });

  it('registers a home for an authenticated source user and rate-limits repeats', async () => {
    const harness = createHarness({ allowSignup: true });
    const headers = await harness.createSessionHeaders();
    const register = () => postJson(harness.app, '/api/link/register-home', {
      handle: 'h',
      home: 'https://home.example',
      state: SOURCE_ID,
    }, headers);

    // The register goes through Better Auth's pipeline, so its configured
    // register rate limit (window 60s, max 5) applies. The first calls succeed
    // (200 with a redirect back to the home carrying a one-time code); once the
    // limit is hit the source rejects with a forwarded 4xx (429).
    const first = await register();
    expect(first.status).toBe(200);
    expect(new URL((await first.json() as { redirectUrl: string }).redirectUrl).searchParams.get('code')).toBeTruthy();

    let sawRateLimit = false;
    for (let i = 0; i < 8 && !sawRateLimit; i += 1) {
      const response = await register();
      if (response.status === 429) {
        sawRateLimit = true;
      } else {
        expect(response.status).toBe(200);
      }
    }
    expect(sawRateLimit, 'register-home should be rate-limited after the configured max').toBe(true);
  });
});
