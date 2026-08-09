import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  cleanupTempDirs,
  makeDir,
  runScript,
  writeFile,
} from '../../_shared/test-support/git-scratch';

const sourceScript = path.join(__dirname, '../next-update.sh');

function makeFixture(): { root: string; script: string } {
  const root = makeDir('next-update-');
  const skillDir = '.agents/skills/remdo-deps-refresh';
  const script = `${skillDir}/next-update.sh`;

  writeFile(root, script, fs.readFileSync(sourceScript, 'utf8'));
  writeFile(root, 'package.json', '{}\n');
  writeFile(
    root,
    `${skillDir}/bump-pnpm-pin.sh`,
    `printf '%s\\n' '{ "pin": true }' > package.json
`,
  );
  writeFile(root, `${skillDir}/bump-node-pins.sh`, ':\n');
  writeFile(root, `${skillDir}/bump-action-majors.sh`, ':\n');
  writeFile(root, 'bin/pnpm', '#!/usr/bin/env sh\nexit 0\n');
  fs.chmodSync(path.join(root, 'bin/pnpm'), 0o755);

  return { root, script: path.join(root, script) };
}

afterEach(cleanupTempDirs);

describe('next-update.sh', () => {
  it('skips a recorded update category for only the current run', () => {
    const fixture = makeFixture();
    writeFile(fixture.root, '.agent/remdo-deps-refresh/skipped', 'pnpm pin\n');

    const result = runScript(
      fixture.script,
      fixture.root,
      [],
      path.join(fixture.root, 'bin'),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("'pnpm pin' skipped for this run");
    expect(fs.readFileSync(path.join(fixture.root, 'package.json'), 'utf8')).toBe('{}\n');
  });

  it('selects the category again when no run-local skip is recorded', () => {
    const fixture = makeFixture();

    const result = runScript(
      fixture.script,
      fixture.root,
      [],
      path.join(fixture.root, 'bin'),
    );

    expect(result.status).toBe(3);
    expect(result.stdout).toContain("'pnpm pin' changed the repo");
  });
});
