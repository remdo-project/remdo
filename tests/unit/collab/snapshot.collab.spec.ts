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
import { $isNoteLinkNode } from '#client/editor/runtime/note-link-node';
import { stripEditorStateDefaults } from '#client/editor/runtime/editor-state-defaults';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

describe('snapshot CLI', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  const SNAPSHOT_OUTPUT_DIR = path.resolve('data', 'snapshot-collab-spec');

  const baseEnv = { ...process.env } satisfies NodeJS.ProcessEnv;

  function snapshotOutputPath(fileName: string): string {
    return path.join(SNAPSHOT_OUTPUT_DIR, fileName);
  }

  function runSnapshotSave(args: string[], envOverrides?: NodeJS.ProcessEnv) {
    try {
      execFileSync('pnpm', ['exec', 'tsx', 'tools/snapshot/cli.ts', 'save', ...args], {
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
    rmSync(SNAPSHOT_OUTPUT_DIR, { recursive: true, force: true });
  });

  it(
    'saves the current editor state via snapshot CLI',
    meta({ collabDocId: 'snapshotFlat', fixture: 'flat' }),
    async () => {
      const docId = 'snapshotFlat';

      const savePath = snapshotOutputPath('snapshot.cli.flat.json');
      const expectedState = readEditorState(path.resolve('tests/fixtures/flat.json'));
      await waitFor(() => {
        runSnapshotSave(['--doc', docId, savePath]);
        const saved = stripEditorStateDefaults(readEditorState(savePath));
        return JSON.stringify(saved.root) === JSON.stringify(expectedState.root);
      });
    }
  );

  it('resolves the document id from the CLI flag', meta({ collabDocId: 'cliFlag', fixture: 'basic' }), async () => {
    const docId = 'cliFlag';
    const expected = readEditorState(path.resolve('tests/fixtures/basic.json'));
    const savePath = snapshotOutputPath(`${docId}.json`);

    await waitFor(() => {
      runSnapshotSave(['--doc', docId, savePath]);
      const saved = stripEditorStateDefaults(readEditorState(savePath));
      return JSON.stringify(saved) === JSON.stringify(expected);
    });
  });

  it('saves same-doc links compactly from runtime state', meta({ collabDocId: 'snapshotLinks', fixture: 'links' }), async ({ remdo }: TestContext) => {
    const docId = remdo.getCollabDocId();
    const fixturePath = path.resolve('tests/fixtures/links.json');
    const outputPath = snapshotOutputPath('snapshot.links.roundtrip.json');
    const expected = readEditorState(fixturePath);

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
      runSnapshotSave(['--doc', docId, outputPath]);
      const saved = stripEditorStateDefaults(readEditorState(outputPath));
      expect(saved.root).toEqual(expected.root);
    });
  });
});
