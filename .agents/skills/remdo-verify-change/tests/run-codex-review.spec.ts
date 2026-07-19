import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTempDirs, makeDir, runScript, writeFile } from '../../_shared/test-support/git-scratch';

const script = path.join(__dirname, '../tools/run-codex-review.sh');

function codexStub(body: string): string {
  const dir = makeDir('verify-codex-stub-');
  writeFile(dir, 'codex', `#!/usr/bin/env sh\n${body}\n`);
  fs.chmodSync(path.join(dir, 'codex'), 0o755);
  return dir;
}

afterEach(cleanupTempDirs);

describe('run-codex-review.sh', () => {
  it('returns only the final report for working-tree review', () => {
    const cwd = makeDir('verify-codex-work-');
    const stub = codexStub(`
printf '%s\n' "$@" > "${cwd}/args"
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output-last-message' ]; then
    shift
    printf 'No findings.\n' > "$1"
    break
  fi
  shift
done
printf '{"type":"item.completed","item":{"type":"agent_message","text":"No findings."}}\n'
printf '{"type":"turn.completed"}\n'
`);

    const result = runScript(script, cwd, ['working-tree'], stub);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('No findings.\n');
    const args = fs.readFileSync(path.join(cwd, 'args'), 'utf8');
    expect(args).toContain('--uncommitted\n');
    expect(args).toContain('--json\n');
    const argLines = args.trimEnd().split('\n');
    expect(argLines[argLines.length - 2]).toBe('--output-last-message');
  });

  it('passes the immutable base to committed-range review', () => {
    const cwd = makeDir('verify-codex-work-');
    const stub = codexStub(`
printf '%s\n' "$@" > "${cwd}/args"
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output-last-message' ]; then
    shift
    printf 'Range clean.\n' > "$1"
    break
  fi
  shift
done
printf '{"type":"item.completed","item":{"type":"agent_message","text":"Range clean."}}\n'
printf '{"type":"turn.completed"}\n'
`);

    const result = runScript(script, cwd, ['committed-range', 'base123'], stub);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('Range clean.\n');
    const args = fs.readFileSync(path.join(cwd, 'args'), 'utf8');
    expect(args).toContain('--base\nbase123\n');
    const argLines = args.trimEnd().split('\n');
    expect(argLines[argLines.length - 2]).toBe('--output-last-message');
  });

  it('reports reviewer failure without treating its output as findings', () => {
    const result = runScript(script, makeDir('verify-codex-work-'), ['working-tree'], codexStub(`
printf 'diagnostic transcript\n' >&2
exit 7
`));

    expect(result.status).toBe(7);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('codex failed with status 7');
    expect(result.stderr).toContain('diagnostic transcript');
  });

  it('preserves diagnostics when Codex omits its final report', () => {
    const result = runScript(script, makeDir('verify-codex-work-'), ['working-tree'], codexStub(`
printf 'last diagnostic before exit\n' >&2
`));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('review completed without a final report');
    expect(result.stderr).toContain('last diagnostic before exit');
  });

  it('rejects a whitespace-only final report', () => {
    const cwd = makeDir('verify-codex-work-');
    const result = runScript(script, cwd, ['working-tree'], codexStub(`
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output-last-message' ]; then
    shift
    printf ' \n\t\n' > "$1"
    break
  fi
  shift
done
printf '{"type":"turn.completed"}\n'
`));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('review completed without a final report');
  });

  it('rejects a Codex response when the protocol turn does not complete', () => {
    const cwd = makeDir('verify-codex-work-');
    const result = runScript(script, cwd, ['working-tree'], codexStub(`
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output-last-message' ]; then
    shift
    printf 'I could not inspect the requested scope.\n' > "$1"
    break
  fi
  shift
done
printf '{"type":"item.completed","item":{"type":"agent_message","text":"I could not inspect the requested scope."}}\n'
`));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('did not provide explicit completion evidence');
  });

  it('rejects a final report that does not match the completed agent message', () => {
    const cwd = makeDir('verify-codex-work-');
    const result = runScript(script, cwd, ['working-tree'], codexStub(`
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output-last-message' ]; then
    shift
    printf 'Different report.\n' > "$1"
    break
  fi
  shift
done
printf '{"type":"item.completed","item":{"type":"agent_message","text":"Completed report."}}\n'
printf '{"type":"turn.completed"}\n'
`));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('did not match the completed Codex review output');
  });
});
