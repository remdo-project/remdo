import { once } from 'node:events';
import net from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';

import { config } from '#config';
import { resolveLoopbackHost } from '#lib/net/loopback';
import { spawnPnpm } from './process';

const MAX_ATTEMPTS = 50;
const POLL_INTERVAL = 100;

async function isPortOpen(host: string, port: number): Promise<boolean> {
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

async function waitForPort(host: string, port: number): Promise<void> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (await isPortOpen(host, port)) {
      return;
    }
    await wait(POLL_INTERVAL);
  }

  throw new Error(`Collaboration websocket failed to start on ws://${host}:${port}`);
}
export type StopCollabServer = () => Promise<void>;

export async function ensureCollabServer(): Promise<StopCollabServer | undefined> {
  const resolvedHost = config.env.HOST;
  const resolvedPort = config.env.COLLAB_SERVER_PORT;
  const probeHost = resolveLoopbackHost(resolvedHost, '127.0.0.1');

  if (await isPortOpen(probeHost, resolvedPort)) {
    return undefined;
  }

  const child = spawnPnpm(
    ['exec', 'y-sweet', 'serve', '--host', resolvedHost, '--port', String(resolvedPort)],
    {
      env: {
        HOST: resolvedHost,
        COLLAB_SERVER_PORT: String(resolvedPort),
        COLLAB_ENABLED: 'true',
      },
      forwardExit: false,
    },
  );

  try {
    await waitForPort(probeHost, resolvedPort);
  } catch (error) {
    child.kill('SIGTERM');
    await once(child, 'exit');
    throw error;
  }

  return async () => {
    child.kill('SIGTERM');
    await once(child, 'exit');
  };
}
