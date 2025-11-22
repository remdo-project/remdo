/* eslint-disable node/no-process-env */
import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { SerializedEditorState } from 'lexical';
import type { TestContext } from 'vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { config } from '#config';

const SNAPSHOT_TIMEOUT_MS = 15_000;

describe.skipIf(!config.env.COLLAB_ENABLED)('snapshot CLI', () => {
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
    execFileSync('pnpm', ['run', command, ...args], {
      stdio: 'inherit',
      env: { ...baseEnv, ...envOverrides },
    });
  }

	function readEditorState(filePath: string): SerializedEditorState {
	  return JSON.parse(readFileSync(filePath, 'utf8')).editorState;
	}

  afterEach(() => {
    for (const filePath of SNAPSHOT_OUTPUTS) {
      rmSync(filePath, { force: true });
    }
  });

  it('loads data into collaboration doc and writes it back to disk', async () => {
    const docEnv = { COLLAB_DOCUMENT_ID: 'snapshot-basic' };
    const loadPath = path.resolve('tests/fixtures/basic.json');
    const savePath = SNAPSHOT_OUTPUTS[0]!;
    runSnapshotCommand('load', [loadPath], docEnv);

    await waitFor(() => {
      runSnapshotCommand('save', [savePath], docEnv);
      const saved = readEditorState(savePath);
      return JSON.stringify(saved) === JSON.stringify(readEditorState(loadPath));
    });
  }, SNAPSHOT_TIMEOUT_MS);

  it(
    'saves the current editor state via snapshot CLI',
    { meta: { collabDocId: 'snapshot-flat' } } as any,
    async ({ lexical }) => {
      const docEnv = { COLLAB_DOCUMENT_ID: 'snapshot-flat' };
    await lexical.load('flat');
    await lexical.waitForCollabReady();

      const savePath = SNAPSHOT_OUTPUTS[1]!;
      const expectedState = readEditorState(path.resolve('tests/fixtures/flat.json'));
    await waitFor(() => {
      runSnapshotCommand('save', [savePath], docEnv);
      const saved = readEditorState(savePath);
      return JSON.stringify(saved.root) === JSON.stringify(expectedState.root);
    });
    }
  );

  it(
    'loads a snapshot fixture into the editor',
    { meta: { collabDocId: 'snapshot-tree' } } as any,
    async ({ lexical }) => {
      const docEnv = { COLLAB_DOCUMENT_ID: 'snapshot-tree' };
      const loadPath = path.resolve('tests/fixtures/tree.json');
      runSnapshotCommand('load', [loadPath], docEnv);

      await lexical.waitForCollabReady();

      const expectedState = readEditorState(loadPath);
	      const savePath = SNAPSHOT_OUTPUTS[2]!;

      await waitFor(() => {
        runSnapshotCommand('save', [savePath], docEnv);
        const saved = readEditorState(savePath);
        return JSON.stringify(saved.root) === JSON.stringify(expectedState.root);
      });

	      const savedState = readEditorState(savePath);
	      expect(savedState.root).toEqual(expectedState.root);

      await lexical.waitForCollabReady();
    }
  );

  it('resolves the document id from the CLI flag', async () => {
    const docId = 'cli-flag';
    const loadPath = path.resolve('tests/fixtures/basic.json');
    const savePath = path.resolve('data', `${docId}.json`);

    runSnapshotCommand('load', ['--doc', docId, loadPath]);

    await waitFor(() => {
      runSnapshotCommand('save', ['--doc', docId, savePath]);
      const saved = readEditorState(savePath);
      const expected = readEditorState(loadPath);
      return JSON.stringify(saved) === JSON.stringify(expected);
    });
  });

  it('keeps browser doc id aligned with CLI default configuration', async ({ lexical }: TestContext) => {
    const defaultDoc = lexical.getCollabDocId();
    const envOverrides = {
      COLLAB_DOCUMENT_ID: defaultDoc,
      VITE_COLLAB_DOCUMENT_ID: defaultDoc,
    } satisfies NodeJS.ProcessEnv;
    const defaultFixture = path.resolve('tests/fixtures/basic.json');
    runSnapshotCommand('load', [defaultFixture], envOverrides);

    await lexical.waitForCollabReady();

    expect(lexical.getCollabDocId()).toBe(defaultDoc);
  });

  it(
    'cross-loads and saves multiple documents without crosstalk',
    { timeout: SNAPSHOT_TIMEOUT_MS } as any,
    async ({ lexical }: TestContext) => {
      const defaultDoc = lexical.getCollabDocId();
      const secondaryDoc = `${defaultDoc}-secondary`;
      const envOverrides = {
        COLLAB_DOCUMENT_ID: defaultDoc,
        VITE_COLLAB_DOCUMENT_ID: defaultDoc,
      } satisfies NodeJS.ProcessEnv;

      const defaultFixture = path.resolve('tests/fixtures/basic.json');
      const secondaryFixture = path.resolve('tests/fixtures/tree.json');
      const defaultOutput = path.resolve('data', `${defaultDoc}.json`);
      const secondaryOutput = path.resolve('data', `${secondaryDoc}.json`);

      runSnapshotCommand('load', [defaultFixture], envOverrides);
      runSnapshotCommand('load', ['--doc', secondaryDoc, secondaryFixture]);

      await lexical.waitForCollabReady();
      expect(lexical.getCollabDocId()).toBe(defaultDoc);

      runSnapshotCommand('save', [defaultOutput], envOverrides);
      const savedDefault = readEditorState(defaultOutput);
      expect(savedDefault.root).toEqual(readEditorState(defaultFixture).root);

      runSnapshotCommand('save', ['--doc', secondaryDoc, secondaryOutput]);
      const savedSecondary = readEditorState(secondaryOutput);
      expect(savedSecondary.root).toEqual(readEditorState(secondaryFixture).root);
    }
  );
});
