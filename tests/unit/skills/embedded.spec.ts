// Bridge for skill-local specs: vitest's file crawler does not descend into
// the hidden `.claude/` tree, so specs colocated with their skill's tools are
// registered here by import. The guard below fails when a skill spec exists
// on disk but is missing from the import list — add the import, keep the
// guard honest.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import '../../../.claude/skills/remdo-docs-align/tests/advocate-run.spec';
import '../../../.claude/skills/remdo-docs-align/tests/lint-rules.spec';
import '../../../.claude/skills/remdo-feature-flow/tests/preflight-base.spec';
import '../../../.claude/skills/remdo-feature-flow/tests/create-task-branch.spec';
import '../../../.claude/skills/remdo-refine/tests/resolve-scope.spec';
import '../../../.claude/skills/remdo-sync/tests/sync-probe.spec';

describe('skill-local spec bridge', () => {
  it('imports every spec under .claude/skills/*/tests/', () => {
    const found = fs
      .globSync('.claude/skills/*/tests/*.spec.ts', { cwd: process.cwd() })
      .map(p => p.split(path.sep).join('/'));
    const self = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
    const missing = found.filter(p => !self.includes(`../../../${p.replace(/\.ts$/, '')}`));
    expect(missing).toEqual([]);
  });
});
