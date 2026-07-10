// Shared branch primitive: create an untracked topic branch from a pinned base,
// carry safe edits, and refuse states that could strand a conflicted checkout.
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
} from '../test-support/git-scratch';

const run = (cwd: string, args: string[]) => runScript(path.join(__dirname, '../tools/create-branch-from-base.sh'), cwd, args);
const pinnedHead = (cwd: string) => git(cwd, 'rev-parse', 'HEAD').stdout.trim();

afterEach(cleanupTempDirs);

describe('create-branch-from-base.sh', () => {
  it('creates the branch from the pinned base carrying an uncommitted edit', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'spec.md', '# spec\n');
    const base = pinnedHead(work);
    const result = run(work, ['feat/x', base]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('BRANCH=feat/x');
    expect(git(work, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()).toBe('feat/x');
    expect(git(work, 'status', '--porcelain').stdout).toContain('spec.md');
  });

  it('sets no upstream tracking', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    run(work, ['feat/x', pinnedHead(work)]);

    expect(git(work, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}').status).not.toBe(0);
  });

  it('refuses missing or invalid inputs', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });

    expect(run(work, []).stderr).toContain('missing branch name');
    expect(run(work, ['feat/x']).stderr).toContain('missing pinned base');
    expect(run(work, ['feat/x', 'deadbeef']).stderr).toContain('does not resolve');
  });

  it('refuses a name that already exists', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    git(work, 'branch', 'feat/x');
    const result = run(work, ['feat/x', pinnedHead(work)]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already exists');
  });

  it('carries staged edits at an unchanged base', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'spec.md', '# spec\n');
    git(work, 'add', 'spec.md');
    const result = run(work, ['feat/x', pinnedHead(work)]);

    expect(result.status).toBe(0);
    expect(git(work, 'status', '--porcelain').stdout).toContain('spec.md');
  });

  it('creates a clean branch at a moved base', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const base = pinnedHead(work);
    writeFile(work, 'advance.md', '# advance\n');
    commitAll(work, 'advance branch');

    const result = run(work, ['feat/x', base]);

    expect(result.status).toBe(0);
    expect(git(work, 'rev-parse', 'HEAD').stdout.trim()).toBe(base);
    expect(result.stdout).toContain(`BASE=${base}`);
  });

  it('refuses to carry edits across a moved base', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': 'line1\nline2\nline3\n' });
    const base = pinnedHead(work);
    writeFile(work, 'a.md', 'line1\nCHANGED-BY-HEAD\nline3\n');
    commitAll(work, 'advance a.md');
    writeFile(work, 'a.md', 'line1\nUNCOMMITTED-EDIT\nline3\n');
    const result = run(work, ['feat/x', base]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('carrying them across a moved base');
  });

  it('refuses to carry untracked files across a moved base', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const base = pinnedHead(work);
    writeFile(work, 'advance.md', '# advance\n');
    commitAll(work, 'advance branch');
    writeFile(work, 'spec.md', '# spec\n');

    const result = run(work, ['feat/x', base]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('carrying them across a moved base');
  });

  it('fails loud outside a git repository', () => {
    const result = run(makeNonRepoDir(), ['feat/x', 'HEAD']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not a git repository');
  });
});
