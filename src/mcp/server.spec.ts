import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { createMcpServer } from './server';

let currentUserStatus: number;
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

async function start() {
  const django = http.createServer((_req, res) => res.writeHead(currentUserStatus).end('{}'));
  await new Promise<void>((resolve) => django.listen(0, '127.0.0.1', resolve));
  stops.push(() => new Promise((resolve) => django.close(() => resolve())));
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(probe.address() as AddressInfo).port}`;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const server = createMcpServer({
    origin,
    apiOrigin: `http://127.0.0.1:${(django.address() as AddressInfo).port}`,
    appOrigin: 'https://remdo.example',
  });
  await server.listen();
  stops.push(server.stop);
  return (authorization?: string, body?: unknown) => fetch(new URL('/mcp', origin), {
    method: 'POST',
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      ...(body === undefined ? {} : { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

it('challenges missing and rejected tokens but reports an unavailable RemDo as unavailable', async () => {
  const post = await start();
  const metadata = 'resource_metadata="https://remdo.example/.well-known/oauth-protected-resource/mcp"';

  const missing = await post();
  expect(missing.status).toBe(401);
  expect(missing.headers.get('WWW-Authenticate')).toBe(`Bearer ${metadata}`);

  currentUserStatus = 401;
  const rejected = await post('Bearer stale');
  expect(rejected.status).toBe(401);
  expect(rejected.headers.get('WWW-Authenticate')).toBe(`Bearer ${metadata}, error="invalid_token"`);

  currentUserStatus = 502;
  expect((await post('Bearer valid')).status).toBe(503);

  await stops.shift()!();
  expect((await post('Bearer valid')).status).toBe(503);
});

it('identifies itself with the app icon so clients do not guess it from a favicon', async () => {
  const post = await start();
  currentUserStatus = 200;

  const response = await post('Bearer valid', {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  });

  const data = (await response.text()).split('\n').find((line) => line.startsWith('data: '))!;
  const { result } = JSON.parse(data.slice('data: '.length)) as { result: { serverInfo: unknown } };
  expect(result.serverInfo).toMatchObject({
    title: 'RemDo',
    websiteUrl: 'https://remdo.example',
    icons: [
      { src: 'https://remdo.example/icon-192.png', mimeType: 'image/png', sizes: ['192x192'] },
      { src: 'https://remdo.example/logo.svg', mimeType: 'image/svg+xml', sizes: ['any'] },
    ],
  });
});
