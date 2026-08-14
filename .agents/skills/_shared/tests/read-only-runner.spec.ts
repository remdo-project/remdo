/* eslint-disable node/no-process-env */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTempDirs,
  commitAll,
  git,
  makeBareMain,
  makeDir,
  waitForPath,
  writeFile,
} from '../test-support/git-scratch';

const runner = path.join(__dirname, '../tools/read-only-runner.ts');
const reviewInstruction = [
  'Repository tests and checks are handled outside this review.',
  'Do not run or manually reproduce them.',
  'Review the implementation and test adequacy using repository evidence.',
  'Pass these instructions to every delegated reviewer.',
  'Report any additional runtime check needed and why; do not run it.',
].join(' ');

function expectedClaudeReview(command: string): string {
  return `${command}\n\nReview constraint: ${reviewInstruction}`;
}

function executable(dir: string, name: string, lines: string[]): void {
  writeFile(dir, name, ['#!/bin/sh', 'set -eu', ...lines, ''].join('\n'));
  fs.chmodSync(path.join(dir, name), 0o755);
}

function codexStub(lines: string[]): string {
  const dir = makeDir('runner-codex-stub-');
  executable(dir, 'codex', lines);
  return dir;
}

function claudeStub(lines: string[]): string {
  const dir = makeDir('runner-claude-stub-');
  executable(dir, 'claude', [
    'cat > "$RUNNER_STUB_CAPTURE/stdin"',
    ...lines,
  ]);
  return dir;
}

function shellJson(data: unknown): string {
  return `printf '%s' ${shellLiteral(JSON.stringify(data))}`;
}

function shellJsonLine(data: unknown): string {
  return `printf '%s\\n' ${shellLiteral(JSON.stringify(data))}`;
}

function claudeResult(result: unknown, overrides: Record<string, unknown> = {}): string {
  return shellJsonLine({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result,
    ...overrides,
  });
}

function expectReviewEvidence(
  output: string,
  responses: string[],
  diagnostic?: string,
): void {
  expect(JSON.parse(output)).toEqual({
    complete: diagnostic === undefined,
    responses,
    ...(diagnostic !== undefined ? { diagnostic } : {}),
  });
}

function providerEnvironment(
  stub: string,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CODEX_ACCESS_TOKEN: 'unit-test-token',
    CODEX_HOME: path.join(stub, 'codex-home'),
    PATH: `${stub}:${process.env.PATH}`,
    RUNNER_STUB_CAPTURE: stub,
    ...overrides,
  };
}

function runRunner(
  cwd: string,
  args: string[],
  stub?: string,
  overrides: NodeJS.ProcessEnv = {},
) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd,
    encoding: 'utf8',
    env: stub === undefined
      ? { ...process.env, ...overrides }
      : providerEnvironment(stub, overrides),
  });
}

function reportWritingCodex(
  response: string,
  extraLines: string[] = [],
): string {
  return codexStub([
    'printf \'%s\\n\' "$@" > "$RUNNER_STUB_CAPTURE/args"',
    'report=',
    'while [ "$#" -gt 0 ]; do',
    '  if [ "$1" = "--output-last-message" ]; then',
    '    shift',
    '    report=$1',
    '  fi',
    '  shift',
    'done',
    ...extraLines,
    `printf %s ${shellLiteral(response)} > "$report"`,
  ]);
}

function shellLiteral(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function argumentAfter(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    throw new Error(`missing ${flag} argument`);
  }
  return args[index + 1]!;
}

afterEach(cleanupTempDirs);

describe('read-only runner CLI', () => {
  const invalidCalls: string[][] = [
    [],
    ['--unknown', 'value', 'codex', 'review', 'uncommitted'],
    ['--model', 'one', '--model', 'two', 'codex', 'review', 'uncommitted'],
    ['--effort', 'one', '--effort', 'two', 'codex', 'review', 'uncommitted'],
    ['--model'],
    ['other', 'review', 'uncommitted'],
    ['codex'],
    ['codex', '--model', 'other', 'review', 'uncommitted'],
    ['codex', 'prompt', 'inspect'],
    ['claude', 'review'],
    ['claude', 'review', 'other'],
    ['claude', 'review', 'uncommitted', 'extra'],
    ['claude', 'review', 'commit-range'],
    ['claude', 'review', 'commit-range', 'base', 'extra'],
  ];

  it.each(invalidCalls.map(args => ({ args })))(
    'rejects an invalid closed-grammar call: $args',
    ({ args }) => {
    const result = runRunner(makeDir('runner-invalid-'), args);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^read-only-runner: /);
    },
  );

  it('uses native Codex uncommitted review with fixed safeguards and settings', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    writeFile(work, 'tracked.md', 'changed\n');
    const stub = reportWritingCodex('No findings.');

    const result = runRunner(
      work,
      [
        '--model',
        'model value',
        '--effort',
        'high"value\nline\u007F',
        'codex',
        'review',
        'uncommitted',
      ],
      stub,
    );

    expect(result.status).toBe(0);
    expectReviewEvidence(result.stdout, ['No findings.']);
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8')
      .trimEnd()
      .split('\n');
    expect(args).toEqual(expect.arrayContaining([
      '--ignore-rules',
      '--disable',
      'hooks',
      'apps',
      'plugins',
      '--sandbox',
      'read-only',
      'approval_policy="never"',
      'notify=[]',
      '--ephemeral',
      '--model',
      'model value',
      'model_reasoning_effort="high\\"value\\nline\\u007F"',
      '--output-last-message',
    ]));
    expect(args.join('\n')).toContain('developer_instructions=');
    expect(args.join('\n')).toContain(reviewInstruction);
    expect(args).not.toContain('--ignore-user-config');
    expect(args).not.toContain('--output-schema');
    expect(args.slice(-2)).toEqual(['review', '--uncommitted']);
  });

  it('passes the immutable base to native Codex commit-range review', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = reportWritingCodex('Range clean.');

    const result = runRunner(
      work,
      ['codex', 'review', 'commit-range', 'base123'],
      stub,
    );

    expect(result.status).toBe(0);
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8');
    expect(args).toMatch(
      /review\n--base\nbase123\n$/u,
    );
    expect(args).not.toContain('--model\n');
    expect(args).not.toContain('model_reasoning_effort');
  });

  it('maps Claude uncommitted review to literal changed-path targets', () => {
    const work = makeBareMain({
      'candidate.md': 'base\n',
      'deleted.md': 'delete me\n',
    });
    writeFile(work, 'ahead.md', 'committed ahead\n');
    commitAll(work, 'ahead');
    writeFile(work, 'candidate.md', 'changed\n');
    writeFile(work, 'staged.md', 'staged\n');
    git(work, 'add', 'staged.md');
    git(work, 'rm', '--quiet', 'deleted.md');
    writeFile(work, 'untracked file.md', 'untracked\n');
    const stub = claudeStub([
      '[ -z "$' + '{GIT_DIR+x}" ]',
      '[ -z "$' + '{GIT_WORK_TREE+x}" ]',
      'printf \'%s\\n\' "$@" > "$RUNNER_STUB_CAPTURE/args"',
      'printf \'%s\\n\' "$GIT_CONFIG_COUNT" "$GIT_CONFIG_KEY_0" "$GIT_CONFIG_VALUE_0" > "$RUNNER_STUB_CAPTURE/git-env"',
      'printf \'%s\' "$CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS" > "$RUNNER_STUB_CAPTURE/background-wait"',
      'printf \'%s\' "$CLAUDE_CODE_REPORT_FINDINGS" > "$RUNNER_STUB_CAPTURE/report-findings"',
      claudeResult('No findings.'),
    ]);

    const result = runRunner(
      work,
      [
        '--model',
        'exact model',
        '--effort',
        'high',
        'claude',
        'review',
        'uncommitted',
      ],
      stub,
      {
        GIT_CONFIG_COUNT: '001',
        GIT_CONFIG_KEY_0: 'safe.directory',
        GIT_CONFIG_VALUE_0: '*',
        GIT_DIR: '/must/not/be-used',
        GIT_WORK_TREE: '/must/not/be-used',
        CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '123',
        CLAUDE_CODE_REPORT_FINDINGS: '0',
      },
    );

    expect(result.status).toBe(0);
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8');
    expect(args).toContain('--model\nexact model\n');
    expect(args).toContain('--effort\nhigh\n');
    const argv = args.trimEnd().split('\n');
    expect(argumentAfter(argv, '--permission-mode')).toBe(
      'bypassPermissions',
    );
    expect(argv).toContain('--no-session-persistence');
    // Trusted-prompt level: review keeps every tool, including shell, so it
    // can inspect Git completely. Restricting tools here would suggest a
    // boundary the shell defeats anyway.
    expect(argv).not.toContain('--tools');
    expect(argv).not.toContain('--allowedTools');
    expect(argv).not.toContain('--disallowedTools');
    const settings = JSON.parse(argumentAfter(argv, '--settings'));
    expect(settings).toEqual({ disableAllHooks: true });
    const instruction = argumentAfter(argv, '--append-system-prompt');
    expect(instruction).toContain(
      'Repository tests and checks are handled outside this review.',
    );
    expect(instruction).toContain('Do not run or manually reproduce them.');
    expect(instruction).toContain(
      'Pass these instructions to every delegated reviewer.',
    );
    expect(instruction).toContain(
      'Report any additional runtime check needed and why; do not run it.',
    );
    expect(argv).not.toContain('--append-subagent-system-prompt');
    expect(argumentAfter(argv, '--output-format')).toBe('stream-json');
    expect(argv).toContain('--verbose');
    expect(argv).not.toContain('--json-schema');
    expect(
      fs.readFileSync(path.join(stub, 'background-wait'), 'utf8'),
    ).toBe('0');
    // The runner does not select a report shape, so a caller's value passes
    // through untouched.
    expect(
      fs.readFileSync(path.join(stub, 'report-findings'), 'utf8'),
    ).toBe('0');
    const input = fs.readFileSync(path.join(stub, 'stdin'), 'utf8');
    expect(input).toBe(expectedClaudeReview(
      '/code-review "candidate.md" "deleted.md" "staged.md" '
      + '"untracked file.md"',
    ));
    const [reviewCommand, requestInstruction] = input.split(
      '\n\nReview constraint: ',
    );
    expect(reviewCommand).toBe(
      '/code-review "candidate.md" "deleted.md" "staged.md" '
      + '"untracked file.md"',
    );
    expect(requestInstruction).toBe(instruction);
    expect(input).not.toContain('ahead.md');
    const gitEnv = fs.readFileSync(path.join(stub, 'git-env'), 'utf8')
      .trimEnd()
      .split('\n');
    expect(gitEnv).toEqual([
      '001',
      'safe.directory',
      '*',
    ]);
  });

  it('quotes and deduplicates changed paths', () => {
    const work = makeBareMain({ 'candidate.md': 'base\n' });
    writeFile(work, 'candidate.md', 'changed\n');
    git(work, 'add', 'candidate.md');
    writeFile(work, 'candidate.md', 'changed again\n');
    writeFile(work, 'line\nbreak.md', 'untracked\n');
    const stub = claudeStub([claudeResult('No findings.')]);

    const result = runRunner(
      work,
      ['claude', 'review', 'uncommitted'],
      stub,
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(stub, 'stdin'), 'utf8')).toBe(expectedClaudeReview(
      `/code-review "candidate.md" ${JSON.stringify('line\nbreak.md')}`,
    ));
  });

  it('passes a large Claude uncommitted target through stdin', () => {
    const work = makeBareMain({ 'candidate.md': 'base\n' });
    for (let index = 0; index < 1_400; index += 1) {
      writeFile(
        work,
        `bulk/${String(index).padStart(4, '0')}-${'x'.repeat(90)}.ts`,
        'untracked\n',
      );
    }
    const stub = claudeStub([claudeResult('No findings.')]);

    const result = runRunner(
      work,
      ['claude', 'review', 'uncommitted'],
      stub,
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(stub, 'stdin'), 'utf8').length)
      .toBeGreaterThan(128 * 1_024);
  });

  it('rejects Claude uncommitted review without changed paths', () => {
    const work = makeBareMain({ 'candidate.md': 'base\n' });
    const stub = claudeStub([claudeResult('not reached')]);

    const result = runRunner(
      work,
      ['claude', 'review', 'uncommitted'],
      stub,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('uncommitted review has no changed paths');
    expect(fs.existsSync(path.join(stub, 'stdin'))).toBe(false);
  });

  it('includes index-only paths in Claude uncommitted review', () => {
    const work = makeBareMain({ 'candidate.md': 'base\n' });
    writeFile(work, 'candidate.md', 'staged\n');
    git(work, 'add', 'candidate.md');
    writeFile(work, 'candidate.md', 'base\n');
    const stub = claudeStub([claudeResult('No findings.')]);

    const result = runRunner(
      work,
      ['claude', 'review', 'uncommitted'],
      stub,
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(stub, 'stdin'), 'utf8')).toBe(expectedClaudeReview(
      '/code-review "candidate.md"',
    ));
  });

  it('resolves the immutable current HEAD for Claude commit-range review', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const head = git(work, 'rev-parse', 'HEAD').stdout.trim();
    const stub = claudeStub([
      'printf \'%s\\n\' "$@" > "$RUNNER_STUB_CAPTURE/args"',
      claudeResult('Range clean.'),
    ]);

    const result = runRunner(
      work,
      ['claude', 'review', 'commit-range', 'base123'],
      stub,
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(stub, 'stdin'), 'utf8')).toBe(
      expectedClaudeReview(`/code-review base123..${head}`),
    );
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8')
      .trimEnd()
      .split('\n');
    expect(args).not.toContain('--model');
    expect(args).not.toContain('--effort');
  });

  it('preserves repository-root trailing whitespace', () => {
    const parent = makeDir('runner-whitespace-root-');
    const work = path.join(parent, 'repository ');
    fs.mkdirSync(work);
    git(work, 'init', '--quiet', '--initial-branch=main');
    writeFile(work, 'tracked.md', 'tracked\n');
    commitAll(work, 'initial');
    const stub = reportWritingCodex('Range clean.', [
      'pwd > "$RUNNER_STUB_CAPTURE/cwd"',
    ]);

    const result = runRunner(
      work,
      ['codex', 'review', 'commit-range', 'base123'],
      stub,
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(stub, 'cwd'), 'utf8')).toBe(`${work}\n`);
  });

  // A review reporting the command name is the review's own finding: the
  // runner has no signal distinguishing that from an absent command.
  it('keeps a review that reports the command name as a finding', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    writeFile(work, 'tracked.md', 'changed\n');
    const stub = claudeStub([
      claudeResult('Unknown command: /code-review'),
    ]);

    const result = runRunner(
      work,
      ['claude', 'review', 'uncommitted'],
      stub,
    );

    expect(result.status).toBe(0);
    expectReviewEvidence(result.stdout, ['Unknown command: /code-review']);
  });

  // A delegating review reports no turns of its own, so the turn count does
  // not distinguish a completed review from an unresolved command.
  it('keeps a delegated review report that took no turn', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    writeFile(work, 'tracked.md', 'changed\n');
    const stub = claudeStub([
      claudeResult('No findings.', { num_turns: 0 }),
    ]);

    const result = runRunner(
      work,
      ['claude', 'review', 'uncommitted'],
      stub,
    );

    expect(result.status).toBe(0);
    expectReviewEvidence(result.stdout, ['No findings.']);
  });

  it.each([
    {
      case: 'a leading BOM',
      body: "printf '\\357\\273\\277%s\\n' '{}'",
      evidence: 'could not parse',
      retained: '\u{FEFF}{}\n',
    },
    {
      case: 'malformed JSON',
      body: "printf '%s\\n' 'not-json'",
      evidence: 'could not parse',
      retained: 'not-json\n',
    },
    {
      case: 'whitespace-only output',
      body: "printf '   \\n'",
      evidence: 'completed without a final text response',
      retained: '   \n',
    },
    {
      case: 'a whitespace-only result',
      body: claudeResult(' \n\t'),
      evidence: 'completed without a final text response',
      retained: `${JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: ' \n\t',
      })}\n`,
    },
    {
      case: 'output without a final newline',
      body: "printf %s 'not-json'",
      evidence: 'could not parse',
      retained: 'not-json',
    },
  ])('retains $case verbatim in review failure evidence', ({
    body,
    evidence,
    retained,
  }) => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    writeFile(work, 'tracked.md', 'changed\n');
    const stub = claudeStub([body]);

    const result = runRunner(work, ['claude', 'review', 'uncommitted'], stub);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(evidence);
    // The bytes that explain the parse failure survive into the evidence.
    expect(result.stderr.endsWith(`\n${retained}`)).toBe(true);
  });

  it('retains every non-empty review response in provider order', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    writeFile(work, 'tracked.md', 'changed\n');
    const stub = claudeStub([
      'printf \'%s\\n\' "$@" > "$RUNNER_STUB_CAPTURE/args"',
      shellJsonLine({
        type: 'system',
        subtype: 'init',
      }),
      claudeResult('Initial summary.'),
      claudeResult(''),
      "printf '\\n'",
      shellJsonLine({
        type: 'system',
        subtype: 'task_notification',
      }),
      shellJson({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'Late finding.',
      }),
    ]);

    const result = runRunner(
      work,
      ['claude', 'review', 'uncommitted'],
      stub,
    );

    expect(result.status).toBe(0);
    expectReviewEvidence(result.stdout, ['Initial summary.', 'Late finding.']);
    const argv = fs.readFileSync(path.join(stub, 'args'), 'utf8')
      .trimEnd()
      .split('\n');
    expect(argumentAfter(argv, '--output-format')).toBe('stream-json');
    expect(argv).toContain('--verbose');
    expect(argv).not.toContain('--include-partial-messages');
  });

  it.each([
    {
      case: 'an unsuccessful result',
      event: claudeResult('Partial finding.', {
        subtype: 'error_max_turns',
        is_error: true,
      }),
      middleResponse: 'Partial finding.',
      diagnostic: 'Claude reported incomplete review execution',
    },
    {
      case: 'malformed JSON',
      event: "printf '%s\\n' 'not-json'",
      diagnostic: 'could not parse Claude review stream output',
    },
    {
      case: 'a non-object event',
      event: "printf '%s\\n' 'null'",
      diagnostic: 'could not parse Claude review stream output',
    },
    {
      case: 'a result without text',
      event: claudeResult({ unexpected: true }),
      diagnostic: 'Claude emitted a review result without text',
    },
  ])('marks $case incomplete without losing response text', ({
    event,
    middleResponse,
    diagnostic,
  }) => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    writeFile(work, 'tracked.md', 'changed\n');
    const stub = claudeStub([
      claudeResult('Initial summary.'),
      event,
      claudeResult('Late finding.'),
    ]);

    const result = runRunner(work, ['claude', 'review', 'uncommitted'], stub);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expectReviewEvidence(
      result.stdout,
      [
        'Initial summary.',
        ...(middleResponse === undefined ? [] : [middleResponse]),
        'Late finding.',
      ],
      diagnostic,
    );
  });

  it('classifies missing provider executables as unavailable', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = makeDir('runner-missing-provider-');
    executable(stub, 'git', ['exec /usr/bin/git "$@"']);
    const environment = { PATH: stub };

    const codex = runRunner(
      work,
      ['codex', 'review', 'commit-range', 'base123'],
      undefined,
      environment,
    );
    const claude = runRunner(
      work,
      ['claude', 'review', 'commit-range', 'base123'],
      undefined,
      environment,
    );

    expect(codex.status).toBe(2);
    expect(codex.stdout).toBe('');
    expect(codex.stderr).toContain('Codex executable is unavailable');
    expect(claude.status).toBe(2);
    expect(claude.stdout).toBe('');
    expect(claude.stderr).toContain('Claude executable is unavailable');
  });

  it.each([
    {
      case: 'with a final newline',
      lines: [
        'printf "provider transcript\\n" >&2',
        'printf "provider stdout\\n"',
      ],
      retained: 'provider transcript\n',
    },
    {
      case: 'without a final newline',
      lines: ['printf %s "provider transcript" >&2'],
      retained: 'provider transcript',
    },
    {
      case: 'when it is whitespace-only',
      lines: ["printf '   \\n' >&2"],
      retained: '   \n',
    },
  ])('preserves provider stderr $case', ({ lines, retained }) => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = claudeStub([...lines, 'exit 7']);

    const result = runRunner(
      work,
      ['claude', 'review', 'commit-range', 'base123'],
      stub,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      `read-only-runner: Claude failed with status 7\n${retained}`,
    );
    expect(result.stderr).not.toContain('provider stdout');
  });

  it('captures stderr from a failed Codex invocation', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = codexStub([
      'printf "codex diagnostic\\n" >&2',
      'printf "partial protocol\\n"',
      'exit 9',
    ]);

    const result = runRunner(
      work,
      ['codex', 'review', 'commit-range', 'base123'],
      stub,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'read-only-runner: Codex failed with status 9\n'
      + 'codex diagnostic\n',
    );
  });

  it('does not expose provider stderr after a successful response', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = claudeStub([
      'printf "provider warning\\n" >&2',
      claudeResult('Review complete.'),
    ]);

    const result = runRunner(
      work,
      ['claude', 'review', 'commit-range', 'base123'],
      stub,
    );

    expect(result.status).toBe(0);
    expectReviewEvidence(result.stdout, ['Review complete.']);
    expect(result.stderr).toBe('');
  });

  it('rejects missing and whitespace-only Codex final responses', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const missing = codexStub(['exit 0']);
    const whitespace = reportWritingCodex(' \n\t');

    const missingResult = runRunner(
      work,
      ['codex', 'review', 'commit-range', 'base123'],
      missing,
    );
    const whitespaceResult = runRunner(
      work,
      ['codex', 'review', 'commit-range', 'base123'],
      whitespace,
    );

    expect(missingResult.status).toBe(1);
    expect(missingResult.stdout).toBe('');
    expect(missingResult.stderr).toContain(
      'Codex completed without a final response',
    );
    expect(whitespaceResult.status).toBe(1);
    expect(whitespaceResult.stdout).toBe('');
    expect(whitespaceResult.stderr).toContain(
      'Codex completed without a final response',
    );
  });

  it('retains Codex output as evidence when no report is produced', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = codexStub(["printf '%s\\n' 'diagnostic explaining the failure'"]);

    const result = runRunner(
      work,
      ['codex', 'review', 'commit-range', 'base123'],
      stub,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Codex completed without a final response');
    expect(result.stderr).toContain('diagnostic explaining the failure');
  });

  it('reports a Codex final-response read failure with provider output', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = reportWritingCodex('', [
      'mkdir "$report"',
      "printf '%s\\n' 'diagnostic explaining the read failure'",
      'exit 0',
    ]);

    const result = runRunner(
      work,
      ['codex', 'review', 'commit-range', 'base123'],
      stub,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('could not read Codex final response');
    expect(result.stderr).toContain('EISDIR');
    expect(result.stderr).toContain('diagnostic explaining the read failure');
  });

  it('uses and disposes standard temporary output', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = reportWritingCodex('Range clean.', [
      'printf %s "$report" > "$RUNNER_STUB_CAPTURE/report-path"',
    ]);

    const result = runRunner(
      work,
      ['codex', 'review', 'commit-range', 'base123'],
      stub,
    );

    expect(result.status).toBe(0);
    expectReviewEvidence(result.stdout, ['Range clean.']);
    const reportPath = fs.readFileSync(
      path.join(stub, 'report-path'),
      'utf8',
    );
    expect(reportPath.startsWith(
      path.join(os.tmpdir(), 'remdo-read-only-runner.'),
    )).toBe(true);
    expect(fs.existsSync(path.dirname(reportPath))).toBe(false);
  });

  it('cancels a provider invocation without producing a response', async () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = claudeStub([
      'printf ready > "$RUNNER_STUB_READY"',
      'while :; do sleep 1; done',
    ]);
    const ready = path.join(stub, 'ready');
    const child = spawn(
      process.execPath,
      [runner, 'claude', 'review', 'commit-range', 'base123'],
      {
        cwd: work,
        env: providerEnvironment(stub, { RUNNER_STUB_READY: ready }),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
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

    await waitForPath(ready);
    child.kill('SIGTERM');
    const status = await new Promise<number | null>(resolve => {
      child.once('close', resolve);
    });

    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('Claude was cancelled');
  });

  it('kills provider descendants on cancellation', async () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const marker = path.join(makeDir('runner-descendant-marker-'), 'survived');
    const ready = path.join(makeDir('runner-descendant-ready-'), 'ready');
    const childProgram = [
      'const fs = require("node:fs");',
      'setTimeout(() => fs.writeFileSync(process.argv[2], "survived"), 200);',
      'fs.writeFileSync(process.argv[1], "ready");',
      'setInterval(() => {}, 1000);',
    ].join(' ');
    const stub = claudeStub([
      'trap \'exit 143\' TERM',
      `"$RUNNER_NODE" -e ${shellLiteral(childProgram)} "$RUNNER_STUB_READY" "$RUNNER_STUB_MARKER" </dev/null >/dev/null 2>&1 &`,
      'while [ ! -e "$RUNNER_STUB_READY" ]; do sleep 0.01; done',
      'while :; do sleep 1; done',
    ]);
    const child = spawn(
      process.execPath,
      [runner, 'claude', 'review', 'commit-range', 'base123'],
      {
        cwd: work,
        env: providerEnvironment(stub, {
          RUNNER_NODE: process.execPath,
          RUNNER_STUB_MARKER: marker,
          RUNNER_STUB_READY: ready,
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    await waitForPath(ready);
    child.kill('SIGTERM');
    await new Promise<void>(resolve => {
      child.once('close', () => resolve());
    });
    await new Promise(resolve => setTimeout(resolve, 300));

    expect(fs.existsSync(marker)).toBe(false);
  });

  it('fails when the repository root cannot be resolved', () => {
    const stub = makeDir('runner-git-missing-');
    const result = runRunner(
      makeDir('runner-not-repo-'),
      ['claude', 'review', 'uncommitted'],
      undefined,
      { PATH: stub },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('could not resolve repository root');
  });
});
