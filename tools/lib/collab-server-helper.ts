import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';

import { config } from '#config';
import { resolveLoopbackHost } from '#lib/net/loopback';
import { isPortOpen } from './net';
import { spawnPnpm } from './process';

const MAX_ATTEMPTS = 50;
const POLL_INTERVAL = 100;
const LOG_PATH = path.join(config.env.DATA_DIR, 'logs/collab-server.log');
const COLLAB_DATA_DIR = path.join(config.env.DATA_DIR, 'collab');

function terminateProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.killed) {
    return;
  }

  if (child.pid && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fallback to direct child kill when group signaling fails.
    }
  }

  child.kill(signal);
}

function ensureLogStream(): fs.WriteStream {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  return fs.createWriteStream(LOG_PATH, { flags: 'w' });
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

export async function ensureCollabServer(allowReuse = true): Promise<StopCollabServer | undefined> {
  const resolvedHost = config.env.HOST;
  const resolvedPort = config.env.COLLAB_SERVER_PORT;
  const probeHost = resolveLoopbackHost(resolvedHost, '127.0.0.1');

  if (allowReuse && (await isPortOpen(probeHost, resolvedPort))) {
    return undefined;
  }

  const logStream = ensureLogStream();
  fs.mkdirSync(COLLAB_DATA_DIR, { recursive: true });
  const child = spawnPnpm(
    [
      'exec',
      'y-sweet',
      'serve',
      '--host',
      resolvedHost,
      '--port',
      String(resolvedPort),
      COLLAB_DATA_DIR,
    ],
    {
      env: {
        HOST: resolvedHost,
        COLLAB_SERVER_PORT: String(resolvedPort),
        COLLAB_ENABLED: 'true',
      },
      detached: true,
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
    terminateProcessGroup(child, 'SIGTERM');
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
    terminateProcessGroup(child, 'SIGTERM');
    await once(child, 'exit');
    await cleanup();
    throw error;
  }

  return async () => {
    terminateProcessGroup(child, 'SIGTERM');
    await once(child, 'exit');
    await cleanup();
  };
}
