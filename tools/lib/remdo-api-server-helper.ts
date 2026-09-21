import { spawn } from 'node:child_process';
import process from 'node:process';
import type { ChildProcess } from 'node:child_process';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

import { config } from '#config';
import { INTERNAL_SERVICE_HOST } from '#platform/net/origins';
import { attachManagedProcess, prepareManagedProcessLog, readRecentLog } from './managed-process';
import { isPortOpen } from './net';

// Fresh test databases need migrations and fixture accounts before serving.
const MAX_ATTEMPTS = 300;
const POLL_INTERVAL = 100;
const LOG_DIR = path.join(config.env.DATA_DIR, 'logs');
const LOG_PATH = path.join(LOG_DIR, 'remdo-api-server.log');

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
  ySweetConnectionString?: string;
}

// The port comes from the resolved configuration rather than a caller argument:
// the launcher derives it from this checkout's PORT_BASE block, so an argument
// could only disagree with the server that actually starts. Runtimes needing a
// different port shift PORT_BASE, which every other launcher already honors.
export async function startRemdoApiServer({
  ySweetConnectionString = config.env.YSWEET_CONNECTION_STRING,
}: RemdoApiServerOptions = {}): Promise<StopRemdoApiServer> {
  const port = config.env.API_SERVER_PORT;
  if (await isPortOpen(INTERNAL_SERVICE_HOST, port)) {
    throw new Error(`RemDo API server already running on http://${INTERNAL_SERVICE_HOST}:${port}`);
  }

  prepareManagedProcessLog(LOG_PATH);
  const child = spawn(
    './tools/env.sh', ['./tools/django-serve.sh', '--noreload'],
    {
      env: {
        // eslint-disable-next-line node/no-process-env -- inherit the resolved stack environment
        ...process.env,
        AUTH_SECRET: config.env.AUTH_SECRET,
        APP_ORIGIN: config.env.APP_ORIGIN,
        HOST: INTERNAL_SERVICE_HOST,
        ALLOW_SIGNUP: String(config.env.ALLOW_SIGNUP),
        API_SERVER_PORT: String(port),
        YSWEET_CONNECTION_STRING: ySweetConnectionString,
        YSWEET_AUTH_KEY: config.env.YSWEET_AUTH_KEY,
        YSWEET_SERVER_TOKEN: config.env.YSWEET_SERVER_TOKEN,
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const stop = attachManagedProcess(child, LOG_PATH);

  try {
    await waitForPort(INTERNAL_SERVICE_HOST, port, child);
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
