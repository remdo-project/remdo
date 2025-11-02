import path from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { config } from '#config/client';

describe.skipIf(!config.COLLAB_ENABLED)('snapshot CLI', () => {
  const runSnapshotCommand = (...args: string[]) => {
    execFileSync('pnpm', ['run', 'snapshot', ...args], { stdio: 'inherit' });
  };
  const readEditorState = (filePath: string) => JSON.parse(readFileSync(filePath, 'utf8')).editorState;

  it("loads data into collaboration doc and writes it back to disk", () => {
    const loadPath = path.resolve('tests/fixtures/basic.json');
    const savePath = path.resolve('data', 'snapshot.cli.json');
    runSnapshotCommand('load', loadPath);
    runSnapshotCommand('save', savePath);

    expect(readEditorState(savePath)).toEqual(readEditorState(loadPath));
  });
});
