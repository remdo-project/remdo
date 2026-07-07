// create-task-branch.sh (skill-local tools/): create the branch from a pinned base
// carrying uncommitted spec edits, and refuse the unsafe states.
import fs from 'node:fs';
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

const run = (cwd: string, args: string[]) => runScript(path.join(__dirname, '../tools/create-task-branch.sh'), cwd, args);

const pinnedHead = (cwd: string) => git(cwd, 'rev-parse', 'HEAD').stdout.trim();

afterEach(cleanupTempDirs);

describe('create-task-branch.sh (skill-local tools/)', () => {
  it('creates the branch from the pinned base carrying an uncommitted spec edit', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'spec.md', '# spec\n'); // uncommitted spec edit
    const base = pinnedHead(work);
    const result = run(work, ['feat/x', base]);
    expect(result.stderr).not.toContain('create-task-branch:');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('BRANCH=feat/x');
    expect(git(work, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()).toBe('feat/x');
    // The uncommitted spec edit carried across onto the new branch.
    expect(fs.existsSync(path.join(work, 'spec.md'))).toBe(true);
    expect(git(work, 'status', '--porcelain').stdout).toContain('spec.md');
  });

  it('sets no upstream tracking (--no-track)', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    run(work, ['feat/x', pinnedHead(work)]);
    const upstream = git(work, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
    expect(upstream.status).not.toBe(0); // no upstream configured
  });

  it('refuses a missing branch name', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const result = run(work, []);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('missing branch name');
  });

  it('refuses a missing base SHA', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const result = run(work, ['feat/x']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('missing pinned base');
  });

  it('refuses an unresolvable base', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const result = run(work, ['feat/x', 'deadbeef']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not resolve');
  });

  it('refuses a name that already exists', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    git(work, 'branch', 'feat/x');
    const result = run(work, ['feat/x', pinnedHead(work)]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already exists');
  });

  it('refuses staged edits that --merge cannot carry', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'spec.md', '# spec\n');
    git(work, 'add', 'spec.md'); // staged drift
    const result = run(work, ['feat/x', pinnedHead(work)]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('staged edits');
    // Refused before switching — still on main.
    expect(git(work, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()).toBe('main');
  });

  it('refuses upfront to carry edits across a moved base (the conflict-producing state)', () => {
    // `git switch --merge` exits 0 even when the three-way merge of the
    // uncommitted edit onto the new base conflicts; the post-switch unmerged
    // check must catch it. Build a base where a.md differs from HEAD, then an
    // uncommitted edit to the same line so the fold conflicts.
    const { work } = makeScratchWithOrigin({ 'a.md': 'line1\nline2\nline3\n' });
    const base = pinnedHead(work);
    writeFile(work, 'a.md', 'line1\nCHANGED-BY-HEAD\nline3\n');
    commitAll(work, 'advance a.md');
    writeFile(work, 'a.md', 'line1\nUNCOMMITTED-EDIT\nline3\n'); // conflicts on fold
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
