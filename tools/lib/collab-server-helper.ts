import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';

import { config } from '#config';
import { resolveLoopbackHost } from '#lib/net/loopback';
import { DATA_DIR } from './data-paths';
import { spawnPnpm } from './process';

const MAX_ATTEMPTS = 50;
const POLL_INTERVAL = 100;
const LOG_PATH = path.join(DATA_DIR, 'logs/collab-server.log');
const DATA_PATH = path.join(DATA_DIR, 'collab');

function ensureLogStream(): fs.WriteStream {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  return fs.createWriteStream(LOG_PATH, { flags: 'w' });
}

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

  const logStream = ensureLogStream();
  fs.mkdirSync(DATA_PATH, { recursive: true });
  const child = spawnPnpm(
    [
      'exec',
      'y-sweet',
      'serve',
      '--host',
      resolvedHost,
      '--port',
      String(resolvedPort),
      DATA_PATH,
    ],
    {
      env: {
        HOST: resolvedHost,
        COLLAB_SERVER_PORT: String(resolvedPort),
        COLLAB_ENABLED: 'true',
      },
      forwardExit: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  if (child.stdout) {
    child.stdout.pipe(logStream, { end: false });
  }
  if (child.stderr) {
    child.stderr.pipe(logStream, { end: false });
  }

  const teardownSignals = ['exit', 'SIGINT', 'SIGTERM'] as const;
  const onSignal = () => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  };
  for (const event of teardownSignals) {
    process.on(event, onSignal);
  }

  const cleanup = async () => {
    for (const event of teardownSignals) {
      process.off(event, onSignal);
    }
    logStream.end();
  };

  try {
    await waitForPort(probeHost, resolvedPort);
  } catch (error) {
    child.kill('SIGTERM');
    await once(child, 'exit');
    await cleanup();
    throw error;
  }

  return async () => {
    child.kill('SIGTERM');
    await once(child, 'exit');
    await cleanup();
  };
}
