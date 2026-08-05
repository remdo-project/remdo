import { describe, expect, it, vi } from 'vitest';
import { config as runtimeConfig } from '../../config';
import { isApiRequestPath } from '../../config/vite/remdo-api-dev-plugin';
import { createViteSharedConfig, pwaNavigationFallbackDenylist } from '../../config/vite/shared';
import { resolveLocalGatewayOrigin } from '../../src/platform/net/origins';

describe('vite shared config', () => {
  it('mounts the RemDo API in dev and proxies sync routes only', () => {
    const config = createViteSharedConfig();
    const serverProxy = config.server.proxy;
    const previewProxy = config.preview.proxy;

    expect(config.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'remdo-api-dev' }),
      expect.objectContaining({ name: 'remdo-dev-spa-routes' }),
    ]));
    expect(serverProxy).not.toHaveProperty('/api');
    expect(serverProxy['/d']).toMatchObject({
      changeOrigin: true,
      ws: true,
    });
    expect(serverProxy).not.toHaveProperty('/doc');

    expect(config.preview.host).toBe('127.0.0.1');

    expect(previewProxy['/.well-known']).toMatchObject({
      changeOrigin: true,
      headers: { origin: runtimeConfig.env.APP_PUBLIC_URL },
      target: resolveLocalGatewayOrigin(),
      xfwd: true,
    });
    expect(previewProxy['/api']).toMatchObject({
      changeOrigin: true,
      headers: { origin: runtimeConfig.env.APP_PUBLIC_URL },
      target: resolveLocalGatewayOrigin(),
      xfwd: true,
    });
    expect(previewProxy['/d']).toMatchObject({
      changeOrigin: true,
      headers: { origin: runtimeConfig.env.APP_PUBLIC_URL },
      target: resolveLocalGatewayOrigin(),
      ws: true,
    });
    expect(previewProxy).not.toHaveProperty('/doc');
  });

  it('keeps API-backed preview routes out of the PWA navigation fallback', () => {
    const isDenied = (path: string) => pwaNavigationFallbackDenylist.some((pattern) => pattern.test(path));

    expect(isDenied('/.well-known/openid-configuration')).toBe(true);
    expect(isDenied('/.well-known/oauth-authorization-server')).toBe(true);
    expect(isDenied('/api/current-user')).toBe(true);
    expect(isDenied('/d/document-id')).toBe(true);
    expect(isDenied('/documents')).toBe(false);
  });

  it('routes preview traffic locally while preserving the canonical public origin', async () => {
    vi.stubEnv('HOST', '0.0.0.0');
    vi.stubEnv('PUBLIC_HOST', 'browser-visible.test');
    vi.resetModules();

    try {
      const [{ config }, { createViteSharedConfig: createIsolatedConfig }] = await Promise.all([
        import('../../config'),
        import('../../config/vite/shared'),
      ]);
      const previewProxy = createIsolatedConfig().preview.proxy;

      expect(config.env.APP_PUBLIC_URL).toBe(`http://browser-visible.test:${config.env.PORT}`);
      expect(previewProxy['/api']).toMatchObject({
        headers: { origin: config.env.APP_PUBLIC_URL },
        target: `http://127.0.0.1:${config.env.PORT}`,
      });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('recognizes only API request paths for the dev API middleware', () => {
    expect(isApiRequestPath('/api')).toBe(true);
    expect(isApiRequestPath('/api/health')).toBe(true);
    expect(isApiRequestPath('/api/current-user?x=1')).toBe(true);
    expect(isApiRequestPath('/.well-known/openid-configuration')).toBe(true);
    expect(isApiRequestPath('/.well-known/oauth-authorization-server')).toBe(true);
    expect(isApiRequestPath('/app/api/current-user')).toBe(false);
    expect(isApiRequestPath('/apiary')).toBe(false);
    expect(isApiRequestPath()).toBe(false);
  });
});
