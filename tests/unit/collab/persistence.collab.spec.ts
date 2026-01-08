import { statSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { config } from '#config';
import { runPnpm } from '#tools/process';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('collab persistence', () => {
  const docId = 'persist-collab-test';
  const docDir = path.join(config.env.DATA_DIR, 'collab', docId);
  const dataFile = path.join(docDir, 'data.ysweet');
  const snapshotPath = path.resolve('data', `${docId}.json`);

  beforeEach(() => {
    rmSync(snapshotPath, { force: true });
    rmSync(docDir, { recursive: true, force: true });
  });

  it('writes collaboration data to disk via y-sweet', async () => {
    await runPnpm(['exec', 'tsx', 'tools/snapshot.ts', 'save', '--doc', docId, snapshotPath]);
    await waitFor(() => {
      if (!existsSync(dataFile)) {
        throw new Error('waiting for data file to appear');
      }
      expect(statSync(dataFile).size).toBeGreaterThan(0);
    });
  }, COLLAB_LONG_TIMEOUT_MS);
});
