import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

import { config } from '#config';
import { resolveLoopbackHost } from '#platform/net/loopback';
import { attachManagedProcess, terminateProcessGroup } from './managed-process';
import { isPortOpen } from './net';
import { spawnPnpm } from './process';

const MAX_ATTEMPTS = 50;
const POLL_INTERVAL = 100;
const LOG_DIR = path.join(config.env.DATA_DIR, 'logs');
const LOG_PATH = path.join(LOG_DIR, 'remdo-api-server.log');
const reusedServerStop = () => Promise.resolve();

function ensureLogStream(): fs.WriteStream {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  return fs.createWriteStream(LOG_PATH, { flags: 'w' });
}

function readRecentLog(): string {
  try {
    return fs.readFileSync(LOG_PATH, 'utf8').trim().slice(-2000);
  } catch {
    return '';
  }
}

async function waitForPort(host: string, port: number, signal: AbortSignal): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (await isPortOpen(host, port)) {
      return;
    }
    await wait(POLL_INTERVAL, undefined, { signal });
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

  const cleanup = attachManagedProcess(child, logStream);
  const startupAbortController = new AbortController();
  const childExit = once(child, 'exit').then(([code, signal]) => {
    throw new Error(
      `RemDo API server exited before listening (code ${String(code)}, signal ${String(signal)})`,
    );
  });
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
    await Promise.race([
      waitForPort(probeHost, resolvedPort, startupAbortController.signal),
      childExit,
    ]).finally(() => startupAbortController.abort());
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
