/* eslint-disable node/no-process-env */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { writeFakeBin } from './_support/fake-bins';

function rewrite(args: string[]): string[] {
  const result = spawnSync(
    'sh',
    [
      '-c',
      `. ./tools/lib/drop-npm-run-delimiter.sh
printf '%s\\n' "$#"
[ "$#" -eq 0 ] || printf '%s\\0' "$@"`,
      'sh',
      ...args,
    ],
    { encoding: 'utf8' },
  );
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  const newline = result.stdout.indexOf('\n');
  const count = Number(result.stdout.slice(0, newline));
  if (count === 0) {
    return [];
  }
  return result.stdout.slice(newline + 1).split('\0').slice(0, -1);
}

describe('drop-npm-run-delimiter', () => {
  it('drops the first -- and keeps later arguments', () => {
    expect(rewrite(['run', '--', 'tests/unit/net.spec.ts'])).toEqual([
      'run',
      'tests/unit/net.spec.ts',
    ]);
  });

  it('drops a -- that follows baked-in flags', () => {
    expect(rewrite(['bench', '-c', 'cfg', '--run', '--', 'path'])).toEqual([
      'bench',
      '-c',
      'cfg',
      '--run',
      'path',
    ]);
  });

  it('keeps a later -- after the npm delimiter', () => {
    expect(rewrite(['run', '--', '--', 'weird.spec.ts'])).toEqual([
      'run',
      '--',
      'weird.spec.ts',
    ]);
  });

  it('leaves argv unchanged when there is no --', () => {
    expect(rewrite(['run', '--changed', 'tests/unit/net.spec.ts'])).toEqual([
      'run',
      '--changed',
      'tests/unit/net.spec.ts',
    ]);
  });

  it('leaves an empty argv unchanged', () => {
    expect(rewrite([])).toEqual([]);
  });
});

describe('vitest.sh', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  function runVitestSh(args: string[]): string[] {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-vitest-sh-'));
    tempDirs.push(tempDir);
    const binDir = path.join(tempDir, 'bin');
    const logPath = path.join(tempDir, 'pnpm.log');
    fs.mkdirSync(binDir);
    writeFakeBin(binDir, 'pnpm', `printf '%s\\0' "$@" > '${logPath}'`);
    const result = spawnSync('./tools/test/vitest.sh', args, {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}` },
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    return fs.readFileSync(logPath, 'utf8').split('\0').slice(0, -1);
  }

  it('forwards vitest args without the npm extra-args delimiter', () => {
    expect(runVitestSh(['run', '--', 'tests/unit/net.spec.ts'])).toEqual([
      'exec',
      'vitest',
      'run',
      'tests/unit/net.spec.ts',
    ]);
  });
});
