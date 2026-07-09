import { describe, expect, it } from 'vitest';
import { DEV_LEXICAL_DEMO_ROUTE } from '#client/app/dev/dev-route';
import { isDevSpaFallbackPath } from '../../config/vite/remdo-dev-spa-routes-plugin';
import { isApiRequestPath } from '../../config/vite/remdo-api-dev-plugin';
import { createViteSharedConfig, pwaNavigationFallbackDenylist } from '../../config/vite/shared';

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

    expect(previewProxy['/.well-known']).toMatchObject({
      changeOrigin: true,
      xfwd: true,
    });
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

  it('keeps API-backed preview routes out of the PWA navigation fallback', () => {
    const isDenied = (path: string) => pwaNavigationFallbackDenylist.some((pattern) => pattern.test(path));

    expect(isDenied('/.well-known/openid-configuration')).toBe(true);
    expect(isDenied('/.well-known/oauth-authorization-server')).toBe(true);
    expect(isDenied('/api/current-user')).toBe(true);
    expect(isDenied('/d/document-id')).toBe(true);
    expect(isDenied('/documents')).toBe(false);
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

  it('recognizes dedicated dev SPA routes for direct navigation', () => {
    expect(isDevSpaFallbackPath(DEV_LEXICAL_DEMO_ROUTE)).toBe(true);
    expect(isDevSpaFallbackPath(`${DEV_LEXICAL_DEMO_ROUTE}?x=1`)).toBe(true);
    expect(isDevSpaFallbackPath('/dev')).toBe(false);
    expect(isDevSpaFallbackPath('/dev/other')).toBe(false);
    expect(isDevSpaFallbackPath(`${DEV_LEXICAL_DEMO_ROUTE}/extra`)).toBe(false);
    expect(isDevSpaFallbackPath()).toBe(false);
  });
});
