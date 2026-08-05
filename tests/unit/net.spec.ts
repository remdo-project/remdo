import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { waitForPortOpen } from '../../tools/lib/net';

async function listen(server: net.Server, port: number): Promise<number> {
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return (server.address() as net.AddressInfo).port;
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('waitForPortOpen', () => {
  it('waits until the port accepts connections', async () => {
    // Reserve an ephemeral port, release it, then reopen it while the wait polls.
    const probe = net.createServer();
    const port = await listen(probe, 0);
    await close(probe);

    const pending = waitForPortOpen('127.0.0.1', port, { attempts: 50, pollIntervalMs: 10 });
    const server = net.createServer();
    await listen(server, port);
    await expect(pending).resolves.toBe(true);
    await close(server);
  });

  it('gives up when the port never opens within the attempt budget', async () => {
    const probe = net.createServer();
    const port = await listen(probe, 0);
    await close(probe);

    await expect(waitForPortOpen('127.0.0.1', port, { attempts: 2, pollIntervalMs: 0 }))
      .resolves.toBe(false);
  });
});
