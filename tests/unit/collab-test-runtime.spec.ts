import { createServer } from 'node:net';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureCollabServer } from '#tools/collab-server-helper';
import { startRemdoApiServer } from '#tools/remdo-api-server-helper';
import { prepareCollabTestRuntime } from '../global/collab-test-runtime';

const tempDirs: string[] = [];

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function withOccupiedPort(run: (port: number) => Promise<void>): Promise<void> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected an IP listener');
  }

  try {
    await run(address.port);
  } finally {
    await closeServer(server);
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(tempDir => fs.rm(tempDir, { recursive: true, force: true })));
});

describe('collaboration test runtime', () => {
  it('preserves the previous runtime when a required port is occupied', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'remdo-collab-runtime-'));
    tempDirs.push(dataDir);
    const sentinelPath = path.join(dataDir, 'failure-evidence.txt');
    await fs.writeFile(sentinelPath, 'preserve me');

    await withOccupiedPort(async (port) => {
      await expect(prepareCollabTestRuntime({
        dataDir,
        host: '127.0.0.1',
        requiredPorts: [{ label: 'occupied test service', port }],
      })).rejects.toThrow(`occupied test service 127.0.0.1:${port}`);
    });

    await expect(fs.readFile(sentinelPath, 'utf8')).resolves.toBe('preserve me');
  });

  it('refuses to reuse an occupied Y-Sweet port', async () => {
    await withOccupiedPort(async (port) => {
      await expect(ensureCollabServer({ port, reuseExisting: false })).rejects.toThrow(
        `Collaboration websocket already running on ws://127.0.0.1:${port}`,
      );
    });
  });

  it('refuses to reuse an occupied RemDo API port', async () => {
    await withOccupiedPort(async (port) => {
      await expect(startRemdoApiServer({ port })).rejects.toThrow(
        `RemDo API server already running on http://127.0.0.1:${port}`,
      );
    });
  });
});
