/* eslint-disable node/no-process-env */
// tools/lint-md.sh end-to-end: git-based selection, existence filter, and
// fail-loud behavior, exercised in scratch git repos with the real linters
// (markdownlint-cli2 + tsx from this repo's node_modules/.bin on PATH).
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const lintMdScript = path.join(repoRoot, 'tools/lint-md.sh');
const checkerScript = path.join(repoRoot, 'tools/check-doc-links.ts');
const binDir = path.join(repoRoot, 'node_modules/.bin');

const tempDirs: string[] = [];

function makeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-md-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function makeGitRepo(files: Record<string, string>): string {
  const dir = makeDir();
  for (const [file, content] of Object.entries(files)) {
    const absolute = path.join(dir, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  for (const command of [['init', '--quiet'], ['add', '--all']]) {
    const git = spawnSync('git', command, { cwd: dir, encoding: 'utf8' });
    expect(git.status).toBe(0);
  }
  return dir;
}

function runLintMd(cwd: string): SpawnSyncReturns<string> {
  return spawnSync('sh', [lintMdScript], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
  });
}

describe('tools/lint-md.sh', () => {
  it('passes on a repo whose Markdown is clean', () => {
    const dir = makeGitRepo({ 'a.md': '# Title\n\nSome text.\n' });
    const result = runLintMd(dir);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('doc links ok');
  });

  it('fails on a broken anchor', () => {
    const dir = makeGitRepo({ 'a.md': '# Title\n\nSee [bad](#nope).\n' });
    expect(runLintMd(dir).status).not.toBe(0);
  });

  it('stays green when a tracked file is deleted but the deletion is unstaged', () => {
    const dir = makeGitRepo({
      'a.md': '# Title\n\nSome text.\n',
      'b.md': '# Gone\n',
    });
    fs.rmSync(path.join(dir, 'b.md'));
    const result = runLintMd(dir);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('fails loud when the selection is empty', () => {
    const dir = makeGitRepo({ 'not-markdown.txt': 'x\n' });
    const result = runLintMd(dir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('no Markdown files selected');
  });

  it('fails loud when git fails (not a git repo)', () => {
    expect(runLintMd(makeDir()).status).not.toBe(0);
  });
});

describe('tools/check-doc-links.ts main()', () => {
  it('exits non-zero and reports the issue when a passed file has a broken anchor', () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, 'a.md'), '# Title\n\n[bad](#nope)\n');
    const result = spawnSync(path.join(binDir, 'tsx'), [checkerScript, './a.md'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('a.md:3 broken anchor: #nope');
  });
});
