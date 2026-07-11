import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

import { config } from '#config';
import { resolveLoopbackHost } from '#platform/net/loopback';
import { attachManagedProcess, readRecentLog, terminateProcessGroup } from './managed-process';
import { isPortOpen } from './net';
import { spawnPnpm } from './process';

const MAX_ATTEMPTS = 150;
const STOP_ATTEMPTS = 50;
const POLL_INTERVAL = 100;
const LOG_DIR = path.join(config.env.DATA_DIR, 'logs');
const LOG_PATH = path.join(LOG_DIR, 'collab-server.log');
const COLLAB_DATA_DIR = path.join(config.env.DATA_DIR, 'collab');
const reusedServerStop = () => Promise.resolve();

function resolveYSweetBindHost(host: string): string {
  return host === 'localhost' ? '127.0.0.1' : host;
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

async function waitForPortClosed(host: string, port: number): Promise<boolean> {
  for (let attempt = 0; attempt < STOP_ATTEMPTS; attempt += 1) {
    if (!(await isPortOpen(host, port))) {
      return true;
    }
    await wait(POLL_INTERVAL);
  }

  return false;
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

  const stopManagedProcess = attachManagedProcess(child, LOG_PATH);
  const stop = async () => {
    await stopManagedProcess();
    if (!(await waitForPortClosed(probeHost, resolvedPort))) {
      terminateProcessGroup(child, 'SIGKILL');
      await waitForPortClosed(probeHost, resolvedPort);
    }
  };

  try {
    await waitForPort(probeHost, resolvedPort);
  } catch (error) {
    await stop();
    const recentLog = readRecentLog(LOG_PATH);
    if (recentLog) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${recentLog}`);
    }
    throw error;
  }

  return stop;
}
