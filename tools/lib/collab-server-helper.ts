import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';

import { config } from '#config';
import { resolveLoopbackHost } from '#platform/net/loopback';
import { isPortOpen } from './net';
import { spawnPnpm } from './process';

const MAX_ATTEMPTS = 150;
const POLL_INTERVAL = 100;
const LOG_DIR = path.join(config.env.DATA_DIR, 'logs');
const LOG_PATH = path.join(LOG_DIR, 'collab-server.log');
const COLLAB_DATA_DIR = path.join(config.env.DATA_DIR, 'collab');
const reusedServerStop = () => Promise.resolve();

function resolveYSweetBindHost(host: string): string {
  return host === 'localhost' ? '127.0.0.1' : host;
}

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

function readRecentLog(): string {
  try {
    return fs.readFileSync(LOG_PATH, 'utf8').trim().slice(-2000);
  } catch {
    return '';
  }
}
export type StopCollabServer = () => Promise<void>;

interface CollabServerOptions {
  port?: number;
  reuseExisting?: boolean;
}

export async function ensureCollabServer({
  port = config.env.COLLAB_SERVER_PORT,
  reuseExisting = true,
}: CollabServerOptions = {}): Promise<StopCollabServer> {
  const resolvedHost = config.env.HOST;
  const bindHost = resolveYSweetBindHost(resolvedHost);
  const resolvedPort = port;
  const probeHost = resolveLoopbackHost(bindHost);

  if (await isPortOpen(probeHost, resolvedPort)) {
    if (reuseExisting) {
      return reusedServerStop;
    }
    throw new Error(`Collaboration websocket already running on ws://${probeHost}:${resolvedPort}`);
  }

  const logStream = ensureLogStream();
  fs.mkdirSync(COLLAB_DATA_DIR, { recursive: true });
  const args = [
    'exec',
    'y-sweet',
    'serve',
    '--host',
    bindHost,
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
    let exited = child.exitCode !== null || child.signalCode !== null;
    child.once('exit', () => {
      exited = true;
    });
    terminateProcessGroup(child, 'SIGTERM');
    if (!exited) {
      await once(child, 'exit');
    }
    cleanup();
  };

  try {
    await waitForPort(probeHost, resolvedPort);
  } catch (error) {
    await stop();
    const recentLog = readRecentLog();
    if (recentLog) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${recentLog}`);
    }
    throw error;
  }

  return stop;
}
