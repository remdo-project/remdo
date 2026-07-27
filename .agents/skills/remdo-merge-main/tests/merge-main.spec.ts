// merge-main.sh owns deterministic target pinning, integration, preservation,
// continuation, and restoration for remdo-merge-main.
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
const stateDir = (cwd: string) =>
  git(
    cwd,
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'remdo-merge-main',
  ).stdout.trim();

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

  it('persists a recovered verification phase after merge interruption', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(value(run(work, 'start').stdout, 'STATE')).toBe(
      'verification-needed',
    );
    writeFile(stateDir(work), 'phase', 'merging\n');

    const recovered = run(work, 'status');

    expect(value(recovered.stdout, 'STATE')).toBe('verification-needed');
    expect(
      fs.readFileSync(path.join(stateDir(work), 'phase'), 'utf8'),
    ).toBe('verification\n');
    expect(value(run(work, 'finish').stdout, 'STATE')).toBe('merged');
  });

  it('retries integration interrupted before the branch changes', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    const bin = makeDir('skills-merge-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = merge ]; then',
        '  kill -KILL "$PPID"',
        '  exit 91',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const interrupted = runScript(script, work, ['start'], bin);

    expect(interrupted.status).not.toBe(0);
    expect(value(run(work, 'status').stdout, 'STATE')).toBe(
      'integration-ready',
    );
    expect(value(run(work, 'continue').stdout, 'STATE')).toBe(
      'verification-needed',
    );
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
    expect(result.stdout.startsWith('STATE=fast-forwarded\n')).toBe(true);
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

  it('does not adopt an older stash when dirty submodule work is not stashable', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const submodule = makeBareMain({ 'nested.md': '# nested\n' });
    expect(
      git(
        work,
        '-c',
        'protocol.file.allow=always',
        'submodule',
        'add',
        '--quiet',
        submodule,
        'nested',
      ).status,
    ).toBe(0);
    commitAll(work, 'add submodule');
    writeFile(work, 'a.md', '# older stash\n');
    expect(git(work, 'stash', 'push', '--quiet').status).toBe(0);
    const olderStash = git(work, 'rev-parse', 'refs/stash').stdout;
    writeFile(path.join(work, 'nested'), 'nested.md', '# dirty nested\n');

    const result = run(work, 'start', '--preserve');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('could not be preserved');
    expect(git(work, 'rev-parse', 'refs/stash').stdout).toBe(olderStash);
    expect(
      git(path.join(work, 'nested'), 'diff', '--name-only').stdout.trim(),
    ).toBe('nested.md');
    expect(run(work, 'status').stdout).toBe('STATE=idle\n');
  });

  it('journals preservation before invoking stash and resumes it', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-stash-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = stash ] && [ "$2" = push ]; then',
        '  exit 91',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const interrupted = runScript(
      script,
      work,
      ['start', '--preserve'],
      bin,
    );

    expect(interrupted.status).not.toBe(0);
    expect(value(run(work, 'status').stdout, 'STATE')).toBe(
      'preservation-needed',
    );
    expect(value(run(work, 'continue').stdout, 'STATE')).toBe('up-to-date');
    expect(git(work, 'diff', '--name-only').stdout.trim()).toBe('a.md');
    expect(git(work, 'stash', 'list').stdout).toBe('');
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

  it('creates a divergent merge commit when Git is configured for ff-only', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(git(work, 'config', 'merge.ff', 'only').status).toBe(0);

    const result = run(work, 'start');

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('verification-needed');
    expect(
      git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').stdout.trim().split(' '),
    ).toHaveLength(3);
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

  it('does not drop saved work from an ambiguous restoration phase', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local dirty\n');
    pushChange(origin, { 'a.md': 'upstream\n' });
    expect(value(run(work, 'start', '--preserve').stdout, 'STATE')).toBe(
      'restore-conflicted',
    );
    const saved = git(work, 'rev-parse', 'refs/stash').stdout;
    writeFile(stateDir(work), 'phase', 'restore-pending\n');

    expect(value(run(work, 'status').stdout, 'STATE')).toBe('stopped');
    const completed = run(work, 'complete-restore');
    expect(completed.status).not.toBe(0);
    expect(git(work, 'rev-parse', 'refs/stash').stdout).toBe(saved);
  });

  it('retains a stopped result through restoration conflict completion', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    advanceOrigin(origin);
    writeFile(work, 'a.md', 'saved work\n');
    const bin = makeDir('skills-git-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = merge ]; then',
        '  printf "merge failure\\n" >a.md',
        '  exit 1',
        'fi',
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const started = runScript(
      script,
      work,
      ['start', '--preserve'],
      bin,
    );

    expect(started.status).not.toBe(0);
    expect(value(started.stdout, 'STATE')).toBe('restore-conflicted');
    writeFile(work, 'a.md', 'resolved work\n');
    const completed = run(work, 'complete-restore');
    expect(value(completed.stdout, 'STATE')).toBe('stopped');
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
