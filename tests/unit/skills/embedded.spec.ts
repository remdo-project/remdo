// Bridge for skill-local specs: vitest's file crawler does not descend into
// hidden skill roots, so specs colocated with their skill's tools are
// registered here by import. The guard below fails when a skill spec exists
// on disk but is missing from the import list — add the import, keep the
// guard honest.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import '../../../.agents/skills/remdo-docs-align/tests/advocate-run.spec';
import '../../../.agents/skills/remdo-docs-align/tests/lint-rules.spec';
import '../../../.agents/skills/remdo-refine/tests/resolve-scope.spec';
import '../../../.agents/skills/remdo-sync/tests/sync-probe.spec';
import '../../../.claude/skills/remdo-feature-flow/tests/preflight-base.spec';
import '../../../.claude/skills/remdo-feature-flow/tests/create-task-branch.spec';

describe('skill-local spec bridge', () => {
  it('imports every spec under canonical hidden skill roots', () => {
    const roots = ['.agents/skills', '.claude/skills'];
    const found = roots.flatMap(root => fs
      .globSync(`${root}/*/tests/*.spec.ts`, { cwd: process.cwd() })
      .filter(p => {
        const skillDir = p.split(path.sep).slice(0, 3).join(path.sep);
        return !fs.lstatSync(path.join(process.cwd(), skillDir)).isSymbolicLink();
      })
      .map(p => p.split(path.sep).join('/')));
    const self = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
    const missing = found.filter(p => !self.includes(`../../../${p.replace(/\.ts$/, '')}`));
    expect(missing).toEqual([]);
  });

  it('keeps markdownlint from following skill mirror symlinks', () => {
    const roots = ['.claude/skills', '.codex/skills'];
    const mirrorDirs = roots.flatMap(root => fs
      .globSync(`${root}/*`, { cwd: process.cwd() })
      .filter(p => fs.lstatSync(path.join(process.cwd(), p)).isSymbolicLink())
      .map(p => p.split(path.sep).join('/')));
    const config = fs.readFileSync('.markdownlint-cli2.jsonc', 'utf8');

    const missing = mirrorDirs.filter(p => !config.includes(`"${p}"`));
    expect(missing).toEqual([]);
  });
});
