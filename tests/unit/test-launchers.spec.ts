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

describe('test launcher settings', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ['no arguments beyond test', ['test'], 'test accounts documents fixtures remdo'],
    ['options without a label', ['test', '--keepdb'], 'test accounts documents fixtures remdo --keepdb'],
    ['an explicit label', ['test', 'remdo'], 'test remdo'],
    ['a label and an option', ['test', 'remdo', '--keepdb'], 'test remdo --keepdb'],
  ])('supplies the default backend test labels for %s', (_name, argv, expected) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-django-labels-'));
    directories.push(directory);
    for (const file of ['tools/django.sh', 'tools/env.sh', 'tools/env.defaults.sh', 'tools/lib/env-file.sh']) {
      const target = path.join(directory, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, file), target);
    }
    const bin = path.join(directory, 'bin');
    fs.mkdirSync(bin);
    // Django discovers no tests from the repository root, so an invocation that
    // drops the labels exits successfully having run nothing.
    writeFakeBin(bin, 'uv', 'shift 3; printf \'%s\' "$*"');
    const result = spawnSync('sh', ['-c', `./tools/django.sh ${argv.join(' ')}`], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATA_DIR: path.join(directory, 'data'),
        TMPDIR: path.join(directory, 'tmp'),
        HOST: '127.0.0.1',
        PUBLIC_HOST: '127.0.0.1',
        PORT_BASE: '4700',
        PATH: `${bin}:${path.join(root, 'node_modules/.bin')}:${process.env.PATH}`,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(`backend/manage.py ${expected}`);
  });

  it.each([
    ['backend tests', './tools/django.sh test remdo', 'remdo.development', 'remdo.testing', '', 1],
    ['backend checks', './tools/check-backend.sh', '', 'remdo.development', '', 2],
    ['PostgreSQL backend tests', './tools/postgres.sh run ./tools/django.sh test remdo', '', 'remdo.testing', 'postgresql://remdo:development@127.0.0.1:4612/remdo', 1],
    ['PostgreSQL upper port boundary', 'PORT_BASE=65515 ./tools/postgres.sh run ./tools/django.sh test remdo', '', 'remdo.testing', 'postgresql://remdo:development@127.0.0.1:65527/remdo', 1],
    ['backend development', './tools/django.sh shell', '', 'remdo.development', 'postgresql://staging.example/remdo', 1],
    ['collaboration tests', scripts['test:collab']!, 'remdo.development', 'remdo.testing', '', 1],
    ['browser tests', './tools/e2e/run.sh', 'remdo.development', 'remdo.testing', '', 1],
  ])('selects the settings for %s before starting the runner', (_name, command, inherited, expected, expectedUrl, repeat) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-test-launcher-'));
    directories.push(directory);
    // Copy the actual launchers so E2E cleanup only touches this test's data.
    for (const file of [
      'tools/django.sh', 'tools/e2e/run.sh', 'tools/test/vitest.sh',
      'tools/check-backend.sh', 'tools/postgres.sh',
      'tools/env.sh', 'tools/env.defaults.sh', 'tools/lib/env-file.sh',
    ]) {
      const target = path.join(directory, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, file), target);
    }
    const bin = path.join(directory, 'bin');
    fs.mkdirSync(bin);
    for (const runner of ['uv', 'pnpm']) {
      writeFakeBin(bin, runner, 'if [ "$3" = ruff ]; then exit 0; fi; printf \'%s\' "$DJANGO_SETTINGS_MODULE|$DATABASE_URL"');
    }
    writeFakeBin(bin, 'docker', 'exit 0');
    const result = spawnSync('sh', ['-c', command], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        DJANGO_SETTINGS_MODULE: inherited,
        DATABASE_URL: 'postgresql://staging.example/remdo',
        PG_RUNTIME: '',
        POSTGRES_PORT: '',
        DATA_DIR: path.join(directory, 'data'),
        TMPDIR: path.join(directory, 'tmp'),
        HOST: '127.0.0.1',
        PUBLIC_HOST: '127.0.0.1',
        PORT_BASE: '4600',
        PATH: `${bin}:${path.join(root, 'node_modules/.bin')}:${process.env.PATH}`,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(`${expected}|${expectedUrl}`.repeat(repeat));
  });
});
