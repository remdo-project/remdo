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
const LOG_DIR = path.join(config.env.DATA_DIR, 'logs');
const LOG_PATH = path.join(LOG_DIR, 'collab-server.log');
const COLLAB_DATA_DIR = path.join(config.env.DATA_DIR, 'collab');
const reusedServerStop = () => Promise.resolve();

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
  fs.mkdirSync(LOG_DIR, { recursive: true });
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

interface CollabServerOptions {
  port?: number;
}

export async function ensureCollabServer({
  port = config.env.COLLAB_SERVER_PORT,
}: CollabServerOptions = {}): Promise<StopCollabServer> {
  const resolvedHost = config.env.HOST;
  const resolvedPort = port;
  const probeHost = resolveLoopbackHost(resolvedHost);

  if (await isPortOpen(probeHost, resolvedPort)) {
    return reusedServerStop;
  }

  const logStream = ensureLogStream();
  fs.mkdirSync(COLLAB_DATA_DIR, { recursive: true });
  const args = [
    'exec',
    'y-sweet',
    'serve',
    '--host',
    resolvedHost,
    '--port',
    String(resolvedPort),
  ];
  if (config.env.YSWEET_AUTH_KEY) {
    args.push('--auth', config.env.YSWEET_AUTH_KEY);
  }
  args.push(COLLAB_DATA_DIR);

  const child = spawnPnpm(
    args,
    {
      env: {
        HOST: resolvedHost,
        COLLAB_SERVER_PORT: String(resolvedPort),
        COLLAB_ENABLED: 'true',
        YSWEET_AUTH_KEY: config.env.YSWEET_AUTH_KEY,
        YSWEET_SERVER_TOKEN: config.env.YSWEET_SERVER_TOKEN,
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

  const cleanup = () => {
    for (const event of teardownSignals) {
      process.off(event, onSignal);
    }
    logStream.end();
  };
  const stop = async () => {
    terminateProcessGroup(child, 'SIGTERM');
    await once(child, 'exit');
    cleanup();
  };

  try {
    await waitForPort(probeHost, resolvedPort);
  } catch (error) {
    await stop();
    throw error;
  }

  return stop;
}
