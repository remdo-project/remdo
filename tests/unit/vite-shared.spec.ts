import { describe, expect, it } from 'vitest';
import { isApiRequestPath } from '../../tools/vite/remdo-api-dev-plugin';
import { createViteSharedConfig } from '../../vite.shared';

describe('vite shared config', () => {
  it('mounts the RemDo API in dev and proxies sync routes only', () => {
    const config = createViteSharedConfig();
    const serverProxy = config.server.proxy;
    const previewProxy = config.preview.proxy;

    expect(config.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'remdo-api-dev' }),
    ]));
    expect(serverProxy).not.toHaveProperty('/api');
    expect(serverProxy['/d']).toMatchObject({
      changeOrigin: true,
      ws: true,
    });
    expect(serverProxy).not.toHaveProperty('/doc');

    expect(previewProxy['/api']).toMatchObject({
      changeOrigin: true,
      xfwd: true,
    });
    expect(previewProxy['/d']).toMatchObject({
      changeOrigin: true,
      ws: true,
    });
    expect(previewProxy).not.toHaveProperty('/doc');
  });

  it('recognizes only API request paths for the dev API middleware', () => {
    expect(isApiRequestPath('/api')).toBe(true);
    expect(isApiRequestPath('/api/health')).toBe(true);
    expect(isApiRequestPath('/api/me?x=1')).toBe(true);
    expect(isApiRequestPath('/.well-known/openid-configuration')).toBe(true);
    expect(isApiRequestPath('/.well-known/oauth-authorization-server')).toBe(true);
    expect(isApiRequestPath('/app/api/me')).toBe(false);
    expect(isApiRequestPath('/apiary')).toBe(false);
    expect(isApiRequestPath()).toBe(false);
  });
});
