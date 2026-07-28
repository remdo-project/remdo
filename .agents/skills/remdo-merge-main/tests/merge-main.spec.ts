// merge-main.sh owns deterministic fetch, merge, and saved-work operations for
// remdo-merge-main. Semantic conflict resolution and verification stay with the
// executing agent.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  advanceOrigin,
  cleanupTempDirs,
  commitAll,
  git,
  makeBareMain,
  makeDir,
  makeNonRepoDir,
  makeScratchWithOrigin,
  runScript,
  writeFile,
} from '../../_shared/test-support/git-scratch';

const script = path.join(__dirname, '../tools/merge-main.sh');
const run = (cwd: string, ...args: string[]) => runScript(script, cwd, args);
const value = (stdout: string, key: string) =>
  stdout.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1];

function pushChange(
  origin: string,
  files: Record<string, string>,
  message = 'upstream change',
): void {
  const pusher = makeDir('skills-pusher-');
  expect(git(pusher, 'clone', '--quiet', origin, '.').status).toBe(0);
  for (const [file, content] of Object.entries(files)) {
    writeFile(pusher, file, content);
  }
  commitAll(pusher, message);
  expect(git(pusher, 'push', '--quiet', 'origin', 'main').status).toBe(0);
}

afterEach(cleanupTempDirs);

describe('merge-main.sh', () => {
  it('leaves an up-to-date branch unchanged', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const before = git(work, 'rev-parse', 'HEAD').stdout;

    const result = run(work, 'start');

    expect(result.status, result.stderr).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('up-to-date');
    expect(value(result.stdout, 'FORM')).toBe('up-to-date');
    expect(value(result.stdout, 'INCOMING')).toBe('0');
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(before);
  });

  it('fast-forwards to the fetched target', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    advanceOrigin(origin);

    const result = run(work, 'start');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('fast-forwarded');
    expect(value(result.stdout, 'FORM')).toBe('fast-forward');
    expect(value(result.stdout, 'TARGET')).toBe(
      git(origin, 'rev-parse', 'main').stdout.trim(),
    );
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(
      git(origin, 'rev-parse', 'main').stdout,
    );
  });

  it('creates a merge commit and requests verification', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);

    const result = run(work, 'start');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('verification-needed');
    expect(value(result.stdout, 'FORM')).toBe('merge-commit');
    expect(
      git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').stdout.trim().split(' '),
    ).toHaveLength(3);
  });

  it('refuses dirty work before fetching unless preserve mode is explicit', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const previousTarget = git(work, 'rev-parse', 'origin/main').stdout;
    advanceOrigin(origin);
    writeFile(work, 'a.md', 'dirty\n');

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('working tree is dirty');
    expect(git(work, 'rev-parse', 'origin/main').stdout).toBe(previousTarget);
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('dirty\n');
  });

  it('does not stash dirty work when the branch is already up to date', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'a.md', 'dirty\n');

    const result = run(work, 'start', '--preserve');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('up-to-date');
    expect(value(result.stdout, 'PRESERVED')).toBe('no');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe('dirty\n');
    expect(git(work, 'stash', 'list').stdout).toBe('');
  });

  it('restores staged, unstaged, and untracked work after a fast-forward', () => {
    const { work, origin } = makeScratchWithOrigin({
      'staged.md': 'base staged\n',
      'unstaged.md': 'base unstaged\n',
    });
    advanceOrigin(origin);
    writeFile(work, 'staged.md', 'saved staged\n');
    expect(git(work, 'add', 'staged.md').status).toBe(0);
    writeFile(work, 'unstaged.md', 'saved unstaged\n');
    writeFile(work, 'untracked.md', 'saved untracked\n');

    const result = run(work, 'start', '--preserve');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('fast-forwarded');
    expect(value(result.stdout, 'PRESERVED')).toBe('yes');
    expect(git(work, 'diff', '--cached', '--name-only').stdout).toBe(
      'staged.md\n',
    );
    expect(git(work, 'diff', '--name-only').stdout).toBe('unstaged.md\n');
    expect(fs.readFileSync(path.join(work, 'untracked.md'), 'utf8')).toBe(
      'saved untracked\n',
    );
    expect(git(work, 'stash', 'list').stdout).toBe('');
  });

  it('keeps saved work until a merge commit is verified', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    writeFile(work, 'dirty.md', 'saved work\n');

    const started = run(work, 'start', '--preserve');
    const stash = value(started.stdout, 'STASH')!;

    expect(value(started.stdout, 'STATE')).toBe('verification-needed');
    expect(fs.existsSync(path.join(work, 'dirty.md'))).toBe(false);
    expect(git(work, 'stash', 'list', '--format=%H').stdout.trim()).toBe(stash);

    const restored = run(work, 'restore', stash);
    expect(value(restored.stdout, 'STATE')).toBe('restored');
    expect(fs.readFileSync(path.join(work, 'dirty.md'), 'utf8')).toBe(
      'saved work\n',
    );
    expect(git(work, 'stash', 'list').stdout).toBe('');
  });

  it('allows preserve mode to enter ordinary merge conflict resolution', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });
    writeFile(work, 'dirty.md', 'saved work\n');

    const started = run(work, 'start', '--preserve');
    const target = value(started.stdout, 'TARGET')!;
    const stash = value(started.stdout, 'STASH')!;

    expect(value(started.stdout, 'STATE')).toBe('conflicted');
    expect(fs.existsSync(path.join(work, 'dirty.md'))).toBe(false);
    writeFile(work, 'a.md', 'resolved\n');
    expect(git(work, 'add', 'a.md').status).toBe(0);

    const continued = run(work, 'continue', target);
    expect(value(continued.stdout, 'STATE')).toBe('verification-needed');
    expect(value(run(work, 'restore', stash).stdout, 'STATE')).toBe('restored');
    expect(fs.readFileSync(path.join(work, 'dirty.md'), 'utf8')).toBe(
      'saved work\n',
    );
  });

  it('retains the stash until a restoration conflict is resolved', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    pushChange(origin, { 'a.md': 'upstream\n' });
    writeFile(work, 'a.md', 'saved work\n');

    const started = run(work, 'start', '--preserve');
    const stash = value(started.stdout, 'STASH')!;

    expect(value(started.stdout, 'STATE')).toBe('restore-conflicted');
    expect(git(work, 'diff', '--name-only', '--diff-filter=U').stdout).toBe(
      'a.md\n',
    );
    expect(git(work, 'stash', 'list', '--format=%H').stdout.trim()).toBe(stash);

    writeFile(work, 'a.md', 'resolved saved work\n');
    expect(git(work, 'add', 'a.md').status).toBe(0);
    expect(git(work, 'reset', '--quiet', 'HEAD', '--', 'a.md').status).toBe(0);
    const completed = run(work, 'complete-restore', stash);

    expect(value(completed.stdout, 'STATE')).toBe('restored');
    expect(git(work, 'stash', 'list').stdout).toBe('');
    expect(fs.readFileSync(path.join(work, 'a.md'), 'utf8')).toBe(
      'resolved saved work\n',
    );
  });

  it('reports a hook-rejected merge commit as ready to continue', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    const hook = git(
      work,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'hooks/pre-merge-commit',
    ).stdout.trim();
    fs.writeFileSync(hook, '#!/usr/bin/env sh\nexit 1\n');
    fs.chmodSync(hook, 0o755);

    const started = run(work, 'start');
    const target = value(started.stdout, 'TARGET')!;

    expect(value(started.stdout, 'STATE')).toBe('merge-ready');
    fs.rmSync(hook);
    expect(value(run(work, 'continue', target).stdout, 'STATE')).toBe(
      'verification-needed',
    );
  });

  it('neutralizes branch merge options that would squash integration', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(
      git(work, 'config', 'branch.main.mergeOptions', '--squash').status,
    ).toBe(0);

    const result = run(work, 'start');

    expect(value(result.stdout, 'STATE')).toBe('verification-needed');
    expect(
      git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').stdout.trim().split(' '),
    ).toHaveLength(3);
  });

  it('uses conditional Git configuration from the real repository', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    advanceOrigin(origin);
    const gitDir = git(
      work,
      'rev-parse',
      '--path-format=absolute',
      '--git-dir',
    ).stdout.trim();
    const included = path.join(makeDir('skills-include-'), 'origin.conf');
    fs.writeFileSync(included, `[remote "origin"]\n\turl = ${origin}\n`);
    expect(git(work, 'config', '--unset', 'remote.origin.url').status).toBe(0);
    expect(
      git(
        work,
        'config',
        `includeIf.gitdir:${gitDir}.path`,
        included,
      ).status,
    ).toBe(0);

    const result = run(work, 'start');

    expect(result.status, result.stderr).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('fast-forwarded');
  });

  it('refuses an unrelated target history', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const other = makeBareMain({ 'other.md': '# other\n' });
    expect(git(work, 'remote', 'set-url', 'origin', other).status).toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unrelated histories');
  });

  it('refuses a detached destination', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    expect(git(work, 'checkout', '--quiet', '--detach').status).toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('attached branch');
  });

  it('refuses another Git operation already in progress', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });
    expect(git(work, 'fetch', '--quiet', 'origin').status).toBe(0);
    expect(git(work, 'merge', '--quiet', 'origin/main').status).not.toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('another Git operation');
  });

  it('refuses a non-repository', () => {
    const result = run(makeNonRepoDir(), 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not a git repository');
  });
});
