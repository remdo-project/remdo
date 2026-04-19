import { describe, expect, it } from 'vitest';
import { createViteSharedConfig } from '../../vite.shared';

describe('vite shared config', () => {
  it('proxies the RemDo API and sync routes but not document control routes', () => {
    const config = createViteSharedConfig();
    const serverProxy = config.server.proxy;
    const previewProxy = config.preview.proxy;

    expect(serverProxy['/api/documents']).toMatchObject({
      changeOrigin: true,
      xfwd: true,
    });
    expect(serverProxy['/d']).toMatchObject({
      changeOrigin: true,
      ws: true,
    });
    expect(serverProxy).not.toHaveProperty('/doc');

    expect(previewProxy['/api/documents']).toMatchObject({
      changeOrigin: true,
      xfwd: true,
    });
    expect(previewProxy['/d']).toMatchObject({
      changeOrigin: true,
      ws: true,
    });
    expect(previewProxy).not.toHaveProperty('/doc');
  });
});
