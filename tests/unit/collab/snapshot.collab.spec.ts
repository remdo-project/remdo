/* eslint-disable node/no-process-env */
import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { SerializedEditorState } from 'lexical';
import type { TestContext } from 'vitest';
import { meta } from '#tests';
import { afterEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import type { Buffer } from 'node:buffer';
import { $isNoteLinkNode } from '#lib/editor/note-link-node';
import { stripEditorStateDefaults } from '#lib/editor/editor-state-defaults';
import { $findNoteById } from '@/editor/outline/note-traversal';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('snapshot CLI', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  const SNAPSHOT_OUTPUTS = [
    path.resolve('data', 'snapshot.cli.json'),
    path.resolve('data', 'snapshot.cli.flat.json'),
    path.resolve('data', 'snapshot.cli.tree.json'),
    path.resolve('data', 'cliFlag.json'),
    path.resolve('data', 'cross-doc-check.json'),
    path.resolve('data', 'cross-doc-check-alt.json'),
    path.resolve('data', 'snapshot.links.json'),
    path.resolve('data', 'snapshot.links.roundtrip.json'),
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
    const docEnv = { COLLAB_DOCUMENT_ID: 'snapshotBasic' };
    const loadPath = path.resolve('tests/fixtures/basic.json');
    const expected = readEditorState(loadPath);
    const savePath = SNAPSHOT_OUTPUTS[0]!;
    runSnapshotCommand('load', [loadPath], docEnv);

    await waitFor(() => {
      runSnapshotCommand('save', [savePath], docEnv);
      const saved = stripEditorStateDefaults(readEditorState(savePath));
      return JSON.stringify(saved) === JSON.stringify(expected);
    });
  });

  it(
    'saves the current editor state via snapshot CLI',
    meta({ collabDocId: 'snapshotFlat', fixture: 'flat' }),
    async () => {
      const docEnv = { COLLAB_DOCUMENT_ID: 'snapshotFlat' };

      const savePath = SNAPSHOT_OUTPUTS[1]!;
      const expectedState = readEditorState(path.resolve('tests/fixtures/flat.json'));
      await waitFor(() => {
        runSnapshotCommand('save', [savePath], docEnv);
        const saved = stripEditorStateDefaults(readEditorState(savePath));
        return JSON.stringify(saved.root) === JSON.stringify(expectedState.root);
      });
    }
  );

  it(
    'loads a snapshot fixture into the editor',
    meta({ collabDocId: 'snapshotTree' }),
    async ({ remdo }) => {
      const docEnv = { COLLAB_DOCUMENT_ID: 'snapshotTree' };
      const loadPath = path.resolve('tests/fixtures/tree.json');
      runSnapshotCommand('load', [loadPath], docEnv);

      await remdo.waitForSynced();

      const expectedState = readEditorState(loadPath);
      const savePath = SNAPSHOT_OUTPUTS[2]!;

      await waitFor(() => {
        runSnapshotCommand('save', [savePath], docEnv);
        const saved = stripEditorStateDefaults(readEditorState(savePath));
        return JSON.stringify(saved.root) === JSON.stringify(expectedState.root);
      });

      const savedState = stripEditorStateDefaults(readEditorState(savePath));
      expect(savedState.root).toEqual(expectedState.root);
    }
  );

  it('resolves the document id from the CLI flag', async () => {
    const docId = 'cliFlag';
    const loadPath = path.resolve('tests/fixtures/basic.json');
    const expected = readEditorState(loadPath);
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
    async ({ remdo }: TestContext) => {
      const defaultDoc = remdo.getCollabDocId();
      const secondaryDoc = `${defaultDoc}S`;
      const envOverrides = {
        COLLAB_DOCUMENT_ID: defaultDoc,
        VITE_COLLAB_DOCUMENT_ID: defaultDoc,
      } satisfies NodeJS.ProcessEnv;

      const defaultFixture = path.resolve('tests/fixtures/basic.json');
      const secondaryFixture = path.resolve('tests/fixtures/tree.json');
      const expectedDefault = readEditorState(defaultFixture);
      const expectedSecondary = readEditorState(secondaryFixture);
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

  it('rehydrates same-doc links in runtime after snapshot load while keeping persisted output compact', async ({ remdo }: TestContext) => {
    const docId = remdo.getCollabDocId();
    const envOverrides = {
      COLLAB_DOCUMENT_ID: docId,
      VITE_COLLAB_DOCUMENT_ID: docId,
    } satisfies NodeJS.ProcessEnv;
    const fixturePath = path.resolve('tests/fixtures/links.json');
    const outputPath = path.resolve('data', 'snapshot.links.roundtrip.json');
    const expected = readEditorState(fixturePath);

    runSnapshotCommand('load', [fixturePath], envOverrides);
    await remdo.waitForSynced();

    await waitFor(() => {
      remdo.validate(() => {
        const note = $findNoteById('note1')!;
        const links = note.getChildren().filter($isNoteLinkNode);
        expect(links).toHaveLength(2);
        const runtimeSameDocLink = links[0]!;
        const runtimeCrossDocLink = links[1]!;
        expect(runtimeSameDocLink.getNoteId()).toBe('note2');
        expect(runtimeCrossDocLink.getNoteId()).toBe('remoteNote');
        expect(runtimeSameDocLink.getDocId()).toBe(docId);
        expect(runtimeCrossDocLink.getDocId()).toBe('otherDoc');
      });
    });

    await waitFor(() => {
      runSnapshotCommand('save', [outputPath], envOverrides);
      const saved = stripEditorStateDefaults(readEditorState(outputPath));
      expect(saved.root).toEqual(expected.root);
    });
  });
});
