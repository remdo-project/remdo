/* eslint-disable node/no-process-env -- tests rely on process env for server configuration */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import { config } from '#config';

function lookupHost() {
  return process.env.HOST ?? config.env.HOST;
}

function resolveProbeHost(host: string) {
  if (host === '0.0.0.0' || host === '::') {
    return '127.0.0.1';
  }

  return host;
}

function lookupPort() {
  const envPort = process.env.COLLAB_SERVER_PORT ?? process.env.COLLAB_PORT;
  if (envPort !== undefined) {
    return Number(envPort);
  }
  return config.env.COLLAB_SERVER_PORT;
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

const MAX_ATTEMPTS = 50;
const POLL_INTERVAL = 100;

async function waitForPort(host: string, port: number): Promise<void> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (await isPortOpen(host, port)) {
      return;
    }
    await wait(POLL_INTERVAL);
  }

  throw new Error(`Collaboration websocket failed to start on ws://${host}:${port}`);
}

export default async function setupCollabServer() {
  if (!config.env.COLLAB_ENABLED) {
    return;
  }

  // TODO: align boot logic with scripts/ws-server.ts to avoid drift between CLI and tests.
  const host = lookupHost();
  const port = lookupPort();
  const probeHost = resolveProbeHost(host);

  if (await isPortOpen(probeHost, port)) {
    return;
  }

  const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const child = spawn(pnpmCmd, ['exec', 'tsx', './scripts/ws-server.ts'], {
    env: {
      ...process.env,
      HOST: host,
      COLLAB_SERVER_PORT: String(port),
      COLLAB_ENABLED: 'true',
    },
    stdio: 'inherit',
  });

  try {
    await waitForPort(probeHost, port);
  } catch (error) {
    child.kill('SIGTERM');
    await once(child, 'exit');
    throw error;
  }

  return async () => {
    child.kill('SIGTERM');
    await once(child, 'exit');
  };
}
