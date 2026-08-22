// Shared resolve-scope.sh: happy paths (inferred default, explicit range,
// uncommitted) and every refusal, exercised in scratch git repos.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTempDirs,
  commitAll,
  git,
  makeDir,
  makeNonRepoDir,
  makeScratchWithOrigin,
  runScript,
  writeFile,
} from '../../_shared/test-support/git-scratch';

const script = path.join(__dirname, '../tools/resolve-scope.sh');
const run = (cwd: string, args: string[] = [], extraPath?: string) =>
  runScript(script, cwd, args, extraPath);

function failingGitProxy(condition: string): string {
  const bin = makeDir('resolve-scope-git-stub-');
  writeFile(
    bin,
    'git',
    `#!/usr/bin/env sh
if ${condition}; then
  exit 23
fi
PATH=\${PATH#*:}
export PATH
exec git "$@"
`,
  );
  fs.chmodSync(path.join(bin, 'git'), 0o755);
  return bin;
}

// A task branch: cloned from origin (main), branched, with one commit ahead.
function taskBranch(): string {
  const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
  git(work, 'switch', '--quiet', '-c', 'feat/x');
  writeFile(work, 'b.md', '# B\n');
  commitAll(work, 'add b');
  return work;
}

afterEach(cleanupTempDirs);

describe('resolve-scope.sh (shared tool)', () => {
  it('infers the origin/main...HEAD default on a task branch', () => {
    const result = run(taskBranch());
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=ready');
    expect(result.stdout).toContain('SELECTION=origin/main...HEAD');
    expect(result.stdout).toContain('KIND=commit-range');
    expect(result.stdout).toMatch(/BASE=[0-9a-f]{40}/);
    expect(result.stdout).toMatch(/HEAD=[0-9a-f]{40}/);
    expect(result.stdout).toContain('b.md');
  });

  it('resolves an explicit range against a clean tree', () => {
    const result = run(taskBranch(), ['HEAD~1..HEAD']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=ready');
    expect(result.stdout).toContain('SELECTION=HEAD~1..HEAD');
    expect(result.stdout).toContain('KIND=commit-range');
    expect(result.stdout).toMatch(/HEAD=[0-9a-f]{40}/);
    expect(result.stdout).toContain('b.md');
  });

  it('refuses a divergent two-dot range', () => {
    const work = taskBranch();
    git(work, 'switch', '--quiet', 'main');
    writeFile(work, 'upstream.md', '# Upstream\n');
    commitAll(work, 'advance main');
    git(work, 'switch', '--quiet', 'feat/x');

    const result = run(work, ['main..HEAD']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('use three-dot for divergent histories');
  });

  it('resolves a divergent three-dot range', () => {
    const work = taskBranch();
    git(work, 'switch', '--quiet', 'main');
    writeFile(work, 'upstream.md', '# Upstream\n');
    commitAll(work, 'advance main');
    git(work, 'switch', '--quiet', 'feat/x');

    const result = run(work, ['main...HEAD']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SELECTION=main...HEAD');
    expect(result.stdout).toContain('KIND=commit-range');
    expect(result.stdout).toContain('b.md');
    expect(result.stdout).not.toContain('upstream.md');
  });

  it('resolves uncommitted scope on a dirty tree', () => {
    const work = taskBranch();
    writeFile(work, 'c.md', '# C uncommitted\n');
    const result = run(work, ['uncommitted']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=ready');
    expect(result.stdout).toContain('SELECTION=uncommitted');
    expect(result.stdout).toContain('KIND=uncommitted');
    expect(result.stdout).toContain('BASE=UNCOMMITTED');
    expect(result.stdout).toMatch(/HEAD=[0-9a-f]{40}/);
    expect(result.stdout).toContain('c.md');
  });

  it('includes index-only staged state', () => {
    // a.md is committed; stage an edit, then restore the worktree copy to HEAD.
    const work = taskBranch();
    writeFile(work, 'a.md', '# A staged\n');
    git(work, 'add', 'a.md');
    writeFile(work, 'a.md', '# A\n');
    const result = run(work, ['uncommitted']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=ready');
    expect(result.stdout).toContain('KIND=uncommitted');
    expect(result.stdout).toContain('a.md');
  });

  it('includes a staged rename restored in the worktree', () => {
    const work = taskBranch();
    git(work, 'mv', 'a.md', 'renamed.md');
    fs.renameSync(
      path.join(work, 'renamed.md'),
      path.join(work, 'a.md'),
    );

    const result = run(work, ['uncommitted']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=ready');
    expect(result.stdout).toContain('a.md');
    expect(result.stdout).toContain('renamed.md');
  });

  it('defaults to uncommitted when the repository is dirty', () => {
    const work = taskBranch();
    writeFile(work, 'a.md', '# A changed\n');
    const result = run(work);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=ready');
    expect(result.stdout).toContain('SELECTION=uncommitted');
    expect(result.stdout).toContain('KIND=uncommitted');
    expect(result.stdout).toContain('a.md');
  });

  it('refuses an explicit commit range when the repository is dirty', () => {
    const work = taskBranch();
    writeFile(work, 'a.md', '# A changed\n');
    const result = run(work, ['origin/main...HEAD']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('dirty');
  });

  it('returns no-change for explicit uncommitted scope on a clean tree', () => {
    const result = run(taskBranch(), ['uncommitted']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=no-change');
    expect(result.stdout).toContain('SELECTION=uncommitted');
    expect(result.stdout).toContain('KIND=uncommitted');
  });

  it('ignores files excluded by Git standard ignore rules', () => {
    const work = taskBranch();
    writeFile(work, '.gitignore', 'ignored.md\n');
    commitAll(work, 'ignore fixture file');
    writeFile(work, 'ignored.md', '# Ignored\n');

    const result = run(work, ['uncommitted']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=no-change');
    expect(result.stdout).not.toContain('ignored.md');
  });

  it('returns no-change for the default on main aligned with origin/main', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const result = run(work);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=no-change');
    expect(result.stdout).toContain('SELECTION=origin/main...HEAD');
    expect(result.stdout).toContain('KIND=commit-range');
  });

  it('uses the default normally on a dev branch', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    git(work, 'switch', '--quiet', '-c', 'dev');
    writeFile(work, 'dev.md', '# Dev\n');
    commitAll(work, 'advance dev');

    const result = run(work);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=ready');
    expect(result.stdout).toContain('SELECTION=origin/main...HEAD');
    expect(result.stdout).toContain('KIND=commit-range');
    expect(result.stdout).toContain('dev.md');
  });

  it('refuses when there is no merge-base with origin/main', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    // Orphan branch shares no history with origin/main.
    git(work, 'switch', '--quiet', '--orphan', 'feat/orphan');
    writeFile(work, 'z.md', '# Z\n');
    commitAll(work, 'orphan root');
    const result = run(work);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('merge-base');
  });

  it('refuses an explicit range whose right revision is not HEAD', () => {
    const work = taskBranch();
    writeFile(work, 'c.md', '# C\n');
    commitAll(work, 'add c');
    const result = run(work, ['HEAD~2..HEAD~1']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('resolve to HEAD');
  });

  it('refuses an explicit three-dot range whose right revision is not HEAD', () => {
    const work = taskBranch();
    writeFile(work, 'c.md', '# C\n');
    commitAll(work, 'add c');
    const result = run(work, ['HEAD~2...HEAD~1']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('resolve to HEAD');
  });

  it('reports a non-HEAD right revision before checking two-dot ancestry', () => {
    const work = taskBranch();
    git(work, 'switch', '--quiet', 'main');
    writeFile(work, 'upstream.md', '# Upstream\n');
    commitAll(work, 'advance main');
    git(work, 'switch', '--quiet', 'feat/x');

    const result = run(work, ['main..HEAD~1']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('resolve to HEAD');
    expect(result.stderr).not.toContain('ancestor');
  });

  it('refuses an explicit range with a missing revision', () => {
    expect(run(taskBranch(), ['..HEAD']).stderr).toContain('left revision is missing');
    expect(run(taskBranch(), ['HEAD..']).stderr).toContain('right revision is missing');
  });

  it.each([
    'HEAD~1..HEAD~1..HEAD',
    'HEAD~1...HEAD~1...HEAD',
    'HEAD~1..HEAD...HEAD',
    'HEAD~1...HEAD..HEAD',
  ])('refuses malformed range %s', range => {
    const result = run(taskBranch(), [range]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not resolve to a commit');
  });

  it('still resolves a range whose endpoints contain single dots', () => {
    const work = taskBranch();
    git(work, 'tag', 'v1.0.0');
    writeFile(work, 'c.md', '# C\n');
    commitAll(work, 'add c');
    git(work, 'tag', 'v1.0.1');

    const result = run(work, ['v1.0.0..v1.0.1']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SELECTION=v1.0.0..v1.0.1');
    expect(result.stdout).toContain('KIND=commit-range');
  });

  it('returns no-change for an empty explicit commit range', () => {
    const result = run(taskBranch(), ['HEAD..HEAD']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=no-change');
    expect(result.stdout).toContain('SELECTION=HEAD..HEAD');
    expect(result.stdout).toContain('KIND=commit-range');
  });

  it('fails when an uncommitted file query fails instead of returning a partial list', () => {
    const work = taskBranch();
    writeFile(work, 'c.md', '# C uncommitted\n');
    const bin = failingGitProxy(
      '[ "$1" = diff ] && [ "$2" = --cached ]',
    );

    const result = run(work, ['uncommitted'], bin);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'git diff --cached failed while resolving uncommitted files',
    );
  });

  it('fails with resolver context when the commit-range file query fails', () => {
    const work = taskBranch();
    const bin = failingGitProxy('[ "$1" = diff ] && [ "$2" = --name-only ]');

    const result = run(work, ['HEAD~1..HEAD'], bin);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('git diff --name-only failed while resolving commit-range files');
  });

  it('fails instead of classifying a broken Git status query as dirty', () => {
    const work = taskBranch();
    const bin = failingGitProxy('[ "$1" = status ] && [ "$2" = --porcelain=v1 ]');

    const result = run(work, ['HEAD~1..HEAD'], bin);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('git status --porcelain failed while checking working tree state');
    expect(result.stderr).not.toContain('repository is dirty');
  });

  it('fails through the documented format when an explicit range meets an unborn HEAD', () => {
    const work = taskBranch();
    const tip = git(work, 'rev-parse', 'HEAD').stdout.trim();
    git(work, 'switch', '--quiet', '--orphan', 'orphan');
    git(work, 'rm', '-rf', '--quiet', '.');

    const result = run(work, [`${tip}..${tip}`]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('STATE=failed');
    expect(result.stderr).toContain(`INPUT=${tip}..${tip}`);
    expect(result.stderr).toContain('REASON=HEAD does not resolve to a commit');
    expect(result.stderr).not.toContain('Needed a single revision');
    expect(result.stdout).not.toContain('HEAD=');
  });

  it('fails when uncommitted HEAD cannot be resolved', () => {
    const work = taskBranch();
    writeFile(work, 'c.md', '# C uncommitted\n');
    const bin = failingGitProxy(
      '[ "$1" = rev-parse ] && [ "$2" = --verify ] && [ "$3" = HEAD ]',
    );

    const result = run(work, ['uncommitted'], bin);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('HEAD does not resolve to a commit');
    expect(result.stdout).not.toContain('HEAD=');
  });

  it('refuses an explicit range whose left revision does not resolve', () => {
    const result = run(taskBranch(), ['deadbeef..HEAD']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not resolve');
  });

  it('refuses an explicit range whose right revision does not resolve', () => {
    const result = run(taskBranch(), ['HEAD~1..deadbeef']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not resolve');
  });

  it('resolves the clean default on a detached HEAD', () => {
    const work = taskBranch();
    git(work, 'checkout', '--quiet', '--detach', 'HEAD');
    const result = run(work);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=ready');
    expect(result.stdout).toContain('SELECTION=origin/main...HEAD');
    expect(result.stdout).toContain('KIND=commit-range');
  });

  it('resolves the dirty default as uncommitted on a detached HEAD', () => {
    const work = taskBranch();
    git(work, 'checkout', '--quiet', '--detach', 'HEAD');
    writeFile(work, 'c.md', '# C\n');
    const result = run(work);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=ready');
    expect(result.stdout).toContain('SELECTION=uncommitted');
    expect(result.stdout).toContain('KIND=uncommitted');
    expect(result.stdout).toContain('c.md');
  });

  it('refuses an unrecognized scope argument', () => {
    const result = run(taskBranch(), ['nonsense']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('STATE=failed');
    expect(result.stderr).toContain('INPUT=nonsense');
    expect(result.stderr).toContain('REASON=unrecognized scope');
  });

  it('preserves backslash escapes in failed result fields', () => {
    const result = run(taskBranch(), ['foo\\c']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toBe(
      "STATE=failed\nINPUT=foo\\c\nREASON=unrecognized scope 'foo\\c' — expected a range (A..B / A...B) or 'uncommitted'\n",
    );
  });

  it('refuses more than one scope input', () => {
    const result = run(taskBranch(), ['uncommitted', 'HEAD~1..HEAD']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('STATE=failed');
    expect(result.stderr).not.toContain('INPUT=');
    expect(result.stderr).toContain('REASON=expected at most one scope input');
  });

  it('fails loud outside a git repository', () => {
    const result = run(makeNonRepoDir());
    expect(result.status).not.toBe(0);
    expect(result.stderr).toBe(
      'STATE=failed\nREASON=not a git repository\n',
    );
  });
});
