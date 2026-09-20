import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createServer, preview } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { createViteSharedConfig } from '../../config/vite/shared';

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
      for (const url of ['/', '/?next=%2Fsharing', '/sharing', '/n/example', '/n/example?note=1', '/sign-out', '/sign-out/']) {
        const response = await fetch(new URL(url, origin), { headers: { Accept: 'text/html' } });
        expect(response.status, url).toBe(200);
        expect(await response.text(), url).toContain('<div id="root">App shell</div>');
      }
      // Production Caddy serves the shell for every `/n/` suffix; the router
      // renders its own miss. Dev and preview must not diverge from it.
      for (const url of ['/n/', '/n/a/b']) {
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

  // Collaboration upgrades and the preview forwarded-header pass-through have no
  // behavioral coverage here: the routing tests below use plain HTTP requests.
  it('upgrades collaboration routes and forwards preview client addresses', () => {
    const config = createViteSharedConfig();

    expect(config.server.proxy['^/d(?:/|$|\\?)']).toMatchObject({ ws: true });
    expect(config.preview.proxy['^/d(?:/|$|\\?)']).toMatchObject({ ws: true });
    expect(config.preview.proxy['/']).toMatchObject({ xfwd: true });
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
