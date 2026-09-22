import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

const deployScript = path.resolve('tools/deploy-test.sh');
const temporaryRoots: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-deploy-test-'));
  temporaryRoots.push(root);
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  execFileSync('git', ['init', '--bare', '-q', remote]);
  execFileSync('git', ['init', '-q', work]);
  git(work, 'config', 'user.name', 'RemDo Test');
  git(work, 'config', 'user.email', 'test@example.test');
  fs.writeFileSync(path.join(work, 'state.txt'), 'initial\n');
  git(work, 'add', 'state.txt');
  git(work, 'commit', '-qm', 'initial');
  git(work, 'remote', 'add', 'origin', remote);
  git(work, 'push', '-q', 'origin', 'HEAD:refs/heads/deploy-test');
  return { remote, work };
}

function remoteHead(remote: string): string {
  return execFileSync('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/deploy-test'], {
    encoding: 'utf8',
  }).trim();
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

it('moves the deployment pointer to a clean committed HEAD', () => {
  const { remote, work } = repository();
  fs.writeFileSync(path.join(work, 'state.txt'), 'next\n');
  git(work, 'add', 'state.txt');
  git(work, 'commit', '-qm', 'next');

  const result = spawnSync('sh', [deployScript], { cwd: work, encoding: 'utf8' });

  expect(result.status, result.stderr).toBe(0);
  expect(remoteHead(remote)).toBe(git(work, 'rev-parse', 'HEAD'));
  expect(result.stdout).toContain('https://test.remdo.com');
});

it('refuses to deploy a dirty working tree', () => {
  const { remote, work } = repository();
  const before = remoteHead(remote);
  fs.writeFileSync(path.join(work, 'uncommitted.txt'), 'dirty\n');

  const result = spawnSync('sh', [deployScript], { cwd: work, encoding: 'utf8' });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Working tree must be clean');
  expect(remoteHead(remote)).toBe(before);
});
