// merge-main.sh owns deterministic fetch and merge operations for
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

  it('prepares a merge and commits it only after continuation', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    const before = git(work, 'rev-parse', 'HEAD').stdout;

    const result = run(work, 'start');
    const target = value(result.stdout, 'TARGET')!;

    expect(result.status).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('merge-ready');
    expect(value(result.stdout, 'FORM')).toBe('merge-commit');
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(before);
    expect(git(work, 'rev-parse', 'MERGE_HEAD').stdout.trim()).toBe(target);

    expect(value(run(work, 'continue', target).stdout, 'STATE')).toBe('merged');
    expect(
      git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').stdout.trim().split(' '),
    ).toHaveLength(3);
  });

  it.each(['staged', 'unstaged', 'untracked'])(
    'refuses %s work before fetching and leaves it unchanged',
    (state) => {
      const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
      const previousTarget = git(work, 'rev-parse', 'origin/main').stdout;
      const previousHead = git(work, 'rev-parse', 'HEAD').stdout;
      advanceOrigin(origin);
      const file = state === 'untracked' ? 'untracked.md' : 'a.md';
      writeFile(work, file, 'dirty\n');
      if (state === 'staged') {
        expect(git(work, 'add', file).status).toBe(0);
      }
      const previousStatus = git(work, 'status', '--porcelain=v1').stdout;
      const previousIndex = git(work, 'diff', '--cached').stdout;

      const result = run(work, 'start');

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('working tree is dirty');
      expect(git(work, 'rev-parse', 'origin/main').stdout).toBe(previousTarget);
      expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(previousHead);
      expect(git(work, 'status', '--porcelain=v1').stdout).toBe(previousStatus);
      expect(git(work, 'diff', '--cached').stdout).toBe(previousIndex);
      expect(fs.readFileSync(path.join(work, file), 'utf8')).toBe('dirty\n');
      expect(git(work, 'stash', 'list').stdout).toBe('');
    },
  );

  it('leaves merge conflicts for resolution before continuation', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });

    const started = run(work, 'start');
    const target = value(started.stdout, 'TARGET')!;

    expect(started.status, started.stderr).toBe(0);
    expect(value(started.stdout, 'STATE')).toBe('conflicted');
    expect(started.stdout.startsWith('STATE=')).toBe(true);
    expect(git(work, 'diff', '--name-only', '--diff-filter=U').stdout).toBe('a.md\n');
    const unresolved = run(work, 'continue', target);
    expect(unresolved.status).not.toBe(0);
    expect(unresolved.stderr).toContain('merge conflicts remain unresolved');

    writeFile(work, 'a.md', 'resolved\n');
    expect(git(work, 'add', 'a.md').status).toBe(0);
    const continued = run(work, 'continue', target);

    expect(continued.status, continued.stderr).toBe(0);
    expect(continued.stdout.startsWith('STATE=')).toBe(true);
    expect(value(continued.stdout, 'STATE')).toBe('merged');
    expect(git(work, 'show', 'HEAD:a.md').stdout).toBe('resolved\n');
  });

  it('fetches remote main even when the configured fetch map excludes it', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    advanceOrigin(origin);
    expect(git(work, 'config', '--unset-all', 'remote.origin.fetch').status).toBe(
      0,
    );
    expect(
      git(
        work,
        'config',
        '--add',
        'remote.origin.fetch',
        '+refs/heads/other:refs/remotes/origin/other',
      ).status,
    ).toBe(0);

    const result = run(work, 'start');

    expect(result.status, result.stderr).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('fast-forwarded');
    expect(value(result.stdout, 'TARGET')).toBe(
      git(origin, 'rev-parse', 'main').stdout.trim(),
    );
    expect(git(work, 'rev-parse', 'origin/main').stdout).toBe(
      git(origin, 'rev-parse', 'main').stdout,
    );
  });

  it('does not fetch tags when remote configuration requests it', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    expect(git(origin, 'tag', 'release', 'main').status).toBe(0);
    expect(git(work, 'tag', 'local-only').status).toBe(0);
    expect(git(work, 'config', 'remote.origin.tagOpt', '--tags').status).toBe(0);

    const result = run(work, 'start');

    expect(result.status, result.stderr).toBe(0);
    expect(git(work, 'tag', '--list').stdout).toBe('local-only\n');
  });

  it('does not reuse stale origin/main after remote main is deleted', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    expect(git(origin, 'update-ref', '-d', 'refs/heads/main').status).toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('could not fetch origin/main');
  });

  it('does not run merge hooks after the pending tree is verified', () => {
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
    fs.writeFileSync(hook, [
      '#!/usr/bin/env sh',
      'printf hook > hook.md',
      'git add hook.md',
      'exit 1',
      '',
    ].join('\n'));
    fs.chmodSync(hook, 0o755);

    const started = run(work, 'start');
    const continued = run(work, 'continue', value(started.stdout, 'TARGET')!);

    expect(continued.status, continued.stderr).toBe(0);
    expect(value(continued.stdout, 'STATE')).toBe('merged');
    expect(fs.existsSync(path.join(work, 'hook.md'))).toBe(false);
  });

  it('refuses to continue with unstaged or untracked resolution work', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': 'base\n' });
    writeFile(work, 'a.md', 'local\n');
    commitAll(work, 'local');
    pushChange(origin, { 'a.md': 'upstream\n' });
    const started = run(work, 'start');
    const target = value(started.stdout, 'TARGET')!;
    writeFile(work, 'a.md', 'resolved\n');
    expect(git(work, 'add', 'a.md').status).toBe(0);
    writeFile(work, 'a.md', 'unstaged remainder\n');

    const unstaged = run(work, 'continue', target);
    expect(unstaged.status).not.toBe(0);
    expect(unstaged.stderr).toContain('unstaged merge-resolution changes');

    writeFile(work, 'a.md', 'resolved\n');
    writeFile(work, 'scratch.md', 'untracked remainder\n');
    const untracked = run(work, 'continue', target);
    expect(untracked.status).not.toBe(0);
    expect(untracked.stderr).toContain('untracked merge-resolution files');

    fs.rmSync(path.join(work, 'scratch.md'));
    expect(value(run(work, 'continue', target).stdout, 'STATE')).toBe(
      'merged',
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

    expect(value(result.stdout, 'STATE')).toBe('merge-ready');
    expect(
      value(run(work, 'continue', value(result.stdout, 'TARGET')!).stdout, 'STATE'),
    ).toBe('merged');
    expect(
      git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').stdout.trim().split(' '),
    ).toHaveLength(3);
  });

  it('neutralizes merge options with a zero-padded inherited config count', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(
      git(work, 'config', 'branch.main.mergeOptions', '--strategy=ours').status,
    ).toBe(0);
    const inheritedConfig: NodeJS.ProcessEnv = { GIT_CONFIG_COUNT: '010' };
    for (let index = 0; index < 10; index += 1) {
      inheritedConfig[`GIT_CONFIG_KEY_${index}`] = `test.inherited${index}`;
      inheritedConfig[`GIT_CONFIG_VALUE_${index}`] = `${index}`;
    }

    const result = runScript(
      script,
      work,
      ['start'],
      undefined,
      inheritedConfig,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('merge-ready');
    expect(fs.readFileSync(path.join(work, 'upstream.md'), 'utf8')).toBe(
      '# upstream\n',
    );
  });

  it('neutralizes merge options for a branch name containing equals', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    expect(git(work, 'branch', '--move', 'feat/a=b').status).toBe(0);
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    expect(
      git(
        work,
        'config',
        'branch.feat/a=b.mergeOptions',
        '--strategy=ours',
      ).status,
    ).toBe(0);

    const result = run(work, 'start');

    expect(result.status, result.stderr).toBe(0);
    expect(value(result.stdout, 'STATE')).toBe('merge-ready');
    expect(fs.readFileSync(path.join(work, 'upstream.md'), 'utf8')).toBe(
      '# upstream\n',
    );
  });

  it('reports failed integration without advancing the branch', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    advanceOrigin(origin);
    const previousHead = git(work, 'rev-parse', 'HEAD').stdout;
    const bin = makeDir('skills-merge-failure-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        'if [ "$1" = merge ] || [ "$2" = merge ]; then exit 91; fi',
        // eslint-disable-next-line no-template-curly-in-string -- Expanded by the shell.
        'PATH=${PATH#*:}',
        'export PATH',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const result = runScript(script, work, ['start'], bin);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('integration failed');
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(previousHead);
    expect(git(work, 'status', '--porcelain=v1').stdout).toBe('');
  });

  it('reports an unexpected operation left by integration', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local');
    advanceOrigin(origin);
    const bin = makeDir('skills-foreign-merge-wrapper-');
    const gitWrapper = path.join(bin, 'git');
    writeFile(
      bin,
      'git',
      [
        '#!/usr/bin/env sh',
        // eslint-disable-next-line no-template-curly-in-string -- Expanded by the shell.
        'PATH=${PATH#*:}',
        'export PATH',
        'if [ "$1" = merge ] || [ "$2" = merge ]; then',
        '  git rev-parse HEAD > "$(git rev-parse --git-path MERGE_HEAD)"',
        '  exit 91',
        'fi',
        'exec git "$@"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(gitWrapper, 0o755);

    const result = runScript(script, work, ['start'], bin);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('an unexpected Git operation remains');
    expect(git(work, 'rev-parse', 'MERGE_HEAD').stdout).toBe(
      git(work, 'rev-parse', 'HEAD').stdout,
    );
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
    const target = git(other, 'rev-parse', 'main').stdout;
    expect(git(work, 'remote', 'set-url', 'origin', other).status).toBe(0);

    const result = run(work, 'start');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unrelated histories');
    expect(git(work, 'rev-parse', 'origin/main').stdout).toBe(target);
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
