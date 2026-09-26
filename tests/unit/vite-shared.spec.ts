import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createServer } from 'vite';
import WebSocket, { WebSocketServer } from 'ws';
import { describe, expect, it } from 'vitest';
import { createViteSharedConfig } from '../../config/vite/shared';

describe('vite shared config', () => {
  it('forwards app pages and normal HTTP routes to Django', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-vite-routes-'));
    fs.mkdirSync(path.join(root, 'public/playground'), { recursive: true });
    fs.writeFileSync(path.join(root, 'public/playground/index.html'), '<h1>Explorer</h1>');
    fs.writeFileSync(path.join(root, 'public/logo.svg'), '<svg/>');
    const receivedHeaders: http.IncomingHttpHeaders[] = [];
    const djangoPages: Record<string, string> = { '/about/': 'Public page from Django' };
    for (const url of ['/', '/n/example', '/sign-out', '/dev/lexical-demo']) djangoPages[url] = 'App page from Django';
    const backend = http.createServer((req, res) => {
      receivedHeaders.push(req.headers);
      const page = djangoPages[req.url!.split('?')[0]!];
      res.statusCode = page ? 200 : 404;
      res.setHeader('Cache-Control', 'no-store');
      res.end(page ?? 'Django not found');
    });
    await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
    const target = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;
    const shared = createViteSharedConfig();
    const proxy = Object.fromEntries(Object.entries(shared.server.proxy)
      .map(([route, options]) => [route, { ...options, target }]));
    const server = await createServer({
      ...shared,
      configFile: false as const,
      root,
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { proxy, host: '127.0.0.1', port: 0, watch: null, hmr: false as const },
    });
    try {
      await server.listen();
      const origin = server.resolvedUrls!.local[0]!;
      for (const url of ['/oauth/consent', '/oauth/consent/', '/unknown/', '/description/', '/doc/control', '/.well-known/missing', '/unknown.json', '/unknown/?campaign=test']) {
        const response = await fetch(new URL(url, origin), { headers: { Accept: 'text/html' } });
        expect(response.status, url).toBe(404);
        expect(response.headers.get('cache-control'), url).toBe('no-store');
        expect(await response.text(), url).toBe('Django not found');
      }
      const explorer = await fetch(new URL('/playground/index.html', origin));
      expect(explorer.status).toBe(200);
      expect(await explorer.text()).toContain('<h1>Explorer</h1>');
      const logo = await fetch(new URL('/logo.svg?version=1', origin));
      expect(await logo.text()).toBe('<svg/>');
      for (const url of ['/internal/collaboration/documents/private/authorize', '/%69nternal/collaboration/documents/private/content']) {
        const before = receivedHeaders.length;
        const response = await fetch(new URL(url, origin));
        expect(response.status).toBe(404);
        expect(receivedHeaders).toHaveLength(before);
      }
      const page = await fetch(new URL('/about/', origin), { headers: {
        'X-Remdo-Collaboration-Secret': 'must-not-forward',
        'X-Remdo-Collaboration-Operator': 'must-not-forward',
        Origin: origin,
      } });
      expect(receivedHeaders.at(-1)?.['x-remdo-collaboration-secret']).toBeUndefined();
      expect(receivedHeaders.at(-1)?.['x-remdo-collaboration-operator']).toBeUndefined();
      expect(receivedHeaders.at(-1)?.origin).toBe(origin);
      expect(page.status).toBe(200);
      expect(await page.text()).toBe('Public page from Django');
      for (const url of ['/', '/?next=%2Fn%2Fexample', '/n/example', '/n/example?note=1', '/sign-out', '/dev/lexical-demo']) {
        const response = await fetch(new URL(url, origin), { headers: { Accept: 'text/html' } });
        expect(response.status, url).toBe(200);
        expect(await response.text(), url).toBe('App page from Django');
      }
    } finally {
      await server.close();
      await new Promise<void>((resolve, reject) => backend.close((error) => error ? reject(error) : resolve()));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('protects collaboration upgrade headers', async () => {
    const backend = http.createServer();
    const sockets = new WebSocketServer({ server: backend });
    sockets.on('connection', (socket, request) => socket.send(JSON.stringify(request.headers)));
    await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-vite-upgrade-'));
    const shared = createViteSharedConfig();
    const proxy = Object.fromEntries(Object.entries(shared.server.proxy)
      .map(([route, options]) => [route, { ...options, target: `http://127.0.0.1:${(backend.address() as AddressInfo).port}` }]));
    const options = {
      ...shared, configFile: false as const, root,
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { proxy, host: '127.0.0.1', port: 0, watch: null, hmr: false as const },
    };
    const gateway = await createServer(options);
    let client: WebSocket | undefined;
    try {
      await gateway.listen();
      const origin = gateway.resolvedUrls!.local[0]!;
      const url = new URL('/collaboration', origin);
      url.protocol = 'ws:';
      client = new WebSocket(url, { headers: {
        Origin: origin,
        Cookie: 'sessionid=browser-session',
        'X-Remdo-Collaboration-Secret': 'untrusted',
        'X-Remdo-Collaboration-Operator': 'untrusted',
      } });
      const headers = await new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
        client!.once('message', (data) => resolve(JSON.parse(String(data)) as http.IncomingHttpHeaders));
        client!.once('error', reject);
      });
      expect(headers.origin).toBe(origin);
      expect(headers.cookie).toBe('sessionid=browser-session');
      expect(headers['x-remdo-collaboration-secret']).toBeUndefined();
      expect(headers['x-remdo-collaboration-operator']).toBeUndefined();
    } finally {
      client?.terminate();
      for (const socket of sockets.clients) socket.terminate();
      await gateway.close();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve) => backend.close(() => resolve()));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('forwards MCP requests to the MCP server and other routes to Django', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-vite-mcp-'));
    const listen = (body: string) => {
      const server = http.createServer((_req, res) => res.end(body));
      return new Promise<http.Server>((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
    };
    const [django, mcp] = await Promise.all([listen('django'), listen('mcp')]);
    const address = (server: http.Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const shared = createViteSharedConfig();
    const proxy = Object.fromEntries(Object.entries(shared.server.proxy).map(([route, options]) =>
      [route, { ...options, target: route.includes('/mcp') ? address(mcp) : address(django) }]));
    const server = await createServer({
      ...shared,
      configFile: false as const,
      root,
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { proxy, host: '127.0.0.1', port: 0, watch: null, hmr: false as const },
    });
    try {
      await server.listen();
      const origin = server.resolvedUrls!.local[0]!;
      const read = async (url: string) => (await fetch(new URL(url, origin), { method: 'POST' })).text();
      expect(await read('/mcp')).toBe('mcp');
      expect(await read('/mcp-docs')).toBe('django');
      expect(await read('/.well-known/oauth-protected-resource/mcp')).toBe('django');
    }
    finally {
      await server.close();
      await Promise.all([django, mcp].map((backend) => new Promise<void>((resolve) => backend.close(() => resolve()))));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
