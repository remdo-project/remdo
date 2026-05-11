import { afterEach, describe, expect, it } from 'vitest';
import { TEST_ADMIN_SECRET, createServerAppHarness } from './_support/server-app-harness';

const harnesses: Array<ReturnType<typeof createServerAppHarness>> = [];

afterEach(() => {
  for (const harness of harnesses) {
    harness.cleanup();
  }
  harnesses.length = 0;
});

function createHarness() {
  const harness = createServerAppHarness();
  harnesses.push(harness);
  return harness;
}

describe('remdo api app', () => {
  it('returns 400 for malformed document ids before token issuance', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/documents/bad%20doc/token', {
      method: 'POST',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid document id.' });
    await expect(harness.registry.getDocument('bad doc')).resolves.toBeNull();
  });

  it('returns 401 when issuing a document token without a session', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/documents/main/token', {
      method: 'POST',
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required.' });
    await expect(harness.registry.getDocument('main')).resolves.toBeNull();
  });

  it('creates a registry row when issuing a token for a missing document', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();

    const response = await harness.app.request('/api/documents/main/token', {
      method: 'POST',
      headers,
    });
    const token = await response.json();

    expect(response.status).toBe(200);
    expect(token).toMatchObject({ docId: 'main' });
    expect(token.baseUrl).toContain('/d/main');
    expect(token.url).toContain('/d/main');
    await expect(harness.registry.getDocument('main')).resolves.toMatchObject({
      accessMode: 'private',
      id: 'main',
    });
  });

  it('reuses the existing registry row when issuing a token', async () => {
    const harness = createHarness();
    const headers = await harness.createSessionHeaders();
    const existing = await harness.registry.ensureDocument('main');

    const response = await harness.app.request('/api/documents/main/token', {
      method: 'POST',
      headers,
    });
    const stored = await harness.registry.getDocument('main');

    expect(response.status).toBe(200);
    expect(stored).not.toBeNull();
    expect(stored).toEqual(existing);
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

    expect(missingResponse.status).toBe(403);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'Admin secret is invalid.' });
    expect(wrongResponse.status).toBe(403);
    await expect(wrongResponse.json()).resolves.toEqual({ error: 'Admin secret is invalid.' });
    expect(harness.auth.getUserCount()).toBe(0);
  });

  it('rejects admin provisioning when no admin secret is configured', async () => {
    const harness = createServerAppHarness({ adminSecret: '' });
    harnesses.push(harness);

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

    expect(response.status).toBe(403);
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

    expect(response.status).toBe(400);
    expect(harness.auth.getUserCount()).toBe(0);
  });

  it('allows proxied sign-in requests against the public auth origin', async () => {
    const harness = createServerAppHarness({
      baseURL: 'https://remdo.localhost:4007',
    });
    harnesses.push(harness);

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

    expect(response.status).toBe(200);
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

    expect(response.status).toBe(200);
    expect(harness.auth.getUserCount()).toBe(2);
  });

  it('reports database readiness in the health response', async () => {
    const harness = createHarness();

    const response = await harness.app.request('/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      db: 'ok',
      ok: true,
    });
  });
});
