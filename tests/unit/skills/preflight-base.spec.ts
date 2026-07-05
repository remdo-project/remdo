// tools/skills/preflight-base.sh: classify even/ahead/behind/diverged vs
// origin/main, FF a behind branch, refuse the states a run must stop on.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  advanceOrigin,
  cleanupTempDirs,
  commitAll,
  makeBareMain,
  makeScratchWithOrigin,
  runScript,
  writeFile,
} from './_support/git-scratch';

const run = (cwd: string) => runScript('preflight-base.sh', cwd);

afterEach(cleanupTempDirs);

describe('tools/skills/preflight-base.sh', () => {
  it('reports even on a fresh clone at origin/main', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const result = run(work);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=even');
    expect(result.stdout).toMatch(/BASE=[0-9a-f]{40}/);
    expect(result.stdout).not.toContain('FF=performed');
  });

  it('fast-forwards a merely-behind branch', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    advanceOrigin(origin);
    const result = run(work);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=behind');
    expect(result.stdout).toContain('FF=performed');
    // The FF actually landed the upstream file.
    expect(fs.existsSync(path.join(work, 'upstream.md'))).toBe(true);
  });

  it('refuses an ahead branch', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local ahead commit');
    const result = run(work);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ahead');
  });

  it('refuses a diverged branch', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    advanceOrigin(origin); // origin gains a commit
    writeFile(work, 'local.md', '# local\n');
    commitAll(work, 'local commit'); // work gains a different commit
    const result = run(work);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('diverged');
  });

  it('refuses a dirty tree before fast-forwarding', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    advanceOrigin(origin); // would be a valid FF if the tree were clean
    writeFile(work, 'a.md', '# A dirty\n');
    const result = run(work);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('dirty');
    // The FF must not have run — upstream file absent, local edit intact.
    expect(fs.existsSync(path.join(work, 'upstream.md'))).toBe(false);
  });

  it('refuses when there is no origin remote to fetch/classify against', () => {
    // No `origin` remote: `git fetch` fails loud (set -e), never silently
    // proceeding without a base to classify against.
    const result = run(makeBareMain({ 'a.md': '# A\n' }));
    expect(result.status).not.toBe(0);
  });

  it('fails loud outside a git repository', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-nogit-'));
    try {
      const result = run(dir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('not a git repository');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
