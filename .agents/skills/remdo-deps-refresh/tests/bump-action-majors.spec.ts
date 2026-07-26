import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  cleanupTempDirs,
  makeDir,
  runScript,
  writeFile,
} from '../../_shared/test-support/git-scratch';

const sourceScript = path.join(__dirname, '../bump-action-majors.sh');

function makeFixture(
  scenario: 'success' | 'missing' | 'missingWithoutReason' | 'failure',
): {
  root: string;
  script: string;
  workflow: string;
} {
  const root = makeDir('bump-action-majors-');
  const script = '.agents/skills/remdo-deps-refresh/bump-action-majors.sh';
  const workflow = '.github/workflows/check.yml';
  const gh = 'bin/gh';

  writeFile(root, script, fs.readFileSync(sourceScript, 'utf8'));
  writeFile(root, workflow, 'steps:\n  - uses: actions/checkout@v4\n');
  writeFile(root, gh, `#!/usr/bin/env sh
set -eu

case " $* " in
  *" --include "*) ;;
  *) echo "missing --include" >&2; exit 64 ;;
esac

case "${scenario}" in
  success)
    printf 'HTTP/2.0 200 OK\\r\\nContent-Type: application/json\\r\\n\\r\\nv5.0.0\\n'
    ;;
  missing)
    printf 'HTTP/2.0 404 Not Found\\r\\nContent-Type: application/json\\r\\n\\r\\n{"status":"404"}\\n'
    echo "opaque gh diagnostic" >&2
    exit 1
    ;;
  missingWithoutReason)
    printf 'HTTP/2.0 404\\r\\nContent-Type: application/json\\r\\n\\r\\n{"status":"404"}\\n'
    echo "opaque gh diagnostic" >&2
    exit 1
    ;;
  failure)
    printf 'HTTP/2.0 500 Internal Server Error\\r\\nContent-Type: application/json\\r\\n\\r\\n{"status":"500"}\\n'
    echo "opaque gh diagnostic" >&2
    exit 1
    ;;
esac
`);
  fs.chmodSync(path.join(root, gh), 0o755);

  return {
    root,
    script: path.join(root, script),
    workflow: path.join(root, workflow),
  };
}

afterEach(cleanupTempDirs);

describe('bump-action-majors.sh', () => {
  it('uses the included HTTP response and updates a bare major pin', () => {
    const fixture = makeFixture('success');

    const result = runScript(fixture.script, fixture.root, [], path.join(fixture.root, 'bin'));

    expect(result.status).toBe(0);
    expect(fs.readFileSync(fixture.workflow, 'utf8')).toContain('actions/checkout@v5');
  });

  it.each(['missing', 'missingWithoutReason'] as const)(
    'treats an included 404 status as a missing release: %s',
    (scenario) => {
      const fixture = makeFixture(scenario);

      const result = runScript(
        fixture.script,
        fixture.root,
        [],
        path.join(fixture.root, 'bin'),
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toContain('no latest release for actions/checkout');
      expect(fs.readFileSync(fixture.workflow, 'utf8')).toContain(
        'actions/checkout@v4',
      );
    },
  );

  it('surfaces a non-404 API failure', () => {
    const fixture = makeFixture('failure');

    const result = runScript(fixture.script, fixture.root, [], path.join(fixture.root, 'bin'));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('gh api failed for actions/checkout');
    expect(result.stderr).toContain('opaque gh diagnostic');
    expect(fs.readFileSync(fixture.workflow, 'utf8')).toContain('actions/checkout@v4');
  });
});
