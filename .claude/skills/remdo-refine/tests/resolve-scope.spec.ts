// resolve-scope.sh (skill-local tools/): happy paths (inferred default, explicit range,
// working-tree) and every refusal, exercised in scratch git repos.
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTempDirs,
  commitAll,
  git,
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

describe('resolve-scope.sh (skill-local tools/)', () => {
  it('infers the origin/main...HEAD default on a task branch', () => {
    const result = run(taskBranch());
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SCOPE=committed-range');
    expect(result.stdout).toMatch(/BASE=[0-9a-f]{40}/);
    expect(result.stdout).toContain('b.md');
  });

  it('resolves an explicit range against a clean tree', () => {
    const result = run(taskBranch(), ['HEAD~1..HEAD']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SCOPE=committed-range');
    expect(result.stdout).toContain('b.md');
  });

  it('resolves working-tree scope on a dirty tree', () => {
    const work = taskBranch();
    writeFile(work, 'c.md', '# C uncommitted\n');
    const result = run(work, ['working-tree']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SCOPE=working-tree');
    expect(result.stdout).toContain('BASE=WORKING_TREE');
    expect(result.stdout).toContain('c.md');
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

  it('refuses an explicit range whose tip is not HEAD', () => {
    // The review loop walks base..HEAD, so a range ending at HEAD~1 would review
    // a different tip than the loop; refuse it.
    const result = run(taskBranch(), ['HEAD~1..HEAD~1']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not HEAD');
  });

  it('refuses an explicit range whose base does not resolve', () => {
    const result = run(taskBranch(), ['deadbeef..HEAD']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not resolve');
  });

  it('refuses an explicit range whose tip does not resolve', () => {
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
