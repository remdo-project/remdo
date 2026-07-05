// tools/skills/create-task-branch.sh: create the branch from a pinned base
// carrying uncommitted spec edits, and refuse the unsafe states.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTempDirs,
  git,
  makeScratchWithOrigin,
  runScript,
  writeFile,
} from './_support/git-scratch';

const run = (cwd: string, args: string[]) => runScript('create-task-branch.sh', cwd, args);

const pinnedHead = (cwd: string) => git(cwd, 'rev-parse', 'HEAD').stdout.trim();

afterEach(cleanupTempDirs);

describe('tools/skills/create-task-branch.sh', () => {
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

  it('fails loud outside a git repository', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-branch-nogit-'));
    try {
      const result = run(dir, ['feat/x', 'HEAD']);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('not a git repository');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
