/* eslint-disable node/no-process-env */
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => new Promise((resolve) => server.close(resolve))));
});

async function startIngest() {
  const envelopes: string[] = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => { body += chunk; });
    request.on('end', () => {
      envelopes.push(body);
      response.end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const events = () => envelopes.flatMap((envelope) => {
    const [, itemHeader, item] = envelope.split('\n');
    return (JSON.parse(itemHeader!) as { type: string }).type === 'event' ? [JSON.parse(item!)] : [];
  });
  return { dsn: `http://publickey@127.0.0.1:${port}/7`, events };
}

async function runServerProcess(failure: 'throw' | 'reject', message: string, env: NodeJS.ProcessEnv) {
  const child = spawn('pnpm', ['exec', 'tsx', 'tests/unit/_support/server-failure.ts', failure, message], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  const status = await new Promise<number | null>((resolve) => child.on('exit', resolve));
  return { status, stderr };
}

describe('server error reporting', () => {
  it.each([
    ['uncaught exceptions', 'throw'],
    ['unhandled rejections', 'reject'],
  ] as const)('reports %s before the process fails', async (_, failure) => {
    const ingest = await startIngest();

    const result = await runServerProcess(failure, 'reported-server-failure', {
      NODE_ENV: 'production',
      SENTRY_DSN: ingest.dsn,
      APP_ORIGIN: 'https://remdo.example',
      BUILD_REVISION: 'reporting-test-revision',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('reported-server-failure');
    expect(ingest.events()).toMatchObject([{
      exception: { values: [{ type: 'Error', value: 'reported-server-failure' }] },
      release: 'reporting-test-revision',
      environment: 'remdo.example',
    }]);
  });

  it('stays inactive under test runs', async () => {
    const ingest = await startIngest();

    const result = await runServerProcess('throw', 'unreported-failure', {
      NODE_ENV: 'test',
      SENTRY_DSN: ingest.dsn,
      APP_ORIGIN: 'https://remdo.example',
    });

    expect(result.status).toBe(1);
    expect(ingest.events()).toEqual([]);
  });
});
