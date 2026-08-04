import net from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';

export async function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect(port, host);

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
  });
}

interface WaitForPortOpenOptions {
  attempts?: number;
  pollIntervalMs?: number;
}

/** Poll until the port accepts connections; false when the attempt budget runs out. */
export async function waitForPortOpen(
  host: string,
  port: number,
  { attempts = 150, pollIntervalMs = 100 }: WaitForPortOpenOptions = {},
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isPortOpen(host, port)) {
      return true;
    }
    await wait(pollIntervalMs);
  }
  return false;
}
