import { afterEach, describe, expect, it } from 'vitest';
import { createServerApp } from '@/server/app';
import { createDocumentRegistryHarness } from './_support/document-registry-harness';

const harnesses: Array<ReturnType<typeof createDocumentRegistryHarness>> = [];

afterEach(() => {
  for (const harness of harnesses) {
    harness.cleanup();
  }
  harnesses.length = 0;
});

function createRegistry() {
  const harness = createDocumentRegistryHarness();
  harnesses.push(harness);
  return harness.registry;
}

function createDocumentManagerStub() {
  const calls: Array<{ authorization: 'full' | 'read-only' | undefined; docId: string }> = [];

  return {
    calls,
    async getOrCreateDocAndToken(docId: string, authDocRequest?: { authorization?: 'full' | 'read-only' }) {
      calls.push({
        authorization: authDocRequest?.authorization,
        docId,
      });
      return {
        baseUrl: 'http://127.0.0.1:4004/d/main',
        docId,
        token: 'token',
        url: 'ws://127.0.0.1:4004/d/main',
      };
    },
  };
}

describe('remdo api app', () => {
  it('returns 400 for malformed document ids before token issuance', async () => {
    const registry = createRegistry();
    const manager = createDocumentManagerStub();
    const app = createServerApp({
      manager,
      registry,
      logError: () => {},
    });

    const response = await app.request('/api/documents/bad%20doc/token', {
      method: 'POST',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid document id.' });
    await expect(registry.getDocument('bad doc')).resolves.toBeNull();
    expect(manager.calls).toEqual([]);
  });

  it('creates a registry row when issuing a token for a missing document', async () => {
    const registry = createRegistry();
    const manager = createDocumentManagerStub();
    const app = createServerApp({ manager, registry, logError: () => {} });

    const response = await app.request('/api/documents/main/token', {
      method: 'POST',
    });
    const token = await response.json();

    expect(response.status).toBe(200);
    expect(token).toMatchObject({ docId: 'main' });
    expect(token.baseUrl).toContain('/d/main');
    expect(token.url).toContain('/d/main');
    await expect(registry.getDocument('main')).resolves.toMatchObject({
      accessMode: 'private',
      id: 'main',
    });
    expect(manager.calls).toEqual([{ authorization: 'full', docId: 'main' }]);
  });

  it('reuses the existing registry row when issuing a token', async () => {
    const registry = createRegistry();
    const existing = await registry.ensureDocument('main');
    const manager = createDocumentManagerStub();
    const app = createServerApp({ manager, registry, logError: () => {} });

    const response = await app.request('/api/documents/main/token', {
      method: 'POST',
    });
    const stored = await registry.getDocument('main');

    expect(response.status).toBe(200);
    expect(stored).not.toBeNull();
    expect(stored).toEqual(existing);
    expect(manager.calls).toEqual([{ authorization: 'full', docId: 'main' }]);
  });

  it('reports database readiness in the health response', async () => {
    const registry = createRegistry();
    const app = createServerApp({
      manager: createDocumentManagerStub(),
      registry,
      logError: () => {},
    });

    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      db: 'ok',
      ok: true,
    });
  });
});
