import { inspectRoutes } from 'hono/dev';
import { describe, expect, it } from 'vitest';
import { HTTP_STATUS } from '#platform/http/status';
import { STABLE_AUTH_USERS } from '#tools/stable-auth-users';
import { createTestResource } from '../_support/test-resource';
import { TEST_ADMIN_SECRET, createServerAppHarness } from './_support/server-app-harness';

const createHarness = createTestResource(createServerAppHarness);

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

function createSharingHeaders(headers: Headers): Headers {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('content-type', 'application/json');
  requestHeaders.set('x-remdo-action', 'sharing');
  return requestHeaders;
}

function createSourceServerHeaders(headers: Headers): Headers {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('content-type', 'application/json');
  requestHeaders.set('x-remdo-action', 'source-server-link');
  return requestHeaders;
}

describe('remdo api app', () => {
  it('registers the browser-facing API route inventory', () => {
    const harness = createHarness();

    expect(inspectRoutes(harness.app).map(({ method, path }) => `${method} ${path}`)).toEqual([
      'ALL /api/auth/*',
      'GET /.well-known/openid-configuration',
      'GET /.well-known/oauth-authorization-server',
      'GET /api/health',
      'GET /api/current-user',
      'GET /api/current-user/source-servers',
      'POST /api/current-user/source-servers/:serverId/account-links',
      'POST /api/documents',
      'GET /api/documents/:docId/access',
      'POST /api/documents/:docId/access',
      'POST /api/documents/:docId/sync-tokens',
      'POST /api/admin/users',
    ]);
  });

  it('returns 400 for malformed document ids before token issuance', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/documents/bad%20doc/sync-tokens', {
      method: 'POST',
    });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid document id.' });
    await expect(harness.registry.getDocument('bad doc')).resolves.toBeNull();
  });

  it('returns 401 when issuing a Y-Sweet document client token without a session', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/documents/main/sync-tokens', {
      method: 'POST',
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

  it('lists configured source servers for signed-in users', async () => {
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

    const response = await harness.app.request('/api/current-user/source-servers', { headers });

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toEqual({
      servers: [
        {
          id: 'source',
          label: 'Source Server',
          baseUrl: 'https://source.example',
          linked: false,
        },
      ],
    });
  });

  it('rejects source server listing without a session', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/current-user/source-servers');

    expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required.' });
  });

  it('rejects source server link mutations without the link action header', async () => {
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
    const requestHeaders = new Headers(headers);
    requestHeaders.set('content-type', 'application/json');

    const response = await harness.app.request('/api/current-user/source-servers/source/account-links', {
      method: 'POST',
      headers: requestHeaders,
      body: '{}',
    });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid source server link request.' });
  });

  it('rejects unknown source server link requests', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();

    const response = await harness.app.request('/api/current-user/source-servers/source/account-links', {
      method: 'POST',
      headers: createSourceServerHeaders(headers),
      body: '{}',
    });

    expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    await expect(response.json()).resolves.toEqual({ error: 'Source server not found.' });
  });

  it('does not create a registry row when issuing a token for a missing document', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();

    const response = await harness.app.request('/api/documents/main/sync-tokens', {
      method: 'POST',
      headers,
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
      headers,
    });
    const stored = await harness.registry.getDocument('main');

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(stored).not.toBeNull();
    expect(stored).toEqual(existing);
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
      headers,
    });

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toMatchObject({
      authorization: 'full',
      docId: 'privateDoc',
    });
  });

  it('issues read-only tokens for the projected user data document', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const bootstrapResponse = await harness.app.request('/api/current-user', { headers });
    const bootstrap = await bootstrapResponse.json();

    const response = await harness.app.request(`/api/documents/${bootstrap.userDataDocumentId}/sync-tokens`, {
      method: 'POST',
      headers,
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
      headers: createSharingHeaders(headers),
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
    const requestHeaders = new Headers(headers);
    requestHeaders.set('content-type', 'application/json');

    const response = await harness.app.request('/api/documents', {
      method: 'POST',
      headers: requestHeaders,
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
    const requestHeaders = new Headers(headers);
    requestHeaders.set('content-type', 'application/json');

    failProjectionRefresh = true;
    const response = await harness.app.request('/api/documents', {
      method: 'POST',
      headers: requestHeaders,
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
  });

  it('rejects private Y-Sweet document client token issuance for a different user', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.alice);
    const otherHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.bob);
    await insertDocumentForSession(harness, ownerHeaders, 'privateDoc');

    const response = await harness.app.request('/api/documents/privateDoc/sync-tokens', {
      method: 'POST',
      headers: otherHeaders,
    });

    expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(response.json()).resolves.toEqual({ error: 'Document access denied.' });
  });

  it('allows a document owner to share with a local user by email', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.alice);
    const granteeHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.bob);
    await insertDocumentForSession(harness, ownerHeaders, 'shareDoc');
    const granteeBootstrapResponse = await harness.app.request('/api/current-user', { headers: granteeHeaders });
    const granteeBootstrap = await granteeBootstrapResponse.json();
    const granteeUserId = await harness.getSessionUserId(granteeHeaders);

    const shareResponse = await harness.app.request('/api/documents/shareDoc/access', {
      method: 'POST',
      headers: createSharingHeaders(ownerHeaders),
      body: JSON.stringify({ email: STABLE_AUTH_USERS.bob.email }),
    });
    const listResponse = await harness.app.request('/api/documents/shareDoc/access', {
      headers: ownerHeaders,
    });
    const tokenResponse = await harness.app.request('/api/documents/shareDoc/sync-tokens', {
      method: 'POST',
      headers: granteeHeaders,
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
    expect(listResponse.status).toBe(HTTP_STATUS.OK);
    await expect(listResponse.json()).resolves.toEqual({
      access: [{
        documentId: 'shareDoc',
        email: STABLE_AUTH_USERS.bob.email,
        granteeUserId,
        name: STABLE_AUTH_USERS.bob.name,
      }],
    });
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
      headers: createSharingHeaders(ownerHeaders),
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
      headers: createSharingHeaders(ownerHeaders),
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
      headers: createSharingHeaders(ownerHeaders),
      body: JSON.stringify({ email: STABLE_AUTH_USERS.alice.email }),
    });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    await expect(response.json()).resolves.toEqual({ error: 'Owners cannot share documents with themselves.' });
  });

  it('rejects document access listing and grants for non-owners', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.alice);
    const otherHeaders = await harness.createSessionHeaders(STABLE_AUTH_USERS.bob);
    await insertDocumentForSession(harness, ownerHeaders, 'shareDoc');

    const listResponse = await harness.app.request('/api/documents/shareDoc/access', {
      headers: otherHeaders,
    });
    const grantResponse = await harness.app.request('/api/documents/shareDoc/access', {
      method: 'POST',
      headers: createSharingHeaders(otherHeaders),
      body: JSON.stringify({ email: STABLE_AUTH_USERS.alice.email }),
    });

    expect(listResponse.status).toBe(HTTP_STATUS.NOT_FOUND);
    await expect(listResponse.json()).resolves.toEqual({ error: 'Document not found.' });
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
      headers: requesterHeaders,
    });

    expect(grant).toBeNull();
    expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(response.json()).resolves.toEqual({ error: 'Document access denied.' });
  });

  it('rejects sharing mutations without the sharing action header', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders();
    await insertDocumentForSession(harness, ownerHeaders, 'shareDoc');
    const requestHeaders = new Headers(ownerHeaders);
    requestHeaders.set('content-type', 'application/json');

    const response = await harness.app.request('/api/documents/shareDoc/access', {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ email: STABLE_AUTH_USERS.bob.email }),
    });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid sharing request.' });
  });

  it('rejects cross-origin sharing mutations', async () => {
    const harness = createHarness();
    const requestHeaders = new Headers();
    requestHeaders.set('content-type', 'application/json');
    requestHeaders.set('origin', 'https://evil.example');
    requestHeaders.set('x-remdo-action', 'sharing');

    const response = await harness.app.fetch(new Request('https://remdo.example/api/documents/shareDoc/access', {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ email: STABLE_AUTH_USERS.bob.email }),
    }));

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid sharing request.' });
  });

  it('rejects admin provisioning with a missing or wrong admin secret', async () => {
    const harness = createHarness();

    const missingResponse = await harness.app.request('/api/admin/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(STABLE_AUTH_USERS.alice),
    });
    const wrongResponse = await harness.app.request('/api/admin/users', {
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

    const response = await harness.app.request('/api/admin/users', {
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

    await harness.app.request('/api/admin/users', {
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

    const response = await harness.app.request('/api/admin/users', {
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
});
