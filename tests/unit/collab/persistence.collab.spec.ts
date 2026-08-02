import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { config } from '#config';
import { runPnpm } from '#tools/process';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('collab persistence', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  const docId = 'persistCollabTest';
  const docDir = path.join(config.env.DATA_DIR, 'collab', docId);
  const dataFile = path.join(docDir, 'data.ysweet');
  const snapshotPath = path.join(config.env.DATA_DIR, `${docId}.json`);

  it('writes collaboration data to disk via y-sweet', async () => {
    expect(existsSync(dataFile)).toBe(false);
    await runPnpm(['exec', 'tsx', 'tools/snapshot/cli.ts', 'save', '--doc', docId, snapshotPath]);
    await waitFor(() => {
      expect(existsSync(dataFile)).toBe(true);
      expect(statSync(dataFile).size).toBeGreaterThan(0);
    });
  });
});
