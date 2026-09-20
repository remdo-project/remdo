import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createServer, preview } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { createViteSharedConfig } from '../../config/vite/shared';
import { resolveLocalGatewayOrigin } from '../../src/platform/net/origins';

describe('vite shared config', () => {
  it.each(['development', 'preview'] as const)('forwards normal HTTP routes and preserves SPA routes in %s', async (mode) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-vite-routes-'));
    const html = '<!doctype html><div id="root">App shell</div>';
    fs.mkdirSync(path.join(root, 'dist'));
    fs.mkdirSync(path.join(root, 'public/playground'), { recursive: true });
    fs.writeFileSync(path.join(root, 'public/playground/index.html'), '<h1>Explorer</h1>');
    for (const directory of ['public', 'dist']) {
      fs.writeFileSync(path.join(root, directory, 'manifest.webmanifest'), '{"name":"Test app"}');
    }
    fs.writeFileSync(path.join(root, 'index.html'), html);
    fs.writeFileSync(path.join(root, 'dist/index.html'), html);
    const backend = http.createServer((req, res) => {
      res.statusCode = req.url === '/about/' ? 200 : 404;
      res.setHeader('Cache-Control', 'no-store');
      res.end(req.url === '/about/' ? 'Public page from Django' : 'Django not found');
    });
    await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
    const target = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;
    const shared = createViteSharedConfig();
    const proxy = Object.fromEntries(Object.entries(mode === 'development' ? shared.server.proxy : shared.preview.proxy)
      .map(([route, options]) => [route, { ...options, target }]));
    const options = {
      ...shared,
      configFile: false as const,
      root,
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { proxy, host: '127.0.0.1', port: 0, watch: null, hmr: false as const },
      preview: { proxy, host: '127.0.0.1', port: 0 },
    };
    const server = mode === 'development' ? await createServer(options) : await preview(options);
    try {
      if ('listen' in server) await server.listen();
      const origin = server.resolvedUrls!.local[0]!;
      for (const url of ['/oauth/consent', '/oauth/consent/', '/unknown/', '/description/', '/doc/control', '/.well-known/missing', '/unknown.json', '/unknown/?campaign=test']) {
        const response = await fetch(new URL(url, origin), { headers: { Accept: 'text/html' } });
        expect(response.status, url).toBe(404);
        expect(response.headers.get('cache-control'), url).toBe('no-store');
        expect(await response.text(), url).toBe('Django not found');
      }
      for (const url of ['/dev/lexical-demo', '/dev/lexical-demo?probe=1']) {
        const response = await fetch(new URL(url, origin), { headers: { Accept: 'text/html' } });
        if (mode === 'development') {
          expect(response.status, url).toBe(200);
          expect(await response.text(), url).toContain('<div id="root">App shell</div>');
        } else {
          expect(response.status, url).toBe(404);
          expect(await response.text(), url).toBe('Django not found');
        }
      }
      if (mode === 'development') {
        const explorer = await fetch(new URL('/playground/index.html', origin));
        expect(explorer.status).toBe(200);
        expect(await explorer.text()).toContain('<h1>Explorer</h1>');
      } else {
        const explorer = await fetch(new URL('/playground/index.html', origin));
        expect(explorer.status).toBe(404);
        expect(await explorer.text()).toBe('Django not found');
      }
      const manifest = await fetch(new URL('/manifest.webmanifest?version=1', origin));
      expect(await manifest.json()).toEqual({ name: 'Test app' });
      const page = await fetch(new URL('/about/', origin));
      expect(page.status).toBe(200);
      expect(await page.text()).toBe('Public page from Django');
      for (const url of ['/', '/sharing', '/n/example']) {
        const response = await fetch(new URL(url, origin), { headers: { Accept: 'text/html' } });
        expect(response.status, url).toBe(200);
        expect(await response.text(), url).toContain('<div id="root">App shell</div>');
      }
    } finally {
      await server.close();
      await new Promise<void>((resolve, reject) => backend.close((error) => error ? reject(error) : resolve()));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('proxies Django and sync routes through the development gateway', () => {
    const config = createViteSharedConfig();
    const serverProxy = config.server.proxy;
    const previewProxy = config.preview.proxy;

    expect(serverProxy['/']).toMatchObject({ changeOrigin: false });
    expect(serverProxy['^/d(?:/|$|\\?)']).toMatchObject({
      changeOrigin: true,
      ws: true,
    });

    expect(config.preview.host).toBe('127.0.0.1');

    expect(previewProxy['/']).toMatchObject({
      changeOrigin: true,
      target: resolveLocalGatewayOrigin(),
      xfwd: true,
    });
    expect(previewProxy['/src/client/ui/styles/']).toMatchObject({
      target: resolveLocalGatewayOrigin(),
      changeOrigin: true,
    });
    expect(previewProxy['^/d(?:/|$|\\?)']).toMatchObject({
      changeOrigin: true,
      target: resolveLocalGatewayOrigin(),
      ws: true,
    });
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
      expect(previewProxy['/']).toMatchObject({
        target: `http://127.0.0.1:${config.env.PORT}`,
      });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

});
