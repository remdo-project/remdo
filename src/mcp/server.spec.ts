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
  return (authorization?: string) => fetch(new URL('/mcp', origin), {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
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
