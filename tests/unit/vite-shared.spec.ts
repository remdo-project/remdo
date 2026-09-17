import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, preview } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { createViteSharedConfig } from '../../config/vite/shared';
import { resolveLocalGatewayOrigin } from '../../src/platform/net/origins';

describe('vite shared config', () => {
  it.each(['development', 'preview'] as const)('returns server 404s for retired consent routes in %s', async (mode) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-vite-routes-'));
    const html = '<!doctype html><div id="root">App shell</div>';
    fs.mkdirSync(path.join(root, 'dist'));
    fs.writeFileSync(path.join(root, 'index.html'), html);
    fs.writeFileSync(path.join(root, 'dist/index.html'), html);
    const shared = createViteSharedConfig();
    const options = {
      ...shared,
      configFile: false as const,
      root,
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0, watch: null, hmr: false as const },
      preview: { host: '127.0.0.1', port: 0 },
    };
    const server = mode === 'development' ? await createServer(options) : await preview(options);
    try {
      if ('listen' in server) await server.listen();
      const origin = server.resolvedUrls!.local[0]!;
      for (const url of ['/oauth/consent', '/oauth/consent/', '/oauth/consent?client_id=example', '/oauth/consent/?client_id=example']) {
        const response = await fetch(new URL(url, origin), { headers: { Accept: 'text/html' } });
        expect(response.status, url).toBe(404);
        expect(response.headers.get('cache-control'), url).toBe('no-store');
        expect(await response.text(), url).toBe('Not Found');
      }
      for (const url of ['/', '/sharing', '/n/example']) {
        const response = await fetch(new URL(url, origin), { headers: { Accept: 'text/html' } });
        expect(response.status, url).toBe(200);
        expect(await response.text(), url).toContain('<div id="root">App shell</div>');
      }
    } finally {
      await server.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('proxies Django and sync routes through the development gateway', () => {
    const config = createViteSharedConfig();
    const serverProxy = config.server.proxy;
    const previewProxy = config.preview.proxy;

    expect(config.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'remdo-dev-spa-routes' }),
    ]));
    expect(serverProxy['/api']).toMatchObject({ changeOrigin: false });
    expect(serverProxy['/admin']).toEqual(serverProxy['/api']);
    expect(serverProxy['/accounts']).toEqual(serverProxy['/api']);
    expect(serverProxy['/d']).toMatchObject({
      changeOrigin: true,
      ws: true,
    });
    expect(serverProxy).not.toHaveProperty('/doc');

    expect(config.preview.host).toBe('127.0.0.1');

    expect(previewProxy['/.well-known']).toMatchObject({
      changeOrigin: true,
      target: resolveLocalGatewayOrigin(),
      xfwd: true,
    });
    expect(previewProxy['/.well-known']).not.toHaveProperty('headers');
    expect(previewProxy['/api']).toMatchObject({
      changeOrigin: true,
      target: resolveLocalGatewayOrigin(),
      xfwd: true,
    });
    expect(previewProxy['/api']).not.toHaveProperty('headers');
    expect(previewProxy['/accounts']).toMatchObject({ target: resolveLocalGatewayOrigin() });
    expect(previewProxy['/src/client/ui/styles/']).toMatchObject({
      target: resolveLocalGatewayOrigin(),
      changeOrigin: true,
    });
    expect(previewProxy['/d']).toMatchObject({
      changeOrigin: true,
      target: resolveLocalGatewayOrigin(),
      ws: true,
    });
    expect(previewProxy['/d']).not.toHaveProperty('headers');
    expect(previewProxy).not.toHaveProperty('/doc');
  });

  it('routes preview traffic locally without replacing the browser origin', async () => {
    vi.stubEnv('HOST', '0.0.0.0');
    vi.stubEnv('PUBLIC_HOST', 'browser-visible.test');
    vi.stubEnv('PORT', '4300');
    vi.stubEnv('APP_ORIGIN', 'http://browser-visible.test:4300');
    vi.resetModules();

    try {
      const [{ config }, { createViteSharedConfig: createIsolatedConfig }] = await Promise.all([
        import('../../config'),
        import('../../config/vite/shared'),
      ]);
      const previewProxy = createIsolatedConfig().preview.proxy;

      expect(config.env.APP_ORIGIN).toBe(`http://browser-visible.test:${config.env.PORT}`);
      expect(previewProxy['/api']).toMatchObject({
        target: `http://127.0.0.1:${config.env.PORT}`,
      });
      expect(previewProxy['/api']).not.toHaveProperty('headers');
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

});
