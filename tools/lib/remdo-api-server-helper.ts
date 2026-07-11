import type { ChildProcess } from 'node:child_process';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

import { config } from '#config';
import { resolveLoopbackHost } from '#platform/net/loopback';
import { attachManagedProcess, prepareManagedProcessLog, readRecentLog } from './managed-process';
import { isPortOpen } from './net';
import { spawnPnpm } from './process';

const MAX_ATTEMPTS = 50;
const POLL_INTERVAL = 100;
const LOG_DIR = path.join(config.env.DATA_DIR, 'logs');
const LOG_PATH = path.join(LOG_DIR, 'remdo-api-server.log');
const reusedServerStop = () => Promise.resolve();

async function waitForPort(host: string, port: number, child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (await isPortOpen(host, port)) {
      return;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `RemDo API server exited before listening (code ${String(child.exitCode)}, signal ${String(child.signalCode)})`,
      );
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
  port = config.env.API_SERVER_PORT,
  ySweetConnectionString = config.env.YSWEET_CONNECTION_STRING,
}: RemdoApiServerOptions = {}): Promise<StopRemdoApiServer> {
  const resolvedHost = config.env.HOST;
  const resolvedPort = port;
  const probeHost = resolveLoopbackHost(resolvedHost);

  if (await isPortOpen(probeHost, resolvedPort)) {
    return reusedServerStop;
  }

  prepareManagedProcessLog(LOG_PATH);
  const child = spawnPnpm(
    ['exec', 'tsx', './tools/remdo-api-server.ts'],
    {
      env: {
        AUTH_SECRET: config.env.AUTH_SECRET,
        ADMIN_SECRET: config.env.ADMIN_SECRET,
        APP_PUBLIC_URL: config.env.APP_PUBLIC_URL,
        HOST: resolvedHost,
        ALLOW_SIGNUP: String(config.env.ALLOW_SIGNUP),
        API_SERVER_PORT: String(resolvedPort),
        YSWEET_CONNECTION_STRING: ySweetConnectionString,
        YSWEET_AUTH_KEY: config.env.YSWEET_AUTH_KEY,
        YSWEET_SERVER_TOKEN: config.env.YSWEET_SERVER_TOKEN,
      },
      detached: true,
      forwardExit: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const stop = attachManagedProcess(child, LOG_PATH);

  try {
    await waitForPort(probeHost, resolvedPort, child);
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
