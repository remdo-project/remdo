import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { SUBPROCESS_TEST_TIMEOUT_MS, VITEST_DEFAULT_TEST_TIMEOUT_MS } from './_support/timeouts';

describe('headless provider destruction', () => {
  it.each(['native', 'ws'])('releases a pending %s handshake', (transport) => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import { createServer } from 'node:http';
      import { once } from 'node:events';
      import { createProviderFactory } from './src/collaboration/runtime.ts';
      const WebSocket = ${transport === 'ws' ? "(await import('ws')).WebSocket" : 'globalThis.WebSocket'};
      const server = createServer();
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const { provider, doc } = createProviderFactory({
        visibleOrigin: 'http://127.0.0.1:' + server.address().port,
        WebSocketPolyfill: WebSocket,
      })('pending', new Map());

      server.once('upgrade', (_request, socket) => {
        // Leave the handshake unanswered, but do not let the fixture keep Node alive.
        socket.unref();
        server.unref();
        provider.destroy();
        doc.destroy();
        console.log('destroyed');
      });
      void provider.connect();
    `], { encoding: 'utf8', timeout: VITEST_DEFAULT_TEST_TIMEOUT_MS });

    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe('destroyed');
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  }, SUBPROCESS_TEST_TIMEOUT_MS);
});
