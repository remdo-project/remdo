import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { config } from '#config/client';

describe.skipIf(!config.COLLAB_ENABLED)('snapshot CLI', () => {
  const SNAPSHOT_OUTPUTS = [
    path.resolve('data', 'snapshot.cli.json'),
    path.resolve('data', 'snapshot.cli.flat.json'),
    path.resolve('data', 'snapshot.cli.tree.json'),
  ];

  const runSnapshotCommand = (...args: string[]) => {
    execFileSync('pnpm', ['run', 'snapshot', ...args], { stdio: 'inherit' });
  };
  const readEditorState = (filePath: string) => JSON.parse(readFileSync(filePath, 'utf8')).editorState;

  afterEach(() => {
    for (const filePath of SNAPSHOT_OUTPUTS) {
      rmSync(filePath, { force: true });
    }
  });

  it('loads data into collaboration doc and writes it back to disk', async () => {
    const loadPath = path.resolve('tests/fixtures/basic.json');
    const savePath = SNAPSHOT_OUTPUTS[0]!;
    runSnapshotCommand('load', loadPath);

    await waitFor(() => {
      runSnapshotCommand('save', savePath);
      const saved = readEditorState(savePath);
      return JSON.stringify(saved) === JSON.stringify(readEditorState(loadPath));
    }, { timeout: 5000 });
  });

  it('saves the current editor state via snapshot CLI', async ({ lexical }) => {
    lexical.load('flat');
    await lexical.waitForCollabSync();

    const savePath = SNAPSHOT_OUTPUTS[1]!;
    const expectedState = readEditorState(path.resolve('tests/fixtures/flat.json'));
    await waitFor(() => {
      runSnapshotCommand('save', savePath);
      const saved = readEditorState(savePath);
      return JSON.stringify(saved.root) === JSON.stringify(expectedState.root);
    }, { timeout: 5000 });
  });

  it('loads a snapshot fixture into the editor', { timeout: 5000 }, async ({ lexical }) => {
    const loadPath = path.resolve('tests/fixtures/tree.json');
    runSnapshotCommand('load', loadPath);

    await lexical.waitForCollabSync();

    const expectedState = readEditorState(loadPath);
    const savePath = SNAPSHOT_OUTPUTS[2]!;
    let finalSaved: typeof expectedState | null = null;

    await waitFor(() => {
      runSnapshotCommand('save', savePath);
      const saved = readEditorState(savePath);
      finalSaved = saved;
      return JSON.stringify(saved.root) === JSON.stringify(expectedState.root);
    }, { timeout: 5000 });

    expect(finalSaved).not.toBeNull();
    expect(finalSaved?.root).toEqual(expectedState.root);

    await lexical.waitForCollabSync();
    expect(lexical.isCollabSyncing()).toBe(false);
  });
});
