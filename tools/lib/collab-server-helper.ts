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
const META_PATH = path.join(LOG_DIR, 'collab-server.json');
const COLLAB_DATA_DIR = path.join(config.env.DATA_DIR, 'collab');

interface CollabServerMeta {
  dataDir: string;
  port: number;
  pid: number | null;
  startedAt: string;
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

function readMeta(): CollabServerMeta | null {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8')) as CollabServerMeta;
  } catch {
    return null;
  }
}

function writeMeta(meta: CollabServerMeta): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(META_PATH, `${JSON.stringify(meta, null, 2)}\n`);
}

function clearMeta(): void {
  fs.rmSync(META_PATH, { force: true });
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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

  if (await isPortOpen(probeHost, resolvedPort)) {
    if (!allowReuse) {
      throw new Error(`Collaboration server already running on ws://${probeHost}:${resolvedPort}`);
    }

    const meta = readMeta();
    const metaOk = Boolean(
      meta
      && meta.port === resolvedPort
      && meta.dataDir === config.env.DATA_DIR
      && (!meta.pid || isPidRunning(meta.pid)),
    );
    if (metaOk) {
      return undefined;
    }

    const metaDetails = meta ? `found ${JSON.stringify(meta)}` : 'no metadata file found';
    throw new Error(
      `Collaboration server already running on ws://${probeHost}:${resolvedPort}, but ${metaDetails}. `
      + `Expected data dir: ${config.env.DATA_DIR}. Stop the existing server or choose a different PORT.`,
    );
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
    clearMeta();
  };

  try {
    await waitForPort(probeHost, resolvedPort);
    writeMeta({
      dataDir: config.env.DATA_DIR,
      port: resolvedPort,
      pid: child.pid ?? null,
      startedAt: new Date().toISOString(),
    });
  } catch (error) {
    await stop();
    throw error;
  }

  return stop;
}
