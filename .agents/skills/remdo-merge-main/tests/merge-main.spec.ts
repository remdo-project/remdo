// merge-main.sh owns deterministic target pinning, integration, preservation,
// continuation, and restoration for remdo-merge-main.
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
  it('reports idle before a run and leaves an up-to-date branch unchanged', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const before = git(work, 'rev-parse', 'HEAD').stdout;

    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
    const result = run(work, 'start');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('up-to-date');
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(before);
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('fast-forwards to the fixed target without leaving run state', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    pushChange(origin, { 'later.md': '# later\n' }, 'later upstream change');

    const result = run(work, 'start');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('fast-forwarded');
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(
      git(origin, 'rev-parse', 'main').stdout,
    );
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('holds a merge commit for verification and keeps its target pinned', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);

    const started = run(work, 'start');
    const target = value(started.stdout, 'TARGET');

    expect(started.status).toBe(0);
    expect(value(started.stdout, 'STATE')).toBe('verification-needed');
    expect(
      git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').stdout.trim().split(' '),
    ).toHaveLength(3);

    pushChange(origin, { 'later.md': '# later\n' }, 'later upstream change');
    const status = run(work, 'status');
    expect(value(status.stdout, 'TARGET')).toBe(target);
    expect(value(status.stdout, 'STATE')).toBe('verification-needed');

    const finished = run(work, 'finish');
    expect(value(finished.stdout, 'STATE')).toBe('merged');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('refuses dirty work unless preserve mode is explicit', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'a.md', '# dirty\n');

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('working tree is dirty');
    expect(git(work, 'diff', '--', 'a.md').stdout).toContain('# dirty');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('preserves staged, unstaged, and untracked work across a fast-forward', () => {
    const { work, origin } = makeScratchWithOrigin({
      'staged.md': '# staged\n',
      'unstaged.md': '# unstaged\n',
    });
    advanceOrigin(origin);
    writeFile(work, 'staged.md', '# staged local\n');
    expect(git(work, 'add', 'staged.md').status).toBe(0);
    writeFile(work, 'unstaged.md', '# unstaged local\n');
    writeFile(work, 'untracked.md', '# untracked\n');

    const result = run(work, 'start', '--preserve');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('fast-forwarded');
    expect(git(work, 'diff', '--cached', '--name-only').stdout.trim()).toBe(
      'staged.md',
    );
    expect(git(work, 'diff', '--name-only').stdout.trim()).toBe('unstaged.md');
    expect(
      git(work, 'ls-files', '--others', '--exclude-standard').stdout.trim(),
    ).toBe('untracked.md');
    expect(git(work, 'stash', 'list').stdout).toBe('');
  });

  it('preflights branch conflicts before preserving dirty work', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });
    writeFile(work, 'dirty.md', 'dirty\n');

    const result = run(work, 'start', '--preserve');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not merge cleanly');
    expect(git(work, 'stash', 'list').stdout).toBe('');
    expect(
      git(work, 'ls-files', '--others', '--exclude-standard').stdout.trim(),
    ).toBe('dirty.md');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('continues a determined merge resolution into verification', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });

    const started = run(work, 'start');
    expect(value(started.stdout, 'STATE')).toBe('conflicted');

    writeFile(work, 'a.md', 'resolved\n');
    expect(git(work, 'add', 'a.md').status).toBe(0);
    const continued = run(work, 'continue');

    expect(continued.status).toBe(0);
    expect(value(continued.stdout, 'STATE')).toBe('verification-needed');
    expect(
      git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').stdout.trim().split(' '),
    ).toHaveLength(3);
    expect(value(run(work, 'finish').stdout, 'STATE')).toBe('merged');
  });

  it('retains saved work until a restoration conflict is completed', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local dirty\n');
    pushChange(origin, { 'a.md': 'upstream\n' });

    const started = run(work, 'start', '--preserve');

    expect(started.status).toBe(0);
    expect(value(started.stdout, 'STATE')).toBe('restore-conflicted');
    expect(value(started.stdout, 'STASH')).toBeTruthy();
    expect(git(work, 'stash', 'list').stdout).not.toBe('');

    writeFile(work, 'a.md', 'resolved dirty\n');
    expect(git(work, 'add', 'a.md').status).toBe(0);
    expect(git(work, 'reset', '--quiet', '--', 'a.md').status).toBe(0);
    const completed = run(work, 'complete-restore');

    expect(completed.status).toBe(0);
    expect(value(completed.stdout, 'STATE')).toBe('fast-forwarded');
    expect(git(work, 'stash', 'list').stdout).toBe('');
    expect(git(work, 'diff', '--name-only').stdout.trim()).toBe('a.md');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('refuses a detached merge destination', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    expect(git(work, 'checkout', '--quiet', '--detach').status).toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('detached HEAD');
  });

  it('refuses unrelated histories', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const replacement = makeDir('skills-unrelated-');
    expect(
      git(replacement, 'init', '--quiet', '--initial-branch=main').status,
    ).toBe(0);
    writeFile(replacement, 'unrelated.md', '# unrelated\n');
    commitAll(replacement, 'unrelated root');
    expect(git(replacement, 'remote', 'add', 'origin', origin).status).toBe(0);
    expect(
      git(replacement, 'push', '--quiet', '--force', 'origin', 'main').status,
    ).toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unrelated histories');
  });

  it('refuses another Git operation in progress', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    expect(git(work, 'switch', '--quiet', '-c', 'other').status).toBe(0);
    writeFile(work, 'a.md', 'other\n');
    commitAll(work, 'other');
    expect(git(work, 'switch', '--quiet', 'main').status).toBe(0);
    writeFile(work, 'a.md', 'main\n');
    commitAll(work, 'main');
    expect(git(work, 'merge', '--quiet', 'other').status).not.toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('another Git operation');
  });

  it('refuses a missing origin and a non-repository', () => {
    expect(run(makeBareMain({ 'a.md': '# A\n' }), 'start').status).not.toBe(0);
    const nonRepo = run(makeNonRepoDir(), 'start');
    expect(nonRepo.status).not.toBe(0);
    expect(nonRepo.stderr).toContain('not a git repository');
  });
});
