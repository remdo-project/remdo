import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { expect, it } from 'vitest';
import { errorReportForwarding } from '../../config/vite/error-report-forwarding';

it('forwards development error reports to the project envelope endpoint without client headers', async () => {
  const received: { path: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  const ingest = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', () => {
      received.push({ path: req.url!, headers: req.headers, body });
      res.writeHead(429, { 'X-Sentry-Rate-Limits': '60:error' }).end();
    });
  });
  await new Promise<void>((resolve) => ingest.listen(0, '127.0.0.1', resolve));
  const { port } = ingest.address() as AddressInfo;
  const server = await createServer({
    configFile: false,
    root: fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-vite-reports-')),
    plugins: [errorReportForwarding(`http://publickey@127.0.0.1:${port}/prefix/7`)],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  });
  try {
    await server.listen();
    const response = await fetch(new URL('/api/error-reports', server.resolvedUrls!.local[0]), {
      method: 'POST',
      body: '{}\n{"type":"event"}\n{}\n',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Cookie': 'remdo_session=private-session',
        'Referer': 'http://127.0.0.1/n/document?code=private-query',
        'X-Forwarded-For': '198.51.100.7',
      },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('x-sentry-rate-limits')).toBe('60:error');
    const [forwarded] = received as [typeof received[number]];
    expect(received).toHaveLength(1);
    expect(forwarded.path).toBe('/prefix/api/7/envelope/');
    expect(forwarded.body).toBe('{}\n{"type":"event"}\n{}\n');
    expect(forwarded.headers['content-type']).toBe('application/x-sentry-envelope');
    expect(forwarded.headers).not.toHaveProperty('cookie');
    expect(forwarded.headers).not.toHaveProperty('referer');
    expect(forwarded.headers).not.toHaveProperty('x-forwarded-for');
  } finally {
    await server.close();
    await new Promise((resolve) => ingest.close(resolve));
  }
});
