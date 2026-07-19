import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTempDirs, makeDir, runScript, writeFile } from '../../_shared/test-support/git-scratch';

const script = path.join(__dirname, '../tools/run-claude-review.sh');

function claudeStub(body: string): string {
  const dir = makeDir('verify-claude-stub-');
  writeFile(dir, 'claude', `#!/usr/bin/env sh\n${body}\n`);
  fs.chmodSync(path.join(dir, 'claude'), 0o755);
  return dir;
}

function shellJson(data: unknown): string {
  return `printf '%s' '${JSON.stringify(data).replace(/'/g, `'\\''`)}'`;
}

function jsonResult(result: string): string {
  const data = { type: 'result', subtype: 'success', is_error: false, result };
  return shellJson(data);
}

function completedResult(report: string): string {
  const structuredOutput = { review_complete: true, report };
  const data = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify(structuredOutput),
    structured_output: structuredOutput,
  };
  return shellJson(data);
}

afterEach(cleanupTempDirs);

describe('run-claude-review.sh', () => {
  it('returns only the final report for a clean working-tree review', () => {
    const stub = claudeStub(`
printf '%s\n' "$@" > "$(dirname "$0")/args"
${completedResult('## Code review — 0 findings\n\nNo issues found.')}
`);
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      stub,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('## Code review — 0 findings\n\nNo issues found.\n');
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8');
    expect(args).toContain('--json-schema\n');
    expect(args).not.toContain('REMDO_CODE_REVIEW_COMPLETE');
    expect(args).toContain('structured report field must contain the complete final review report');
    expect(args).toContain('Bash,Read,Grep,Glob,Skill,Agent');
  });

  it('passes the resolved range to committed-range review', () => {
    const stub = claudeStub(`
printf '%s\n' "$@" > "$(dirname "$0")/args"
${completedResult('## Code review — 0 findings')}
`);

    const result = runScript(script, makeDir('verify-claude-work-'), ['committed-range', 'base123', 'head456'], stub);

    expect(result.status).toBe(0);
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8');
    expect(args).toContain('/code-review base123..head456');
    expect(args).toContain('{"disableAllHooks":true}');
  });

  it('treats an unrecognized /code-review command as unavailable', () => {
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      claudeStub(jsonResult('Unknown command: /code-review')),
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('unavailable');
  });

  it('keeps a review report that mentions the unknown-command diagnostic', () => {
    const report = '## Code review — 1 finding\n\nDo not match `Unknown command: /code-review` inside findings.';
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      claudeStub(completedResult(report)),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${report}\n`);
  });

  it('returns the structured final report instead of prose result text', () => {
    const report = '## Code review — 1 finding\n\nFinding with a location.';
    const structuredOutput = { review_complete: true, report };
    const data = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'I verified the candidate first.',
      structured_output: structuredOutput,
      terminal_reason: 'completed',
    };
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      claudeStub(shellJson(data)),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${report}\n`);
  });

  it('keeps successful stderr diagnostics out of the JSON report', () => {
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      claudeStub(`
printf 'benign startup warning\n' >&2
${completedResult('## Code review — 0 findings')}
`),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('## Code review — 0 findings\n');
    expect(result.stderr).toBe('');
  });

  it('reports process failure without treating diagnostic output as findings', () => {
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      claudeStub(`
printf 'diagnostic transcript\n'
exit 7
`),
    );

    expect(result.status).toBe(7);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('claude failed with status 7');
    expect(result.stderr).toContain('diagnostic transcript');
  });

  it('treats an error result as a failed review even when the process exits 0', () => {
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      claudeStub(`printf '%s' '${JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, terminal_reason: 'error' }).replace(/'/g, `'\\''`)}'`),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('did not complete cleanly');
  });

  it('treats a result containing only the Local skills footer as a failed review', () => {
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      claudeStub(jsonResult('Local skills: none')),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('did not provide explicit completion evidence');
  });

  it('rejects a successful Claude response when native review did not complete', () => {
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      claudeStub(
        jsonResult(
          'Plan mode is currently active, so I cannot run the finder and verifier agents required by /code-review.',
        ),
      ),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('did not provide explicit completion evidence');
    expect(result.stderr).toContain('Plan mode is currently active');
  });

  it('rejects structured output that omits review completion evidence', () => {
    const structuredOutput = { report: 'No completion field.' };
    const data = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: JSON.stringify(structuredOutput),
      structured_output: structuredOutput,
      terminal_reason: 'completed',
    };
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      claudeStub(shellJson(data)),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('did not provide explicit completion evidence');
  });

  it('reports a schema-compliant explicit review decline as diagnostics', () => {
    const structuredOutput = { review_complete: false, report: 'Scope inspection failed.' };
    const data = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: JSON.stringify(structuredOutput),
      structured_output: structuredOutput,
    };
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      claudeStub(shellJson(data)),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('did not provide explicit completion evidence');
    expect(result.stderr).toContain('Scope inspection failed.');
  });

  it('fails cleanly when Claude returns a non-string result', () => {
    const data = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: { unexpected: true },
    };
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      claudeStub(shellJson(data)),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('did not provide explicit completion evidence');
    expect(result.stderr).not.toContain('Traceback');
  });

  it('fails cleanly when Claude returns non-object JSON', () => {
    const result = runScript(
      script,
      makeDir('verify-claude-work-'),
      ['working-tree'],
      claudeStub("printf '%s' 'null'"),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('claude output was not a JSON object');
    expect(result.stderr).not.toContain('Traceback');
  });
});
