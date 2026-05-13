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
const LOG_PATH = path.join(LOG_DIR, 'remdo-api-server.log');
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
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (await isPortOpen(host, port)) {
      return;
    }
    await wait(POLL_INTERVAL);
  }

  throw new Error(`RemDo API server failed to start on http://${host}:${port}`);
}

export type StopRemdoApiServer = () => Promise<void>;

interface RemdoApiServerOptions {
  port?: number;
  ySweetConnectionString?: string;
}

export async function ensureRemdoApiServer({
  port = config.env.REMDO_API_PORT,
  ySweetConnectionString = config.env.YSWEET_CONNECTION_STRING,
}: RemdoApiServerOptions = {}): Promise<StopRemdoApiServer> {
  const resolvedHost = config.env.HOST;
  const resolvedPort = port;
  const probeHost = resolveLoopbackHost(resolvedHost);

  if (await isPortOpen(probeHost, resolvedPort)) {
    return reusedServerStop;
  }

  const logStream = ensureLogStream();
  const child = spawnPnpm(
    ['exec', 'tsx', './tools/remdo-api-server.ts'],
    {
      env: {
        AUTH_SECRET: config.env.AUTH_SECRET,
        ADMIN_SECRET: config.env.ADMIN_SECRET,
        APP_PUBLIC_URL: config.env.APP_PUBLIC_URL,
        HOST: resolvedHost,
        ALLOW_SIGNUP: String(config.env.ALLOW_SIGNUP),
        REMDO_API_PORT: String(resolvedPort),
        YSWEET_CONNECTION_STRING: ySweetConnectionString,
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
