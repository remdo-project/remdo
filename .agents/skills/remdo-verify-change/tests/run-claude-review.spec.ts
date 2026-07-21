import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTempDirs,
  commitAll,
  git,
  makeBareMain,
  makeDir,
  makeExternalBareMain,
  makeScratchWithOrigin,
  runScript,
  waitForPath,
  writeFile,
} from '../../_shared/test-support/git-scratch';

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

function structuredResult(
  structuredOutput: unknown,
  overrides: { result?: unknown; terminal_reason?: string } = {},
): string {
  const data = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify(structuredOutput),
    structured_output: structuredOutput,
    ...overrides,
  };
  return shellJson(data);
}

function completedResult(report: string): string {
  return structuredResult({ review_complete: true, report });
}

function workingTree(): string {
  const work = makeBareMain({ 'candidate.md': 'base\n' });
  writeFile(work, 'candidate.md', 'changed\n');
  return work;
}

function trackedWorkingTree(): string {
  const { work } = makeScratchWithOrigin({ 'candidate.md': 'base\n' });
  git(work, 'switch', '--quiet', '--create', 'feature', '--track', 'origin/main');
  writeFile(work, 'ahead.md', 'committed ahead of upstream\n');
  commitAll(work, 'ahead');
  writeFile(work, 'candidate.md', 'changed\n');
  return work;
}

function runWorkingTreeReview(body: string) {
  return runScript(script, workingTree(), ['working-tree'], claudeStub(body));
}

afterEach(cleanupTempDirs);

describe('run-claude-review.sh', () => {
  it('loads its runtime outside the project tree', () => {
    const result = runScript(
      script,
      makeExternalBareMain({ 'tracked.md': 'tracked\n' }),
      ['working-tree'],
      claudeStub(completedResult('External repo clean.')),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('External repo clean.\n');
  });

  it('translates process termination into provider cancellation', async () => {
    const ready = path.join(makeDir('verify-claude-ready-'), 'ready');
    const stub = claudeStub(`
printf ready > "$RUNNER_STUB_READY"
while :; do sleep 1; done
`);
    const child = spawn(script, ['working-tree'], {
      cwd: workingTree(),
      env: {
        ...process.env,
        CODEX_ACCESS_TOKEN: 'unit-test-token',
        PATH: `${stub}:${process.env.PATH}`,
        RUNNER_STUB_READY: ready,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    const closePromise = new Promise<number | null>(resolve => {
      child.once('close', resolve);
    });
    try {
      await waitForPath(ready);
      child.kill('SIGTERM');
      const status = await closePromise;

      expect(status).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toContain('run-claude-review: Claude was cancelled');
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });

  it('reports an unavailable Git executable without a raw exception', () => {
    const emptyPath = makeDir('verify-claude-empty-path-');
    const tool = path.join(__dirname, '../tools/run-claude-review.ts');

    const result = spawnSync(
      process.execPath,
      [tool, 'working-tree'],
      {
        cwd: makeDir('verify-claude-work-'),
        encoding: 'utf8',
        env: { ...process.env, PATH: emptyPath },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('run-claude-review: spawnSync git ENOENT');
    expect(result.stderr).not.toContain('TypeError');
    expect(result.stderr).not.toContain('at gitConfigValues');
  });

  it('returns only the final report for a clean working-tree review', () => {
    const stub = claudeStub(`
[ -z "\${GIT_DIR+x}" ] || exit 91
[ -z "\${GIT_WORK_TREE+x}" ] || exit 92
printf '%s\n' "$@" > "$(dirname "$0")/args"
printf '%s\n' "$GIT_CONFIG_COUNT" "$GIT_CONFIG_KEY_0" "$GIT_CONFIG_VALUE_0" "$GIT_CONFIG_KEY_1" "$GIT_CONFIG_VALUE_1" "$GIT_CONFIG_KEY_2" "$GIT_CONFIG_VALUE_2" > "$(dirname "$0")/git-env"
git rev-list --count '@{u}..HEAD' > "$(dirname "$0")/ahead-count"
git status --short --untracked-files=all > "$(dirname "$0")/status"
${completedResult('## Code review — 0 findings\n\nNo issues found.')}
`);
    const work = trackedWorkingTree();
    const result = runScript(
      script,
      work,
      ['working-tree'],
      stub,
      {
        GIT_CONFIG_COUNT: '001',
        GIT_CONFIG_KEY_0: 'safe.directory',
        GIT_CONFIG_VALUE_0: '*',
        GIT_DIR: '/path/that/must/not/be-used',
        GIT_WORK_TREE: '/another/path/that/must/not/be-used',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('## Code review — 0 findings\n\nNo issues found.\n');
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8');
    expect(args).toContain('--effort\nmedium\n');
    expect(args).toContain('--json-schema\n');
    const argv = args.trimEnd().split('\n');
    const jsonSchema = JSON.parse(argv[argv.indexOf('--json-schema') + 1]!);
    expect(jsonSchema).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
      additionalProperties: false,
      properties: {
        review_complete: {
          description: 'True only after native review inspected the full requested scope and completed; false when review could not complete.',
          type: 'boolean',
        },
        report: {
          description: 'The complete final review report, including every finding and its location rather than only counts or a summary, when review_complete is true; otherwise an explanation of why review could not complete.',
          type: 'string',
        },
      },
      required: ['review_complete', 'report'],
      type: 'object',
    });
    expect(args).not.toContain('REMDO_CODE_REVIEW_COMPLETE');
    expect(args).toContain('structured report field must contain the complete final review report');
    expect(args).toContain('Bash,Read,Grep,Glob,Skill,Agent');
    const gitEnv = fs.readFileSync(path.join(stub, 'git-env'), 'utf8').trimEnd().split('\n');
    expect(gitEnv.slice(0, 4)).toEqual(['3', 'safe.directory', '*', 'branch.feature.remote']);
    expect(gitEnv[4]).toMatch(/^remdo-verify-\d+$/);
    expect(gitEnv[5]).toBe(`remote.${gitEnv[4]}.fetch`);
    expect(gitEnv[6]).toBe('+refs/heads/main:refs/heads/feature');
    expect(fs.readFileSync(path.join(stub, 'ahead-count'), 'utf8')).toBe('0\n');
    expect(fs.readFileSync(path.join(stub, 'status'), 'utf8')).toBe(' M candidate.md\n');
    expect(git(work, 'config', '--get', 'branch.feature.remote').stdout.trim()).toBe('origin');
    expect(git(work, 'rev-list', '--count', '@{u}..HEAD').stdout).toBe('1\n');
  });

  it('rejects detached working-tree scope', () => {
    const work = workingTree();
    git(work, 'checkout', '--quiet', '--detach');
    const stub = claudeStub(completedResult('not reached'));

    const result = runScript(script, work, ['working-tree'], stub);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('working-tree review requires an attached branch');
  });

  it('synthesizes a merge ref for an attached branch without upstream config', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    git(work, 'switch', '--quiet', '--create', 'feature');
    writeFile(work, 'tracked.md', 'changed\n');
    const stub = claudeStub(`
printf '%s\n' "$GIT_CONFIG_COUNT" "$GIT_CONFIG_KEY_0" "$GIT_CONFIG_VALUE_0" "$GIT_CONFIG_KEY_1" "$GIT_CONFIG_VALUE_1" "$GIT_CONFIG_KEY_2" "$GIT_CONFIG_VALUE_2" > "$(dirname "$0")/git-env"
${completedResult('## Code review — 0 findings')}
`);

    const result = runScript(script, work, ['working-tree'], stub);

    expect(result.status).toBe(0);
    const gitEnv = fs.readFileSync(path.join(stub, 'git-env'), 'utf8').trimEnd().split('\n');
    expect(gitEnv[0]).toBe('3');
    expect(gitEnv[1]).toBe('branch.feature.remote');
    expect(gitEnv[3]).toBe('branch.feature.merge');
    expect(gitEnv[4]).toBe('refs/heads/feature');
    expect(gitEnv[5]).toMatch(/^remote\.remdo-verify-\d+\.fetch$/);
    expect(gitEnv[6]).toBe('+refs/heads/feature:refs/heads/feature');
  });

  it('passes the resolved range to committed-range review', () => {
    const stub = claudeStub(`
printf '%s\n' "$@" > "$(dirname "$0")/args"
${completedResult('## Code review — 0 findings')}
`);

    const result = runScript(
      script,
      makeBareMain({ 'tracked.md': 'tracked\n' }),
      ['committed-range', 'base123', 'head456'],
      stub,
    );

    expect(result.status).toBe(0);
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8');
    expect(args).toContain('/code-review base123..head456');
    expect(args).toContain('{"disableAllHooks":true}');
  });

  it('treats an unrecognized /code-review command as unavailable', () => {
    const result = runWorkingTreeReview(jsonResult('Unknown command: /code-review'));

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('unavailable');
  });

  it('keeps a review report that mentions the unknown-command diagnostic', () => {
    const report = '## Code review — 1 finding\n\nDo not match `Unknown command: /code-review` inside findings.';
    const result = runWorkingTreeReview(completedResult(report));

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${report}\n`);
  });

  it('returns the structured final report instead of prose result text', () => {
    const report = '## Code review — 1 finding\n\nFinding with a location.';
    const structuredOutput = { review_complete: true, report };
    const result = runWorkingTreeReview(
      structuredResult(structuredOutput, {
        result: 'I verified the candidate first.',
        terminal_reason: 'completed',
      }),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${report}\n`);
  });

  it('keeps successful stderr diagnostics out of the JSON report', () => {
    const result = runWorkingTreeReview(`
printf 'benign startup warning\n' >&2
${completedResult('## Code review — 0 findings')}
`);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('## Code review — 0 findings\n');
    expect(result.stderr).toBe('');
  });

  it('reports process failure without exposing provider output', () => {
    const result = runWorkingTreeReview(`
printf 'diagnostic transcript\n'
exit 7
`);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Claude failed with status 7');
    expect(result.stderr).not.toContain('diagnostic transcript');
  });

  it('treats an error result as a failed review even when the process exits 0', () => {
    const result = runWorkingTreeReview(
      `printf '%s' '${JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, terminal_reason: 'error' }).replace(/'/g, `'\\''`)}'`,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('did not return a successful result envelope');
  });

  it('treats a result containing only the Local skills footer as a failed review', () => {
    const result = runWorkingTreeReview(jsonResult('Local skills: none'));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('completed without structured output');
  });

  it('rejects a successful Claude response when native review did not complete', () => {
    const result = runWorkingTreeReview(
      jsonResult(
        'Plan mode is currently active, so I cannot run the finder and verifier agents required by /code-review.',
      ),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('completed without structured output');
    expect(result.stderr).not.toContain('Plan mode is currently active');
  });

  it('rejects structured output that omits review completion evidence', () => {
    const structuredOutput = { report: 'No completion field.' };
    const result = runWorkingTreeReview(
      structuredResult(structuredOutput, { terminal_reason: 'completed' }),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('shared runner returned an invalid review response');
  });

  it('rejects structured output with fields outside the review contract', () => {
    const structuredOutput = {
      review_complete: true,
      report: 'No issues found.',
      extra: 'not part of the contract',
    };
    const result = runWorkingTreeReview(structuredResult(structuredOutput));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('shared runner returned an invalid review response');
  });

  it.each([
    { report: 'Complete.', review_complete: 'true' },
    { report: 1, review_complete: true },
  ])('rejects structured output with invalid field types', (structuredOutput) => {
    const result = runWorkingTreeReview(structuredResult(structuredOutput));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('shared runner returned an invalid review response');
  });

  it('reports a schema-compliant explicit review decline as diagnostics', () => {
    const structuredOutput = { review_complete: false, report: 'Scope inspection failed.' };
    const result = runWorkingTreeReview(structuredResult(structuredOutput));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('review did not complete');
    expect(result.stderr).toContain('Scope inspection failed.');
  });

  it('rejects a completed review without a non-empty report', () => {
    const structuredOutput = { review_complete: true, report: '  \n' };
    const result = runWorkingTreeReview(structuredResult(structuredOutput));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('review did not provide a non-empty report');
  });

  it('fails cleanly when Claude returns a non-string result', () => {
    const data = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: { unexpected: true },
    };
    const result = runWorkingTreeReview(shellJson(data));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('completed without structured output');
    expect(result.stderr).not.toContain('Traceback');
  });

  it('fails cleanly when Claude returns non-object JSON', () => {
    const result = runWorkingTreeReview("printf '%s' 'null'");

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Claude output was not a JSON object');
    expect(result.stderr).not.toContain('Traceback');
  });
});
