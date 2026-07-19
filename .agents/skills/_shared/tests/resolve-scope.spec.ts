// Shared resolve-scope.sh: happy paths (inferred default, explicit range,
// working-tree) and every refusal, exercised in scratch git repos.
import { execFileSync } from 'node:child_process';
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

const run = (cwd: string, args: string[] = []) => runScript(path.join(__dirname, '../tools/resolve-scope.sh'), cwd, args);

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
    expect(result.stdout).toContain('SCOPE=committed-range');
    expect(result.stdout).toMatch(/BASE=[0-9a-f]{40}/);
    expect(result.stdout).toMatch(/HEAD_SHA=[0-9a-f]{40}/);
    expect(result.stdout).toContain('b.md');
  });

  it('resolves an explicit range against a clean tree', () => {
    const result = run(taskBranch(), ['HEAD~1..HEAD']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SCOPE=committed-range');
    expect(result.stdout).toMatch(/HEAD_SHA=[0-9a-f]{40}/);
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
    expect(result.stdout).toContain('SCOPE=committed-range');
    expect(result.stdout).toContain('b.md');
    expect(result.stdout).not.toContain('upstream.md');
  });

  it('resolves working-tree scope on a dirty tree', () => {
    const work = taskBranch();
    writeFile(work, 'c.md', '# C uncommitted\n');
    const result = run(work, ['working-tree']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SCOPE=working-tree');
    expect(result.stdout).toContain('BASE=WORKING_TREE');
    expect(result.stdout).toMatch(/HEAD_SHA=[0-9a-f]{40}/);
    expect(result.stdout).toContain('c.md');
  });

  it('lists a staged-then-reverted file in working-tree scope', () => {
    // a.md is committed; stage an edit, then restore the worktree copy to HEAD.
    // The index differs from HEAD but the worktree matches it, so `diff HEAD`
    // alone misses the file — the scope must still list it (staged counts).
    const work = taskBranch();
    writeFile(work, 'a.md', '# A staged\n');
    git(work, 'add', 'a.md');
    writeFile(work, 'a.md', '# A\n');
    const result = run(work, ['working-tree']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SCOPE=working-tree');
    expect(result.stdout).toContain('a.md');
  });

  it('refuses a committed range when the tree is dirty (mixed scope)', () => {
    const work = taskBranch();
    writeFile(work, 'a.md', '# A changed\n');
    const result = run(work); // inferred committed-range default
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('dirty');
  });

  it('refuses working-tree scope on a clean tree', () => {
    const result = run(taskBranch(), ['working-tree']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('clean');
  });

  it('refuses the default on an integration branch (main)', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    // clone leaves us on main
    const result = run(work);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('integration branch');
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

  it('refuses a range with more than one delimiter instead of silently keeping only the outer endpoints', () => {
    const work = taskBranch();
    const result = run(work, ['HEAD~1..HEAD~1..HEAD']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('more than one delimiter');
  });

  it('refuses a three-dot range with an extra delimiter', () => {
    const result = run(taskBranch(), ['HEAD~1...HEAD~1...HEAD']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('more than one delimiter');
  });

  it('refuses mixed range delimiters in either order', () => {
    const work = taskBranch();

    expect(run(work, ['HEAD~1..HEAD...HEAD']).stderr).toContain('more than one delimiter');
    expect(run(work, ['HEAD~1...HEAD..HEAD']).stderr).toContain('more than one delimiter');
  });

  it('still resolves a range whose endpoints contain single dots', () => {
    const work = taskBranch();
    git(work, 'tag', 'v1.0.0');
    writeFile(work, 'c.md', '# C\n');
    commitAll(work, 'add c');
    git(work, 'tag', 'v1.0.1');

    const result = run(work, ['v1.0.0..v1.0.1']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SCOPE=committed-range');
  });

  it('fails when a working-tree file query fails instead of returning a partial list', () => {
    const work = taskBranch();
    writeFile(work, 'c.md', '# C uncommitted\n');
    const bin = makeDir('resolve-scope-git-stub-');
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    writeFile(
      bin,
      'git',
      `#!/usr/bin/env sh
if [ "$1" = diff ] && [ "$2" = --cached ] && [ "$3" = --name-only ]; then
  exit 23
fi
exec ${realGit} "$@"
`,
    );
    fs.chmodSync(path.join(bin, 'git'), 0o755);

    const result = runScript(path.join(__dirname, '../tools/resolve-scope.sh'), work, ['working-tree'], bin);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('git diff --cached --name-only failed');
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

  it('refuses the no-arg default on a detached HEAD', () => {
    const work = taskBranch();
    git(work, 'checkout', '--quiet', '--detach', 'HEAD');
    const result = run(work);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('detached HEAD');
  });

  it('refuses an unrecognized scope argument', () => {
    const result = run(taskBranch(), ['nonsense']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unrecognized scope');
  });

  it('fails loud outside a git repository', () => {
    const result = run(makeNonRepoDir());
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not a git repository');
  });
});
