import { describe, expect, it, vi } from 'vitest';
import { createServerApp } from '@/server/app';

describe('remdo api app', () => {
  it('returns 400 for malformed document ids before token issuance', async () => {
    const manager = {
      getOrCreateDocAndToken: vi.fn(),
    };
    const app = createServerApp({
      manager,
      logError: vi.fn(),
    });

    const response = await app.request('/api/documents/bad%20doc/token', {
      method: 'POST',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid document id.' });
    expect(manager.getOrCreateDocAndToken).not.toHaveBeenCalled();
  });
});
