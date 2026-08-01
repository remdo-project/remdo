import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../../config';
import { resolveLoopbackHost } from '../../src/platform/net/loopback';
import { ensureCollabServer, resolveYSweetProbeHost } from '../../tools/lib/collab-server-helper';
import { isPortOpen } from '../../tools/lib/net';
import { startRemdoApiServer } from '../../tools/lib/remdo-api-server-helper';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COLLAB_TEST_DATA_DIR = path.join(ROOT_DIR, 'data/collab-test-runtime');

interface RequiredPort {
  host: string;
  label: string;
  port: number;
}

interface PrepareCollabTestRuntimeOptions {
  dataDir: string;
  requiredPorts: RequiredPort[];
}

export async function prepareCollabTestRuntime({
  dataDir,
  requiredPorts,
}: PrepareCollabTestRuntimeOptions): Promise<void> {
  const portStates = await Promise.all(requiredPorts.map(async ({ host, label, port }) => ({
    host,
    label,
    port,
    open: await isPortOpen(host, port),
  })));
  const occupied = portStates.filter(({ open }) => open);
  if (occupied.length > 0) {
    const ports = occupied.map(({ host, label, port }) => `${label} ${host}:${port}`).join(', ');
    throw new Error(`Collaboration test runtime requires free ports: ${ports}`);
  }

  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.mkdir(dataDir, { recursive: true });
}

async function stopAll(stops: Array<() => Promise<void>>): Promise<void> {
  const errors: unknown[] = [];
  for (const stop of stops) {
    try {
      await stop();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to stop collaboration test services');
  }
}

export default async function collabTestRuntime() {
  if (!config.env.COLLAB_ENABLED) {
    return;
  }

  const dataDir = path.resolve(config.env.DATA_DIR);
  if (dataDir !== COLLAB_TEST_DATA_DIR) {
    throw new Error(
      `Refusing to reset non-test DATA_DIR ${dataDir}; run collaboration tests through pnpm test:collab`,
    );
  }

  await prepareCollabTestRuntime({
    dataDir,
    requiredPorts: [
      {
        host: resolveYSweetProbeHost(config.env.HOST),
        label: 'Y-Sweet',
        port: config.env.COLLAB_SERVER_PORT,
      },
      {
        host: resolveLoopbackHost(config.env.HOST),
        label: 'RemDo API',
        port: config.env.API_SERVER_PORT,
      },
    ],
  });

  const stopCollab = await ensureCollabServer({
    port: config.env.COLLAB_SERVER_PORT,
    reuseExisting: false,
  });

  try {
    const stopApi = await startRemdoApiServer({
      port: config.env.API_SERVER_PORT,
      ySweetConnectionString: config.env.YSWEET_CONNECTION_STRING,
    });
    return () => stopAll([stopApi, stopCollab]);
  } catch (error) {
    try {
      await stopCollab();
    } catch (stopError) {
      throw new AggregateError([error, stopError], 'Collaboration test runtime startup failed');
    }
    throw error;
  }
}
