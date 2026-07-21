import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTempDirs,
  makeBareMain,
  makeDir,
  makeExternalBareMain,
  runScript,
  writeFile,
} from '../../_shared/test-support/git-scratch';

const script = path.join(__dirname, '../tools/run-codex-review.sh');

function codexStub(body: string): string {
  const dir = makeDir('verify-codex-stub-');
  writeFile(dir, 'codex', `#!/usr/bin/env sh\n${body}\n`);
  fs.chmodSync(path.join(dir, 'codex'), 0o755);
  return dir;
}

function codexWork(): string {
  return makeBareMain({ 'tracked.md': 'tracked\n' });
}

function runCodexScript(
  cwd: string,
  args: string[],
  stub: string,
): ReturnType<typeof runScript> {
  return runScript(script, cwd, args, stub, {
    CODEX_ACCESS_TOKEN: 'unit-test-token',
    CODEX_HOME: path.join(stub, 'unused-codex-home'),
  });
}

afterEach(cleanupTempDirs);

describe('run-codex-review.sh', () => {
  it('loads its runtime outside the project tree', () => {
    const result = runCodexScript(
      makeExternalBareMain({ 'tracked.md': 'tracked\n' }),
      ['working-tree'],
      codexStub(`
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output-last-message' ]; then
    shift
    printf 'External repo clean.\n' > "$1"
    break
  fi
  shift
done
`),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('External repo clean.\n');
  });

  it('returns only the final report for working-tree review', () => {
    const cwd = codexWork();
    const stub = codexStub(`
uncommitted=0
ignored_config=0
ignored_rules=0
read_only=0
never_approve=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --uncommitted) uncommitted=1 ;;
    --ignore-user-config) ignored_config=1 ;;
    --ignore-rules) ignored_rules=1 ;;
    --sandbox) shift; [ "$1" = read-only ] && read_only=1 ;;
    -c) shift; [ "$1" = 'approval_policy="never"' ] && never_approve=1 ;;
    --output-last-message) shift; report=$1 ;;
  esac
  shift
done
[ "$uncommitted$ignored_config$ignored_rules$read_only$never_approve" = 11111 ]
printf 'No findings.\n' > "$report"
`);

    const result = runCodexScript(cwd, ['working-tree'], stub);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('No findings.\n');
  });

  it('passes the immutable base to committed-range review', () => {
    const cwd = codexWork();
    const stub = codexStub(`
base=0
ephemeral=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --base) shift; [ "$1" = base123 ] && base=1 ;;
    --ephemeral) ephemeral=1 ;;
    --output-last-message) shift; report=$1 ;;
  esac
  shift
done
[ "$base$ephemeral" = 11 ]
printf 'Range clean.\n' > "$report"
`);

    const result = runCodexScript(cwd, ['committed-range', 'base123'], stub);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('Range clean.\n');
  });

  it('reports reviewer failure without exposing provider output', () => {
    const result = runCodexScript(codexWork(), ['working-tree'], codexStub(`
printf 'diagnostic transcript\n' >&2
exit 7
`));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Codex failed with status 7');
    expect(result.stderr).not.toContain('diagnostic transcript');
  });

  it('classifies a missing final report without exposing provider output', () => {
    const result = runCodexScript(codexWork(), ['working-tree'], codexStub(`
printf 'last diagnostic before exit\n' >&2
`));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('completed without a final response');
    expect(result.stderr).not.toContain('last diagnostic before exit');
  });

  it('rejects a whitespace-only final report', () => {
    const cwd = codexWork();
    const result = runCodexScript(cwd, ['working-tree'], codexStub(`
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output-last-message' ]; then
    shift
    printf ' \n\t\n' > "$1"
    break
  fi
  shift
done
`));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('completed without a final response');
  });

  it('returns a refusal for verifier-level interpretation', () => {
    const cwd = codexWork();
    const result = runCodexScript(cwd, ['working-tree'], codexStub(`
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output-last-message' ]; then
    shift
    printf 'I could not inspect the requested scope.\n' > "$1"
    break
  fi
  shift
done
`));

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('I could not inspect the requested scope.\n');
    expect(result.stderr).toBe('');
  });

});
