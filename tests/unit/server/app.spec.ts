import { inspectRoutes } from 'hono/dev';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '#config';
import { HTTP_STATUS } from '#platform/http/status';
import { extractSessionCookie } from '#server/auth/session-cookie';
import { STABLE_AUTH_USERS } from '#tools/stable-auth-users';
import { createTestResource } from '../_support/test-resource';
import { TEST_ADMIN_SECRET, createServerAppHarness } from './_support/server-app-harness';

const createHarness = createTestResource(createServerAppHarness);

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TEST_SOURCE_SERVER = {
  id: 'source',
  label: 'Source Server',
  baseUrl: 'https://source.example',
  tokenBaseUrl: 'https://source-token.example',
  clientId: 'source-client-id',
  clientSecret: 'source-client-secret',
} as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createHarnessWithSourceServer() {
  return createHarness({
    linkableRemdoServers: [TEST_SOURCE_SERVER],
  });
}

async function insertDocumentForSession(
  harness: ReturnType<typeof createServerAppHarness>,
  headers: Headers,
  docId: string,
  title = docId,
) {
  return harness.registry.insertDocument({
    id: docId,
    ownerUserId: await harness.getSessionUserId(headers),
    title,
  });
}

function createJsonHeaders(headers: Headers = new Headers()): Headers {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('content-type', 'application/json');
  return requestHeaders;
}

describe('remdo api app', () => {
  it('registers the browser-facing API route inventory', () => {
    const harness = createHarness();

    expect(inspectRoutes(harness.app).map(({ method, path }) => `${method} ${path}`)).toEqual([
      'ALL /api/auth/*',
      'GET /.well-known/openid-configuration',
      'GET /.well-known/oauth-authorization-server',
      'ALL /api',
      'ALL /api/*',
      'ALL /api/*',
      'GET /api/health',
      'GET /api/current-user',
      'GET /api/current-user/source-servers/:serverId/current-user',
      'POST /api/current-user/source-servers/:serverId/documents/:docId/sync-tokens',
      'POST /api/current-user/source-servers/:serverId/account-links',
      'POST /api/documents',
      'POST /api/documents/:docId/access',
      'POST /api/documents/:docId/sync-tokens',
      'POST /api/admin/enroll',
    ]);
  });

  it('rejects cross-site form-style browser mutations with Hono CSRF protection', async () => {
    const harness = createHarnessWithSourceServer();
    const headers = await harness.createSessionHeaders();
    const mutatingRoutes = inspectRoutes(harness.app)
      .filter(({ method }) => !SAFE_HTTP_METHODS.has(method))
      .map(({ method, path }) => ({ key: `${method} ${path}`, method, path }));

    expect(mutatingRoutes.length).toBeGreaterThan(0);
    for (const { key, method, path } of mutatingRoutes) {
      if (key === 'ALL /api/auth/*' || key === 'ALL /api') {
        continue;
      }
      // Resolve params to real, existing values so each request reaches the
      // middleware rather than short-circuiting on a not-found resource.
      const requestPath = path
        .replace(':serverId', TEST_SOURCE_SERVER.id)
        .replaceAll(/:[^/]+/gu, 'placeholder');
      const requestHeaders = new Headers(headers);
      requestHeaders.set('content-type', 'text/plain');
      requestHeaders.set('origin', 'https://evil.example');
      requestHeaders.set('sec-fetch-site', 'cross-site');
      const response = await harness.app.request(requestPath, {
        method,
        headers: requestHeaders,
        body: '{}',
      });
      expect(response.status, `${key} accepted a cross-site form-style mutation`)
        .toBe(HTTP_STATUS.FORBIDDEN);
      await expect(response.text()).resolves.toBe('Forbidden');
    }
  });

  it('requires JSON content type for same-origin browser mutations', async () => {
    const harness = createHarnessWithSourceServer();
    const headers = await harness.createSessionHeaders();
    const mutatingRoutes = inspectRoutes(harness.app)
      .filter(({ method }) => !SAFE_HTTP_METHODS.has(method))
      .map(({ method, path }) => ({ key: `${method} ${path}`, method, path }));

    expect(mutatingRoutes.length).toBeGreaterThan(0);
    for (const { key, method, path } of mutatingRoutes) {
      if (key === 'ALL /api/auth/*' || key === 'ALL /api') {
        continue;
      }
      const requestPath = path
        .replace(':serverId', TEST_SOURCE_SERVER.id)
        .replaceAll(/:[^/]+/gu, 'placeholder');
      const requestHeaders = new Headers(headers);
      requestHeaders.set('content-type', 'text/plain');
      requestHeaders.set('origin', 'https://remdo.example');
      requestHeaders.set('sec-fetch-site', 'same-origin');
      const response = await harness.app.request(requestPath, {
        method,
        headers: requestHeaders,
        body: '{}',
      });
      expect(response.status, `${key} accepted a non-JSON mutation`)
        .toBe(HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE);
      await expect(response.json()).resolves.toEqual({ error: 'JSON content type required.' });
    }
  });

  it('returns 400 for malformed document ids before token issuance', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/documents/bad%20doc/sync-tokens', {
      method: 'POST',
      headers: createJsonHeaders(),
    });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid document id.' });
    await expect(harness.registry.getDocument('bad doc')).resolves.toBeNull();
  });

  it('returns 401 when issuing a Y-Sweet document client token without a session', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/documents/main/sync-tokens', {
      method: 'POST',
      headers: createJsonHeaders(),
    });

    expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required.' });
    await expect(harness.registry.getDocument('main')).resolves.toBeNull();
  });

  it('returns 401 for current user without a session', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/current-user');

    expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required.' });
  });

  it('accepts bearer tokens for document mutations', async () => {
    const harness = createHarness();
    harness.auth.resolveBearerUser = vi.fn(async () => ({
      email: STABLE_AUTH_USERS.bob.email,
      id: 'source-user',
      name: STABLE_AUTH_USERS.bob.name,
    }));

    const response = await harness.app.request('/api/documents', {
      method: 'POST',
      headers: {
        authorization: 'Bearer source-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'Bearer-created document' }),
    });

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toMatchObject({
      title: 'Bearer-created document',
    });
    expect(harness.auth.resolveBearerUser).toHaveBeenCalledWith('Bearer source-token');
  });

  it('rejects unknown source server link requests', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();

    const response = await harness.app.request('/api/current-user/source-servers/source/account-links', {
      method: 'POST',
      headers: createJsonHeaders(headers),
      body: '{}',
    });

    expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    await expect(response.json()).resolves.toEqual({ error: 'Source server not found.' });
  });

  it('proxies linked source current-user bootstrap with the stored source token', async () => {
    const harness = createHarnessWithSourceServer();
    harness.auth.getLinkedRemdoServerAccessToken = vi.fn(async () => 'source-token');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        homeDocumentId: 'sourceHome',
        userDataDocumentId: 'sourceUserData',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const headers = await harness.createSessionHeaders();

    const response = await harness.app.request('/api/current-user/source-servers/source/current-user', {
      headers,
    });

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toEqual({
      homeDocumentId: 'sourceHome',
      userDataDocumentId: 'sourceUserData',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://source-token.example/api/current-user', {
      headers: {
        authorization: 'Bearer source-token',
      },
    });
  });

  it('proxies linked source sync token requests with the stored source token', async () => {
    const harness = createHarnessWithSourceServer();
    harness.auth.getLinkedRemdoServerAccessToken = vi.fn(async () => 'source-token');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        baseUrl: 'https://source.example/d/sourceDoc/api',
        docId: 'sourceDoc',
        url: 'wss://source.example/d/sourceDoc',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const sessionHeaders = await harness.createSessionHeaders();
    // Send the request as a same-origin browser mutation so it also exercises
    // the CSRF middleware allowing legitimate same-origin linked-source calls.
    const requestHeaders = createJsonHeaders(sessionHeaders);
    requestHeaders.set('origin', 'https://remdo.example');
    requestHeaders.set('sec-fetch-site', 'same-origin');

    const response = await harness.app.fetch(new Request(
      'https://remdo.example/api/current-user/source-servers/source/documents/sourceDoc/sync-tokens',
      { method: 'POST', headers: requestHeaders, body: '{}' },
    ));

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toEqual({
      baseUrl: 'https://source.example/d/sourceDoc/api',
      docId: 'sourceDoc',
      url: 'wss://source.example/d/sourceDoc',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://source-token.example/api/documents/sourceDoc/sync-tokens', {
      method: 'POST',
      headers: {
        authorization: 'Bearer source-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ docId: 'sourceDoc' }),
    });
  });

  it('forwards a source server access denial as its own status, not 500', async () => {
    const harness = createHarnessWithSourceServer();
    harness.auth.getLinkedRemdoServerAccessToken = vi.fn(async () => 'source-token');
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: HTTP_STATUS.FORBIDDEN,
      json: async () => ({ error: 'Document access denied.' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const headers = await harness.createSessionHeaders();

    const response = await harness.app.request('/api/current-user/source-servers/source/documents/sourceDoc/sync-tokens', {
      method: 'POST',
      headers: createJsonHeaders(headers),
      body: '{}',
    });

    expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
  });

  it('maps an unexpected source server failure to 500', async () => {
    const harness = createHarnessWithSourceServer();
    harness.auth.getLinkedRemdoServerAccessToken = vi.fn(async () => 'source-token');
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      json: async () => ({ error: 'boom' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const headers = await harness.createSessionHeaders();

    const response = await harness.app.request('/api/current-user/source-servers/source/documents/sourceDoc/sync-tokens', {
      method: 'POST',
      headers: createJsonHeaders(headers),
      body: '{}',
    });

    expect(response.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
  });

  it('does not create a registry row when issuing a token for a missing document', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();

    const response = await harness.app.request('/api/documents/main/sync-tokens', {
      method: 'POST',
      headers: createJsonHeaders(headers),
    });

    expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    await expect(response.json()).resolves.toEqual({ error: 'Document not found.' });
    await expect(harness.registry.getDocument('main')).resolves.toBeNull();
  });

  it('reuses the existing registry row when issuing a token', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const userId = await harness.getSessionUserId(headers);
    const existing = await harness.registry.insertDocument({
      id: 'main',
      ownerUserId: userId,
      title: 'main',
    });

    const response = await harness.app.request('/api/documents/main/sync-tokens', {
      method: 'POST',
      headers: createJsonHeaders(headers),
    });
    const stored = await harness.registry.getDocument('main');

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(stored).not.toBeNull();
    expect(stored).toEqual(existing);
  });

  it('ignores forwarded headers when issuing browser-visible token URLs', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const userId = await harness.getSessionUserId(headers);
    await harness.registry.insertDocument({
      id: 'main',
      ownerUserId: userId,
      title: 'main',
    });
    const requestHeaders = createJsonHeaders(headers);
    requestHeaders.set('x-forwarded-host', 'attacker.example');
    requestHeaders.set('x-forwarded-proto', 'https');

    const response = await harness.app.request('/api/documents/main/sync-tokens', {
      method: 'POST',
      headers: requestHeaders,
    });
    const token = await response.json();
    const expectedOrigin = new URL(config.env.AUTH_URL).origin;

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(new URL(token.url).origin).toBe(expectedOrigin.replace(/^http/u, 'ws'));
    expect(new URL(token.baseUrl).origin).toBe(expectedOrigin);
  });

  it('returns stable per-user bootstrap document ids and ensures owned registry rows', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const userId = await harness.getSessionUserId(headers);

    const firstResponse = await harness.app.request('/api/current-user', { headers });
    const secondResponse = await harness.app.request('/api/current-user', { headers });
    const firstBootstrap = await firstResponse.json();
    const secondBootstrap = await secondResponse.json();

    expect(firstResponse.status).toBe(HTTP_STATUS.OK);
    expect(secondResponse.status).toBe(HTTP_STATUS.OK);
    expect(secondBootstrap).toEqual(firstBootstrap);
    await expect(harness.registry.getDocument(firstBootstrap.userDataDocumentId)).resolves.toMatchObject({
      kind: 'user-data-projection',
      ownerUserId: userId,
    });
    await expect(harness.registry.getDocument(firstBootstrap.homeDocumentId)).resolves.toMatchObject({
      kind: 'home-document',
      ownerUserId: userId,
    });
    expect(harness.readProjectedDocumentIds(firstBootstrap.userDataDocumentId)).toEqual([firstBootstrap.homeDocumentId]);
  });

  it('reports the admin role and public-server flag in the bootstrap', async () => {
    // Harness users enroll (admin) and the harness defaults to allowSignup:false.
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const bootstrap = await (await harness.app.request('/api/current-user', { headers })).json();
    expect(bootstrap).toMatchObject({ role: 'admin', publicServer: false });
  });

  it('reports a non-admin role and public flag on a public server', async () => {
    const harness = createHarness({ allowSignup: true });
    const signUp = await harness.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(STABLE_AUTH_USERS.alice),
    });
    const headers = new Headers({ cookie: extractSessionCookie(signUp) });
    const bootstrap = await (await harness.app.request('/api/current-user', { headers })).json();
    // The admin plugin assigns defaultRole 'user' on creation; only 'admin' is
    // privileged, so a normal user reads back role 'user' (not admin).
    expect(bootstrap).toMatchObject({ role: 'user', publicServer: true });
  });

  it('projects configured source servers during current-user bootstrap', async () => {
    const harness = createHarness({
      linkableRemdoServers: [
        {
          id: 'source',
          label: 'Source Server',
          baseUrl: 'https://source.example',
          clientId: 'source-client-id',
          clientSecret: 'source-client-secret',
        },
      ],
    });
    const headers = await harness.createSessionHeaders();

    const response = await harness.app.request('/api/current-user', { headers });
    const bootstrap = await response.json();

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(harness.readProjectedSourceServers(bootstrap.userDataDocumentId)).toEqual([
      {
        id: 'source',
        label: 'Source Server',
        baseUrl: 'https://source.example',
        linked: false,
      },
    ]);
  });

  it('does not recurse into source server discovery or clear projected source servers for bearer current-user bootstrap', async () => {
    const harness = createHarness({
      linkableRemdoServers: [
        {
          id: 'source',
          label: 'Source Server',
          baseUrl: 'https://source.example',
          clientId: 'source-client-id',
          clientSecret: 'source-client-secret',
        },
      ],
    });
    const headers = await harness.createSessionHeaders();
    const sessionUserId = await harness.getSessionUserId(headers);
    const initialResponse = await harness.app.request('/api/current-user', { headers });
    const initialBootstrap = await initialResponse.json();
    const projectedSourceServers = [{
      id: 'source',
      label: 'Source Server',
      baseUrl: 'https://source.example',
      linked: false,
    }];
    expect(initialResponse.status).toBe(HTTP_STATUS.OK);
    expect(harness.readProjectedSourceServers(initialBootstrap.userDataDocumentId)).toEqual(projectedSourceServers);

    harness.auth.resolveBearerUser = vi.fn(async () => ({
      email: 'server@example.com',
      id: sessionUserId,
      name: 'Server Test User',
    }));
    harness.auth.listLinkedRemdoServerIds = vi.fn(async () => {
      throw new Error('session-only linked account lookup should not run for bearer bootstrap');
    });

    const response = await harness.app.request('/api/current-user', {
      headers: {
        authorization: 'Bearer source-token',
      },
    });
    const bootstrap = await response.json();

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(bootstrap.userDataDocumentId).toBe(initialBootstrap.userDataDocumentId);
    expect(harness.readProjectedSourceServers(bootstrap.userDataDocumentId)).toEqual(projectedSourceServers);
  });

  it('returns different user data projection document ids for different users', async () => {
    const harness = createHarness();
    const aliceHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.alice);
    const bobHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.bob);

    const aliceResponse = await harness.app.request('/api/current-user', { headers: aliceHeaders });
    const bobResponse = await harness.app.request('/api/current-user', { headers: bobHeaders });
    const aliceBootstrap = await aliceResponse.json();
    const bobBootstrap = await bobResponse.json();

    expect(aliceResponse.status).toBe(HTTP_STATUS.OK);
    expect(bobResponse.status).toBe(HTTP_STATUS.OK);
    expect(bobBootstrap.userDataDocumentId).not.toBe(aliceBootstrap.userDataDocumentId);
    expect(bobBootstrap.homeDocumentId).not.toBe(aliceBootstrap.homeDocumentId);
  });

  it('allows the private document owner to issue a token', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    await insertDocumentForSession(harness, headers, 'privateDoc');

    const response = await harness.app.request('/api/documents/privateDoc/sync-tokens', {
      method: 'POST',
      headers: createJsonHeaders(headers),
    });

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toMatchObject({
      authorization: 'full',
      docId: 'privateDoc',
    });
  });

  it('allows bearer actors to issue source document sync tokens', async () => {
    const harness = createHarness();
    harness.auth.resolveBearerUser = vi.fn(async () => ({
      email: STABLE_AUTH_USERS.bob.email,
      id: 'source-user',
      name: STABLE_AUTH_USERS.bob.name,
    }));
    await harness.registry.insertDocument({
      id: 'sourceDoc',
      ownerUserId: 'source-user',
      title: 'Source document',
    });

    const response = await harness.app.request('/api/documents/sourceDoc/sync-tokens', {
      method: 'POST',
      headers: {
        authorization: 'Bearer source-token',
        'content-type': 'application/json',
      },
    });

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toMatchObject({
      authorization: 'full',
      docId: 'sourceDoc',
    });
    expect(harness.auth.resolveBearerUser).toHaveBeenCalledWith('Bearer source-token');
  });

  it('issues read-only tokens for the projected user data document', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const bootstrapResponse = await harness.app.request('/api/current-user', { headers });
    const bootstrap = await bootstrapResponse.json();

    const response = await harness.app.request(`/api/documents/${bootstrap.userDataDocumentId}/sync-tokens`, {
      method: 'POST',
      headers: createJsonHeaders(headers),
    });

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toMatchObject({
      authorization: 'read-only',
      docId: bootstrap.userDataDocumentId,
    });
  });

  it('rejects sharing projected user data documents', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const bootstrapResponse = await harness.app.request('/api/current-user', { headers });
    const bootstrap = await bootstrapResponse.json();

    const response = await harness.app.request(`/api/documents/${bootstrap.userDataDocumentId}/access`, {
      method: 'POST',
      headers: createJsonHeaders(headers),
      body: JSON.stringify({ email: STABLE_AUTH_USERS.bob.email }),
    });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    await expect(response.json()).resolves.toEqual({ error: 'Document cannot be shared.' });
  });

  it('creates user documents through the validated user document endpoint', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const bootstrapResponse = await harness.app.request('/api/current-user', { headers });
    const bootstrap = await bootstrapResponse.json();

    const response = await harness.app.request('/api/documents', {
      method: 'POST',
      headers: createJsonHeaders(headers),
      body: JSON.stringify({ title: 'New Document' }),
    });
    const document = await response.json();

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(document).toMatchObject({ title: 'New Document' });
    expect(harness.readProjectedDocumentIds(bootstrap.userDataDocumentId)).toEqual([
      bootstrap.homeDocumentId,
      document.id,
    ]);
  });

  it('returns created user documents when projection refresh fails after registry insert', async () => {
    let failProjectionRefresh = false;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const harness = createHarness({
      onUpdateDoc: () => {
        if (failProjectionRefresh) {
          throw new Error('projection refresh failed');
        }
      },
    });
    const headers = await harness.createSessionHeaders();
    const bootstrapResponse = await harness.app.request('/api/current-user', { headers });
    const bootstrap = await bootstrapResponse.json();

    failProjectionRefresh = true;
    const response = await harness.app.request('/api/documents', {
      method: 'POST',
      headers: createJsonHeaders(headers),
      body: JSON.stringify({ title: 'Projection Failure Document' }),
    });
    const document = await response.json();

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(document).toMatchObject({ title: 'Projection Failure Document' });
    await expect(harness.registry.getDocument(document.id)).resolves.toMatchObject({
      id: document.id,
      ownerUserId: await harness.getSessionUserId(headers),
      title: 'Projection Failure Document',
    });
    expect(harness.readProjectedDocumentIds(bootstrap.userDataDocumentId)).toEqual([
      bootstrap.homeDocumentId,
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('[remdo-api] Failed to refresh user data projection for user '),
      expect.any(Error),
    );
  });

  it('rejects private Y-Sweet document client token issuance for a different user', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.alice);
    const otherHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.bob);
    await insertDocumentForSession(harness, ownerHeaders, 'privateDoc');

    const response = await harness.app.request('/api/documents/privateDoc/sync-tokens', {
      method: 'POST',
      headers: createJsonHeaders(otherHeaders),
    });

    expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(response.json()).resolves.toEqual({ error: 'Document access denied.' });
  });

  it('allows a document owner to share with a local user by email', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.alice);
    const granteeHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.bob);
    await insertDocumentForSession(harness, ownerHeaders, 'shareDoc');
    const ownerBootstrapResponse = await harness.app.request('/api/current-user', { headers: ownerHeaders });
    const ownerBootstrap = await ownerBootstrapResponse.json();
    const granteeBootstrapResponse = await harness.app.request('/api/current-user', { headers: granteeHeaders });
    const granteeBootstrap = await granteeBootstrapResponse.json();
    const granteeUserId = await harness.getSessionUserId(granteeHeaders);

    const shareResponse = await harness.app.request('/api/documents/shareDoc/access', {
      method: 'POST',
      headers: createJsonHeaders(ownerHeaders),
      body: JSON.stringify({ email: STABLE_AUTH_USERS.bob.email }),
    });
    const tokenResponse = await harness.app.request('/api/documents/shareDoc/sync-tokens', {
      method: 'POST',
      headers: createJsonHeaders(granteeHeaders),
    });

    expect(shareResponse.status).toBe(HTTP_STATUS.OK);
    await expect(shareResponse.json()).resolves.toEqual({
      access: {
        documentId: 'shareDoc',
        email: STABLE_AUTH_USERS.bob.email,
        granteeUserId,
        name: STABLE_AUTH_USERS.bob.name,
      },
    });
    expect(harness.readProjectedDocumentAccess(ownerBootstrap.userDataDocumentId, 'shareDoc')).toEqual([
      {
        documentId: 'shareDoc',
        email: STABLE_AUTH_USERS.bob.email,
        granteeUserId,
        name: STABLE_AUTH_USERS.bob.name,
      },
    ]);
    expect(harness.readProjectedDocumentIds(granteeBootstrap.userDataDocumentId)).toContain('shareDoc');
    expect(tokenResponse.status).toBe(HTTP_STATUS.OK);
    await expect(tokenResponse.json()).resolves.toMatchObject({
      authorization: 'full',
      docId: 'shareDoc',
    });
  });

  it('allows a document owner to share with a local user by mixed-case email', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.alice);
    const granteeHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.bob);
    await insertDocumentForSession(harness, ownerHeaders, 'mixedCaseShareDoc');
    const granteeUserId = await harness.getSessionUserId(granteeHeaders);

    const response = await harness.app.request('/api/documents/mixedCaseShareDoc/access', {
      method: 'POST',
      headers: createJsonHeaders(ownerHeaders),
      body: JSON.stringify({ email: 'Bob@Example.test' }),
    });

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toEqual({
      access: {
        documentId: 'mixedCaseShareDoc',
        email: STABLE_AUTH_USERS.bob.email,
        granteeUserId,
        name: STABLE_AUTH_USERS.bob.name,
      },
    });
  });

  it('rejects sharing with an unknown user email', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.alice);
    await insertDocumentForSession(harness, ownerHeaders, 'shareDoc');

    const response = await harness.app.request('/api/documents/shareDoc/access', {
      method: 'POST',
      headers: createJsonHeaders(ownerHeaders),
      body: JSON.stringify({ email: 'missing@example.test' }),
    });

    expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    await expect(response.json()).resolves.toEqual({ error: 'User not found.' });
  });

  it('rejects sharing documents with their owner', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.alice);
    await insertDocumentForSession(harness, ownerHeaders, 'shareDoc');

    const response = await harness.app.request('/api/documents/shareDoc/access', {
      method: 'POST',
      headers: createJsonHeaders(ownerHeaders),
      body: JSON.stringify({ email: STABLE_AUTH_USERS.alice.email }),
    });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    await expect(response.json()).resolves.toEqual({ error: 'Owners cannot share documents with themselves.' });
  });

  it('rejects document access grants for non-owners', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.alice);
    const otherHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.bob);
    await insertDocumentForSession(harness, ownerHeaders, 'shareDoc');

    const grantResponse = await harness.app.request('/api/documents/shareDoc/access', {
      method: 'POST',
      headers: createJsonHeaders(otherHeaders),
      body: JSON.stringify({ email: STABLE_AUTH_USERS.alice.email }),
    });

    expect(grantResponse.status).toBe(HTTP_STATUS.NOT_FOUND);
    await expect(grantResponse.json()).resolves.toEqual({ error: 'Document not found.' });
  });

  it('rejects direct grants for projected user data documents', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.alice);
    const requesterHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.bob);
    const bootstrapResponse = await harness.app.request('/api/current-user', { headers: ownerHeaders });
    const bootstrap = await bootstrapResponse.json();

    const grant = await harness.registry.grantDocumentAccess(
      bootstrap.userDataDocumentId,
      await harness.getSessionUserId(ownerHeaders),
      await harness.getSessionUserId(requesterHeaders),
    );
    const response = await harness.app.request(`/api/documents/${bootstrap.userDataDocumentId}/sync-tokens`, {
      method: 'POST',
      headers: createJsonHeaders(requesterHeaders),
    });

    expect(grant).toBeNull();
    expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(response.json()).resolves.toEqual({ error: 'Document access denied.' });
  });

  it('rejects admin provisioning with a missing or wrong admin secret', async () => {
    const harness = createHarness();

    const missingResponse = await harness.app.request('/api/admin/enroll', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(STABLE_AUTH_USERS.alice),
    });
    const wrongResponse = await harness.app.request('/api/admin/enroll', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        adminSecret: 'wrong-admin-secret',
        ...STABLE_AUTH_USERS.alice,
      }),
    });

    expect(missingResponse.status).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'Admin secret is invalid.' });
    expect(wrongResponse.status).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(wrongResponse.json()).resolves.toEqual({ error: 'Admin secret is invalid.' });
    await expect(harness.auth.getUserCount()).resolves.toBe(0);
  });

  it('rejects admin provisioning when no admin secret is configured', async () => {
    const harness = createHarness({ adminSecret: '' });

    const response = await harness.app.request('/api/admin/enroll', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        adminSecret: TEST_ADMIN_SECRET,
        ...STABLE_AUTH_USERS.alice,
      }),
    });

    expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(response.json()).resolves.toEqual({ error: 'Admin secret is invalid.' });
    await expect(harness.auth.getUserCount()).resolves.toBe(0);
  });

  it('keeps public signup disabled when admin provisioning is available', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(STABLE_AUTH_USERS.alice),
    });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    await expect(harness.auth.getUserCount()).resolves.toBe(0);
  });

  it('allows proxied sign-in requests against the public auth origin', async () => {
    const harness = createHarness({
      baseURL: 'https://remdo.localhost:4007',
    });

    await harness.app.request('/api/admin/enroll', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        adminSecret: TEST_ADMIN_SECRET,
        ...STABLE_AUTH_USERS.alice,
      }),
    });

    const response = await harness.app.fetch(new Request('http://127.0.0.1:4018/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: '127.0.0.1:4018',
        origin: 'https://remdo.localhost:4007',
        'x-forwarded-host': 'remdo.localhost:4007',
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify({
        email: STABLE_AUTH_USERS.alice.email,
        password: STABLE_AUTH_USERS.alice.password,
      }),
    }));

    expect(response.status).toBe(HTTP_STATUS.OK);
  });

  it('allows admin provisioning for additional users', async () => {
    const harness = createHarness();
    await harness.createSessionHeaders();

    const response = await harness.app.request('/api/admin/enroll', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        adminSecret: TEST_ADMIN_SECRET,
        ...STABLE_AUTH_USERS.alice,
      }),
    });

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(harness.auth.getUserCount()).resolves.toBe(2);
  });

  it('stores auth users and document registry rows in the shared database client', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const userId = await harness.getSessionUserId(headers);

    await harness.registry.insertDocument({
      id: 'sharedStorageDoc',
      ownerUserId: userId,
      title: 'Shared Storage',
    });

    const authUser = await harness.database.db
      .selectFrom('user')
      .select('id')
      .where('id', '=', userId)
      .executeTakeFirst();
    const document = await harness.registry.getDocument('sharedStorageDoc');

    expect(authUser).toEqual({ id: userId });
    expect(document).toMatchObject({
      id: 'sharedStorageDoc',
      ownerUserId: userId,
    });
  });

  it('reports API readiness in the health response', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/health');

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('returns the API not found response for the bare API root', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api');

    expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ error: 'API route not found.' });
  });
});
