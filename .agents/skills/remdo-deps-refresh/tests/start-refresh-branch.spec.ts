// start-refresh-branch.sh: start every dependency refresh from a clean,
// freshly fetched origin/main on a new untracked maintenance branch.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  advanceOrigin,
  cleanupTempDirs,
  commitAll,
  git,
  makeScratchWithOrigin,
  runScript,
  writeFile,
} from '../../_shared/test-support/git-scratch';

const run = (cwd: string) => runScript(path.join(__dirname, '../tools/start-refresh-branch.sh'), cwd);
const branchFrom = (stdout: string) => stdout.match(/^BRANCH=(.+)$/m)![1]!;
const makeRepo = () => makeScratchWithOrigin({
  '.gitignore': '/.agent/\n',
  'a.md': '# A\n',
});

afterEach(cleanupTempDirs);

describe('start-refresh-branch.sh', () => {
  it('forks from freshly fetched origin/main instead of the current branch', () => {
    const { work, origin } = makeRepo();
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local-only work');
    advanceOrigin(origin);

    const result = run(work);

    expect(result.status).toBe(0);
    expect(branchFrom(result.stdout)).toMatch(/^chore\/deps-refresh-\d{4}-\d{2}-\d{2}$/);
    expect(git(work, 'rev-parse', 'HEAD').stdout).toBe(git(origin, 'rev-parse', 'main').stdout);
    expect(git(work, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}').status).not.toBe(0);
  });

  it('chooses a fresh suffix when today\'s branch already exists', () => {
    const { work } = makeRepo();
    const first = run(work);
    writeFile(work, '.agent/remdo-deps-refresh/skipped', 'node pins\n');
    const second = run(work);

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(branchFrom(second.stdout)).toBe(`${branchFrom(first.stdout)}-2`);
    expect(
      fs.readFileSync(path.join(work, '.agent/remdo-deps-refresh/skipped'), 'utf8'),
    ).toBe('');
  });

  it('chooses a fresh suffix when today\'s branch exists only on origin', () => {
    const { work } = makeRepo();
    const first = run(work);
    const branch = branchFrom(first.stdout);
    git(work, 'push', '--quiet', 'origin', `${branch}:${branch}`);
    git(work, 'switch', '--quiet', 'main');
    git(work, 'branch', '--delete', '--force', branch);

    const second = run(work);

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(branchFrom(second.stdout)).toBe(`${branch}-2`);
  });

  it('refuses to carry a dirty tree onto the refresh branch', () => {
    const { work } = makeRepo();
    writeFile(work, 'local.md', '# local\n');

    const result = run(work);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('working tree is dirty');
    expect(git(work, 'branch', '--show-current').stdout.trim()).toBe('main');
  });

  it('does not create the branch when run-state initialization fails', () => {
    const { work } = makeRepo();
    fs.mkdirSync(path.join(work, '.agent/remdo-deps-refresh/skipped'), {
      recursive: true,
    });

    const result = run(work);

    expect(result.status).not.toBe(0);
    expect(git(work, 'branch', '--show-current').stdout.trim()).toBe('main');
  });
});
