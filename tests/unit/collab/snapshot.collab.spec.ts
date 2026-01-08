/* eslint-disable node/no-process-env */
import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { SerializedEditorState } from 'lexical';
import type { TestContext } from 'vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import type { Buffer } from 'node:buffer';
import { stripEditorStateDefaults } from '#lib/editor/editor-state-defaults';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('snapshot CLI', () => {
  const SNAPSHOT_OUTPUTS = [
    path.resolve('data', 'snapshot.cli.json'),
    path.resolve('data', 'snapshot.cli.flat.json'),
    path.resolve('data', 'snapshot.cli.tree.json'),
    path.resolve('data', 'cli-flag.json'),
    path.resolve('data', 'cross-doc-check.json'),
    path.resolve('data', 'cross-doc-check-alt.json'),
  ];

  const baseEnv = { ...process.env } satisfies NodeJS.ProcessEnv;

  function runSnapshotCommand(command: 'load' | 'save', args: string[], envOverrides?: NodeJS.ProcessEnv) {
    try {
      execFileSync('pnpm', ['run', command, ...args], {
        stdio: ['ignore', 'pipe', 'inherit'],
        env: { ...baseEnv, ...envOverrides },
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'stdout' in error) {
        const stdout = (error as { stdout?: Buffer | string }).stdout;
        const message = typeof stdout === 'string' ? stdout.trim() : stdout?.toString().trim();
        if (message) {
          console.error(message);
        }
      }
      throw error;
    }
  }

function readEditorState(filePath: string): SerializedEditorState {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

  afterEach(() => {
    for (const filePath of SNAPSHOT_OUTPUTS) {
      rmSync(filePath, { force: true });
    }
  });

  it('loads data into collaboration doc and writes it back to disk', async () => {
    const docEnv = { COLLAB_DOCUMENT_ID: 'snapshot-basic' };
    const loadPath = path.resolve('tests/fixtures/basic.json');
    const expected = stripEditorStateDefaults(readEditorState(loadPath));
    const savePath = SNAPSHOT_OUTPUTS[0]!;
    runSnapshotCommand('load', [loadPath], docEnv);

    await waitFor(() => {
      runSnapshotCommand('save', [savePath], docEnv);
      const saved = stripEditorStateDefaults(readEditorState(savePath));
      return JSON.stringify(saved) === JSON.stringify(expected);
    });
  }, COLLAB_LONG_TIMEOUT_MS);

  it(
    'saves the current editor state via snapshot CLI',
    { meta: { collabDocId: 'snapshot-flat' } } as any,
    async ({ remdo }) => {
      const docEnv = { COLLAB_DOCUMENT_ID: 'snapshot-flat' };
      await remdo.load('flat');
      await remdo.waitForSynced();

      const savePath = SNAPSHOT_OUTPUTS[1]!;
      const expectedState = stripEditorStateDefaults(readEditorState(path.resolve('tests/fixtures/flat.json')));
      await waitFor(() => {
        runSnapshotCommand('save', [savePath], docEnv);
        const saved = stripEditorStateDefaults(readEditorState(savePath));
        return JSON.stringify(saved.root) === JSON.stringify(expectedState.root);
      });
    }
  );

  it(
    'loads a snapshot fixture into the editor',
    { meta: { collabDocId: 'snapshot-tree' } } as any,
    async ({ remdo }) => {
      const docEnv = { COLLAB_DOCUMENT_ID: 'snapshot-tree' };
      const loadPath = path.resolve('tests/fixtures/tree.json');
      runSnapshotCommand('load', [loadPath], docEnv);

      await remdo.waitForSynced();

      const expectedState = stripEditorStateDefaults(readEditorState(loadPath));
      const savePath = SNAPSHOT_OUTPUTS[2]!;

      await waitFor(() => {
        runSnapshotCommand('save', [savePath], docEnv);
        const saved = stripEditorStateDefaults(readEditorState(savePath));
        return JSON.stringify(saved.root) === JSON.stringify(expectedState.root);
      });

      const savedState = stripEditorStateDefaults(readEditorState(savePath));
      expect(savedState.root).toEqual(expectedState.root);

      await remdo.waitForSynced();
    }
  );

  it('resolves the document id from the CLI flag', async () => {
    const docId = 'cli-flag';
    const loadPath = path.resolve('tests/fixtures/basic.json');
    const expected = stripEditorStateDefaults(readEditorState(loadPath));
    const savePath = path.resolve('data', `${docId}.json`);

    runSnapshotCommand('load', ['--doc', docId, loadPath]);

    await waitFor(() => {
      runSnapshotCommand('save', ['--doc', docId, savePath]);
      const saved = stripEditorStateDefaults(readEditorState(savePath));
      return JSON.stringify(saved) === JSON.stringify(expected);
    });
  });

  it('keeps browser doc id aligned with CLI default configuration', async ({ remdo }: TestContext) => {
    const defaultDoc = remdo.getCollabDocId();
    const envOverrides = {
      COLLAB_DOCUMENT_ID: defaultDoc,
      VITE_COLLAB_DOCUMENT_ID: defaultDoc,
    } satisfies NodeJS.ProcessEnv;
    const defaultFixture = path.resolve('tests/fixtures/basic.json');
    runSnapshotCommand('load', [defaultFixture], envOverrides);

    await remdo.waitForSynced();

    expect(remdo.getCollabDocId()).toBe(defaultDoc);
  });

  it(
    'cross-loads and saves multiple documents without crosstalk',
    { timeout: COLLAB_LONG_TIMEOUT_MS },
    async ({ remdo }: TestContext) => {
      const defaultDoc = remdo.getCollabDocId();
      const secondaryDoc = `${defaultDoc}-secondary`;
      const envOverrides = {
        COLLAB_DOCUMENT_ID: defaultDoc,
        VITE_COLLAB_DOCUMENT_ID: defaultDoc,
      } satisfies NodeJS.ProcessEnv;

      const defaultFixture = path.resolve('tests/fixtures/basic.json');
      const secondaryFixture = path.resolve('tests/fixtures/tree.json');
      const expectedDefault = stripEditorStateDefaults(readEditorState(defaultFixture));
      const expectedSecondary = stripEditorStateDefaults(readEditorState(secondaryFixture));
      const defaultOutput = path.resolve('data', `${defaultDoc}.json`);
      const secondaryOutput = path.resolve('data', `${secondaryDoc}.json`);

      runSnapshotCommand('load', [defaultFixture], envOverrides);
      runSnapshotCommand('load', ['--doc', secondaryDoc, secondaryFixture]);

      await remdo.waitForSynced();
      expect(remdo.getCollabDocId()).toBe(defaultDoc);

      await waitFor(() => {
        runSnapshotCommand('save', [defaultOutput], envOverrides);
        const savedDefault = stripEditorStateDefaults(readEditorState(defaultOutput));
        expect(savedDefault.root).toEqual(expectedDefault.root);
      });

      await waitFor(() => {
        runSnapshotCommand('save', ['--doc', secondaryDoc, secondaryOutput]);
        const savedSecondary = stripEditorStateDefaults(readEditorState(secondaryOutput));
        expect(savedSecondary.root).toEqual(expectedSecondary.root);
      });
    }
  );
});
