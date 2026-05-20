import { describe, expect, it } from 'vitest';
import { config } from '#config';
import { HTTP_STATUS } from '#lib/http/status';
import { createTestResource } from '../_support/test-resource';
import { TEST_ADMIN_SECRET, createServerAppHarness } from './_support/server-app-harness';

const createHarness = createTestResource(createServerAppHarness);

async function withDevMode<T>(run: () => Promise<T>): Promise<T> {
  const originalIsDev = config.isDev;
  Object.defineProperty(config, 'isDev', { value: true });
  try {
    return await run();
  } finally {
    Object.defineProperty(config, 'isDev', { value: originalIsDev });
  }
}

describe('remdo api app', () => {
  it('returns 400 for malformed document ids before token issuance', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/documents/bad%20doc/token', {
      method: 'POST',
    });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid document id.' });
    await expect(harness.registry.getDocument('bad doc')).resolves.toBeNull();
  });

  it('returns 401 when issuing a document token without a session', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/documents/main/token', {
      method: 'POST',
    });

    expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required.' });
    await expect(harness.registry.getDocument('main')).resolves.toBeNull();
  });

  it('returns 401 for profile without a session', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/profile');

    expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required.' });
  });

  it('creates a registry row when issuing a token for a missing document', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const userId = await harness.getSessionUserId(headers);

    const response = await harness.app.request('/api/documents/main/token', {
      method: 'POST',
      headers,
    });
    const token = await response.json();

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(token).toMatchObject({ docId: 'main' });
    expect(token.baseUrl).toContain('/d/main');
    expect(token.url).toContain('/d/main');
    await expect(harness.registry.getDocument('main')).resolves.toMatchObject({
      accessMode: 'private',
      id: 'main',
      ownerUserId: userId,
    });
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

    const response = await harness.app.request('/api/documents/main/token', {
      method: 'POST',
      headers,
    });
    const stored = await harness.registry.getDocument('main');

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(stored).not.toBeNull();
    expect(stored).toEqual(existing);
  });

  it('returns stable per-user profile document ids and ensures owned registry rows', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const userId = await harness.getSessionUserId(headers);

    const firstResponse = await harness.app.request('/api/profile', { headers });
    const secondResponse = await harness.app.request('/api/profile', { headers });
    const firstProfile = await firstResponse.json();
    const secondProfile = await secondResponse.json();

    expect(firstResponse.status).toBe(HTTP_STATUS.OK);
    expect(secondResponse.status).toBe(HTTP_STATUS.OK);
    expect(secondProfile).toEqual(firstProfile);
    await expect(harness.registry.getDocument(firstProfile.configDocumentId)).resolves.toMatchObject({
      kind: 'user-config',
      ownerUserId: userId,
    });
    await expect(harness.registry.getDocument(firstProfile.homeDocumentId)).resolves.toMatchObject({
      kind: 'home-document',
      ownerUserId: userId,
    });
    expect(harness.readProjectedDocumentIds(firstProfile.configDocumentId)).toEqual([firstProfile.homeDocumentId]);
  });

  it('returns different config document ids for different users', async () => {
    const harness = createHarness();
    const firstHeaders = await harness.createSessionHeaders({
      email: 'first@example.com',
      name: 'First User',
      password: 'first-password-1234',
    });
    const secondHeaders = await harness.createSessionHeaders({
      email: 'second@example.com',
      name: 'Second User',
      password: 'second-password-1234',
    });

    const firstResponse = await harness.app.request('/api/profile', { headers: firstHeaders });
    const secondResponse = await harness.app.request('/api/profile', { headers: secondHeaders });
    const firstProfile = await firstResponse.json();
    const secondProfile = await secondResponse.json();

    expect(firstResponse.status).toBe(HTTP_STATUS.OK);
    expect(secondResponse.status).toBe(HTTP_STATUS.OK);
    expect(secondProfile.configDocumentId).not.toBe(firstProfile.configDocumentId);
    expect(secondProfile.homeDocumentId).not.toBe(firstProfile.homeDocumentId);
  });

  it('allows the private document owner to issue a token', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();

    const response = await harness.app.request('/api/documents/privateDoc/token', {
      method: 'POST',
      headers,
    });

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toMatchObject({
      authorization: 'full',
      docId: 'privateDoc',
    });
  });

  it('issues read-only tokens for the projected user config document', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const profileResponse = await harness.app.request('/api/profile', { headers });
    const profile = await profileResponse.json();

    const response = await harness.app.request(`/api/documents/${profile.configDocumentId}/token`, {
      method: 'POST',
      headers,
    });

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toMatchObject({
      authorization: 'read-only',
      docId: profile.configDocumentId,
    });
  });

  it('creates listed documents through the validated user document endpoint', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const profileResponse = await harness.app.request('/api/profile', { headers });
    const profile = await profileResponse.json();
    const requestHeaders = new Headers(headers);
    requestHeaders.set('content-type', 'application/json');

    const response = await harness.app.request('/api/profile/documents', {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ title: 'New Document' }),
    });
    const document = await response.json();

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(document).toMatchObject({ title: 'New Document' });
    expect(harness.readProjectedDocumentIds(profile.configDocumentId)).toEqual([
      profile.homeDocumentId,
      document.id,
    ]);
  });

  it('returns created listed documents when projection refresh fails after registry insert', async () => {
    let failProjectionRefresh = false;
    const harness = createHarness({
      onUpdateDoc: () => {
        if (failProjectionRefresh) {
          throw new Error('projection refresh failed');
        }
      },
    });
    const headers = await harness.createSessionHeaders();
    const profileResponse = await harness.app.request('/api/profile', { headers });
    const profile = await profileResponse.json();
    const requestHeaders = new Headers(headers);
    requestHeaders.set('content-type', 'application/json');

    failProjectionRefresh = true;
    const response = await harness.app.request('/api/profile/documents', {
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
    expect(harness.readProjectedDocumentIds(profile.configDocumentId)).toEqual([
      profile.homeDocumentId,
    ]);
  });

  it('rejects private document token issuance for a different user', async () => {
    const harness = createHarness();
    const ownerHeaders = await harness.createSessionHeaders({
      email: 'owner@example.com',
      name: 'Owner User',
      password: 'owner-password-1234',
    });
    const otherHeaders = await harness.createSessionHeaders({
      email: 'other@example.com',
      name: 'Other User',
      password: 'other-password-1234',
    });
    await harness.app.request('/api/documents/privateDoc/token', {
      method: 'POST',
      headers: ownerHeaders,
    });

    const response = await harness.app.request('/api/documents/privateDoc/token', {
      method: 'POST',
      headers: otherHeaders,
    });

    expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(response.json()).resolves.toEqual({ error: 'Document access denied.' });
  });

  it('rejects admin provisioning with a missing or wrong admin secret', async () => {
    const harness = createHarness();

    const missingResponse = await harness.app.request('/api/admin/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'owner@example.com',
        name: 'Owner',
        password: 'owner-password-1234',
      }),
    });
    const wrongResponse = await harness.app.request('/api/admin/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        adminSecret: 'wrong-admin-secret',
        email: 'owner@example.com',
        name: 'Owner',
        password: 'owner-password-1234',
      }),
    });

    expect(missingResponse.status).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'Admin secret is invalid.' });
    expect(wrongResponse.status).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(wrongResponse.json()).resolves.toEqual({ error: 'Admin secret is invalid.' });
    expect(harness.auth.getUserCount()).toBe(0);
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
        email: 'owner@example.com',
        name: 'Owner',
        password: 'owner-password-1234',
      }),
    });

    expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(response.json()).resolves.toEqual({ error: 'Admin secret is invalid.' });
    expect(harness.auth.getUserCount()).toBe(0);
  });

  it('keeps public signup disabled when admin provisioning is available', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'owner@example.com',
        name: 'Owner',
        password: 'owner-password-1234',
      }),
    });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(harness.auth.getUserCount()).toBe(0);
  });

  it('rejects development login outside development mode', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/dev/login');

    expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(response.json()).resolves.toEqual({ error: 'Development login is unavailable.' });
  });

  it('always redirects development login to home', async () => {
    await withDevMode(async () => {
      const harness = createHarness();

      const response = await harness.app.request('/api/dev/login');

      expect(response.status).toBe(HTTP_STATUS.SEE_OTHER);
      expect(response.headers.get('location')).toBe('/home');
      expect(response.headers.get('set-cookie')).toContain('better-auth.session_token=');
      expect(harness.auth.getUserCount()).toBe(1);
    });
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
        email: 'owner@example.com',
        name: 'Owner',
        password: 'owner-password-1234',
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
        email: 'owner@example.com',
        password: 'owner-password-1234',
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
        email: 'another@example.com',
        name: 'Another User',
        password: 'another-password-1234',
      }),
    });

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(harness.auth.getUserCount()).toBe(2);
  });

  it('reports database readiness in the health response', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/health');

    expect(response.status).toBe(HTTP_STATUS.OK);
    await expect(response.json()).resolves.toEqual({
      db: 'ok',
      ok: true,
    });
  });
});
