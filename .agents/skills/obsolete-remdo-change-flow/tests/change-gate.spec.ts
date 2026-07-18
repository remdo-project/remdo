import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTempDirs,
  makeBareMain,
  writeFile,
} from '../../_shared/test-support/git-scratch';

const script = path.join(__dirname, '../tools/change-gate.ts');
const tsx = path.join(process.cwd(), 'node_modules/.bin/tsx');

const run = (cwd: string, args: string[]) => spawnSync(tsx, [script, ...args], {
  cwd,
  encoding: 'utf8',
});

function repoWithChanges(names: string[]): string {
  const repo = makeBareMain({ 'README.md': '# scratch\n' });
  const payload = JSON.stringify({ changes: names.map(name => ({ name })) });
  writeFile(repo, 'tools/changes.json', `${payload}\n`);
  writeFile(repo, 'tools/openspec', '#!/usr/bin/env sh\ncat tools/changes.json\n');
  fs.chmodSync(path.join(repo, 'tools/openspec'), 0o755);
  return repo;
}

afterEach(cleanupTempDirs);

describe('change-gate.sh', () => {
  it('allows starting when the branch has no active change', () => {
    const result = run(repoWithChanges([]), ['start']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=ready');
  });

  it('requires another branch when a change is already active', () => {
    const result = run(repoWithChanges(['existing']), ['start']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('existing');
    expect(result.stderr).toContain('different branch');
  });

  it('continues the sole requested change', () => {
    const result = run(repoWithChanges(['target']), ['continue', 'target']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=active');
    expect(result.stdout).toContain('CHANGE=target');
  });

  it('refuses a different or ambiguous active change', () => {
    const different = run(repoWithChanges(['other']), ['continue', 'target']);
    expect(different.status).not.toBe(0);
    expect(different.stderr).toContain('expected sole active change target');

    const multiple = run(repoWithChanges(['target', 'other']), ['continue', 'target']);
    expect(multiple.status).not.toBe(0);
    expect(multiple.stderr).toContain('target, other');
  });
});
