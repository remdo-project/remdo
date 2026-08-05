import net from 'node:net';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { waitForPortOpen } from '../../tools/lib/net';

async function listen(server: net.Server): Promise<number> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return (server.address() as net.AddressInfo).port;
}

async function close(server: net.Server): Promise<void> {
  server.close();
  await once(server, 'close');
}

describe('waitForPortOpen', () => {
  it('detects a port accepting connections', async () => {
    const server = net.createServer();
    const port = await listen(server);

    await expect(waitForPortOpen('127.0.0.1', port)).resolves.toBe(true);
    await close(server);
  });

  it('gives up when the port never opens within the attempt budget', async () => {
    await expect(waitForPortOpen('127.0.0.1', 0, { attempts: 2, pollIntervalMs: 0 }))
      .resolves.toBe(false);
  });
});
