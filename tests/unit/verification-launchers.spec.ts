/* eslint-disable node/no-process-env */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { writeFakeBin } from './_support/fake-bins';

const root = process.cwd();
const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('verification launcher settings', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ['backend tests', './tools/django.sh test remdo', 'remdo.development', 'remdo.verification'],
    ['backend development', './tools/django.sh shell', '', 'remdo.development'],
    ['collaboration tests', scripts['test:collab']!, 'remdo.development', 'remdo.verification'],
    ['browser tests', './tools/e2e/run.sh', 'remdo.development', 'remdo.verification'],
  ])('selects the settings for %s before starting the runner', (_name, command, inherited, expected) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-verification-launcher-'));
    directories.push(directory);
    // Copy the actual launchers so E2E cleanup only touches this test's data.
    for (const file of [
      'tools/django.sh', 'tools/e2e/run.sh', 'tools/test/vitest.sh',
      'tools/env.sh', 'tools/env.defaults.sh', 'tools/lib/env-file.sh',
    ]) {
      const target = path.join(directory, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, file), target);
    }
    const bin = path.join(directory, 'bin');
    fs.mkdirSync(bin);
    for (const runner of ['uv', 'pnpm']) {
      writeFakeBin(bin, runner, 'printf \'%s\' "$DJANGO_SETTINGS_MODULE"');
    }
    const result = spawnSync('sh', ['-c', command], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        DJANGO_SETTINGS_MODULE: inherited,
        DATA_DIR: path.join(directory, 'data'),
        TMPDIR: path.join(directory, 'tmp'),
        HOST: '127.0.0.1',
        PUBLIC_HOST: '127.0.0.1',
        PORT_BASE: '4600',
        PATH: `${bin}:${path.join(root, 'node_modules/.bin')}:${process.env.PATH}`,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(expected);
  });
});
