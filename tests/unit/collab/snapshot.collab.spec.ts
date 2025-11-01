import path from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { env } from '#config/env.client';

function runSnapshotCommand(...args: string[]) {
  execFileSync('pnpm', ['run', 'snapshot', '--', ...args], { stdio: 'inherit' });
}

describe.skipIf(!env.collabEnabled)('snapshot CLI', () => {
  const loadPath = path.resolve('tests/fixtures/basic.json');

  it("loads data into collaboration doc and writes it back to disk", () => {
    const savePath = loadPath;
    const expected = JSON.parse(readFileSync(loadPath, 'utf8'));

    runSnapshotCommand('load', loadPath);
    runSnapshotCommand('save', savePath);

    const saved = JSON.parse(readFileSync(savePath, 'utf8'));
    expect(saved).toEqual(expected);
  });
});
