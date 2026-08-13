/* eslint-disable node/no-process-env */
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
  executable(dir, 'codex', [
    'if [ "$*" = "exec review --help" ]; then',
    '  printf probed > "$RUNNER_STUB_CAPTURE/probe"',
    '  exit 0',
    'fi',
    'if [ "$1" = "mcp" ] && [ "$2" = "list" ]; then',
    '  printf \'%s\\n\' "$@" > "$RUNNER_STUB_CAPTURE/mcp-args"',
    '  printf \'%s\' "$' + '{RUNNER_STUB_MCP_LIST:-[]}"',
    '  exit "$' + '{RUNNER_STUB_MCP_STATUS:-0}"',
    'fi',
    ...lines,
  ]);
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
  return `printf '%s' '${JSON.stringify(data).replace(/'/g, `'\\''`)}'`;
}

function claudeResult(result: unknown, overrides: Record<string, unknown> = {}): string {
  return shellJson({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result,
    ...overrides,
  });
}

function expectReviewEvidence(
  output: string | Buffer,
  provider: 'claude' | 'codex',
  responses: Array<{
    details?: {
      errors?: unknown;
      is_error?: unknown;
      reason?: string;
      result?: unknown;
      subtype?: unknown;
    };
    status: 'completed' | 'failed';
    text?: string;
  }>,
): void {
  expect(JSON.parse(output.toString())).toEqual({
    schema: 'remdo.review-evidence.v1',
    provider,
    responses: responses.map((response, index) => ({
      ...response,
      sequence: index + 1,
    })),
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
): ReturnType<typeof spawnSync> {
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
    'cat > "$RUNNER_STUB_CAPTURE/stdin"',
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
    ['--unknown', 'value', 'codex', 'prompt', 'inspect'],
    ['--model', 'one', '--model', 'two', 'codex', 'prompt', 'inspect'],
    ['--effort', 'one', '--effort', 'two', 'codex', 'prompt', 'inspect'],
    ['--model'],
    ['other', 'prompt', 'inspect'],
    ['codex'],
    ['codex', '--model', 'other', 'prompt', 'inspect'],
    ['codex', 'prompt'],
    ['codex', 'prompt', 'one', 'two'],
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

  it('forwards a Codex prompt and exact settings through fixed safety arguments', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = reportWritingCodex(' \nFinal response without newline');
    const model = 'model value';
    const effort = 'high"value\nline\u007F';

    const result = runRunner(work, [
      '--model',
      model,
      '--effort',
      effort,
      'codex',
      'prompt',
      'Inspect exactly this.',
    ], stub);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(' \nFinal response without newline');
    expect(result.stderr).toBe('');
    expect(fs.readFileSync(path.join(stub, 'stdin'), 'utf8')).toBe(
      'Inspect exactly this.',
    );
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
      model,
      'model_reasoning_effort="high\\"value\\nline\\u007F"',
      '--output-last-message',
    ]));
    expect(args).not.toContain('--ignore-user-config');
    expect(args).not.toContain('--output-schema');
    expect(args[args.length - 1]).toBe('-');
  });

  it('disables every enabled Codex MCP server without suppressing user defaults', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = reportWritingCodex('OK');

    const result = runRunner(
      work,
      ['codex', 'prompt', 'Inspect.'],
      stub,
      {
        RUNNER_STUB_MCP_LIST: JSON.stringify([
          {
            name: 'local.tools',
            enabled: true,
            transport: { type: 'stdio', command: 'local-tools' },
          },
          {
            name: 'remote tools',
            enabled: true,
            transport: {
              type: 'streamable_http',
              url: 'https://example.test/mcp',
            },
          },
          { name: 'already_disabled', enabled: false },
        ]),
      },
    );

    expect(result.status).toBe(0);
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8');
    expect(args).toContain(
      'mcp_servers={"local.tools"={enabled=false,'
      + 'command="local-tools"},"remote tools"={enabled=false,'
      + 'url="https://example.test/mcp"}}\n',
    );
    expect(args).not.toContain('mcp_servers.already_disabled.enabled=false');
    expect(args).not.toContain('--ignore-user-config');
    expect(fs.readFileSync(path.join(stub, 'mcp-args'), 'utf8')).toBe([
      'mcp',
      'list',
      '--json',
      '-c',
      'notify=[]',
      '--disable',
      'hooks',
      '--disable',
      'apps',
      '--disable',
      'plugins',
      '',
    ].join('\n'));
  });

  it.each([
    {
      inventory: 'not-json',
      evidence: 'could not parse Codex MCP inventory',
    },
    {
      inventory: '{}',
      evidence: 'Codex MCP inventory was not a JSON array',
    },
    {
      inventory: '[{"name":"broken","enabled":true,"transport":{}}]',
      evidence: 'Codex MCP server has an unsupported transport',
    },
  ])('rejects an unsafe Codex MCP inventory: $evidence', ({
    evidence,
    inventory,
  }) => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = reportWritingCodex('should not run');

    const result = runRunner(
      work,
      ['codex', 'prompt', 'Inspect.'],
      stub,
      { RUNNER_STUB_MCP_LIST: inventory },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(evidence);
    expect(fs.existsSync(path.join(stub, 'args'))).toBe(false);
  });

  it('omits absent Codex model and effort settings completely', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = reportWritingCodex('OK');

    const result = runRunner(work, ['codex', 'prompt', 'Inspect.'], stub);

    expect(result.status).toBe(0);
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8');
    expect(args).not.toContain('--model');
    expect(args).not.toContain('model_reasoning_effort');
  });

  it('uses native Codex uncommitted review after a capability probe', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    writeFile(work, 'tracked.md', 'changed\n');
    const stub = reportWritingCodex('No findings.');

    const result = runRunner(
      work,
      ['--effort', 'high', 'codex', 'review', 'uncommitted'],
      stub,
    );

    expect(result.status).toBe(0);
    expectReviewEvidence(result.stdout, 'codex', [{
      status: 'completed',
      text: 'No findings.',
    }]);
    expect(fs.readFileSync(path.join(stub, 'probe'), 'utf8')).toBe('probed');
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8');
    expect(args).toMatch(/review\n--uncommitted\n$/u);
    expect(args).not.toContain('--base\n');
    expect(args).toContain('developer_instructions=');
    expect(args).toContain(reviewInstruction);
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
    expect(fs.readFileSync(path.join(stub, 'args'), 'utf8')).toMatch(
      /review\n--base\nbase123\n$/u,
    );
  });

  it('classifies a failed Codex review help probe as unavailable', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = makeDir('runner-codex-capability-stub-');
    executable(stub, 'codex', [
      'if [ "$*" = "exec review --help" ]; then',
      '  printf "review help failed\\n" >&2',
      '  exit 7',
      'fi',
      'exit 99',
    ]);

    const result = runRunner(work, ['codex', 'review', 'uncommitted'], stub);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Codex native review is unavailable');
    expect(result.stderr).toContain('review help failed');
  });

  it('forwards a Claude prompt and exact settings through the generic read-only profile', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const response = '\nClaude response without trailing newline';
    const stub = claudeStub([
      'printf \'%s\\n\' "$@" > "$RUNNER_STUB_CAPTURE/args"',
      claudeResult(response),
    ]);

    const result = runRunner(work, [
      '--model',
      'exact model',
      '--effort',
      'custom effort',
      'claude',
      'prompt',
      'Inspect this prompt.',
    ], stub);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(response);
    expect(result.stderr).toBe('');
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8')
      .trimEnd()
      .split('\n');
    expect(args).toEqual(expect.arrayContaining([
      '--permission-mode',
      'dontAsk',
      '--no-session-persistence',
      '--no-chrome',
      '--strict-mcp-config',
      '{"mcpServers":{}}',
      '--output-format',
      'json',
      '--model',
      'exact model',
      '--effort',
      'custom effort',
    ]));
    expect(fs.readFileSync(path.join(stub, 'stdin'), 'utf8')).toBe(
      'Inspect this prompt.',
    );
    expect(argumentAfter(args, '--tools')).toBe('Bash,Read,Grep,Glob');
    expect(argumentAfter(args, '--allowedTools')).toBe(
      'Bash,Read,Grep,Glob',
    );
    expect(args).not.toContain('--verbose');
    expect(args).not.toContain('--disallowedTools');
    expect(args).not.toContain('--json-schema');
    expect(argumentAfter(args, '--settings')).toBe(
      '{"disableAllHooks":true}',
    );
    // The fixed tool set is the prompt profile, not an enforcement boundary.
    expect(args).not.toContain('--append-system-prompt');
  });

  it('omits absent Claude model and effort settings completely', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = claudeStub([
      'printf \'%s\\n\' "$@" > "$RUNNER_STUB_CAPTURE/args"',
      claudeResult('OK'),
    ]);

    const result = runRunner(work, ['claude', 'prompt', 'Inspect.'], stub);

    expect(result.status).toBe(0);
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8');
    expect(args).not.toContain('--model\n');
    expect(args).not.toContain('--effort\n');
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
      ['--effort', 'high', 'claude', 'review', 'uncommitted'],
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
    expect(args).toContain('--effort\nhigh\n');
    const argv = args.trimEnd().split('\n');
    expect(argumentAfter(argv, '--permission-mode')).toBe(
      'bypassPermissions',
    );
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
    const stub = claudeStub([
      'printf \'%s\\n\' "$@" > "$RUNNER_STUB_CAPTURE/args"',
      claudeResult('No findings.'),
    ]);

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
    expect(fs.existsSync(path.join(stub, 'args'))).toBe(false);
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
    expectReviewEvidence(result.stdout, 'claude', [{
      status: 'completed',
      text: 'Unknown command: /code-review',
    }]);
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
    expectReviewEvidence(result.stdout, 'claude', [{
      status: 'completed',
      text: 'No findings.',
    }]);
  });

  it.each([
    {
      case: 'a leading BOM',
      body: "printf '\\357\\273\\277%s\\n' '{}'",
      evidence: 'could not parse Claude result',
      retained: '\u{FEFF}{}\n',
    },
    {
      case: 'whitespace-only output',
      body: "printf '   \\n'",
      evidence: 'completed without a final text response',
      retained: '   \n',
    },
    {
      case: 'output without a final newline',
      body: "printf %s 'not-json'",
      evidence: 'could not parse Claude result',
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
    expect(result.stderr.toString().endsWith(`\n${retained}`)).toBe(true);
  });

  it('retains every non-empty review response in provider order', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    writeFile(work, 'tracked.md', 'changed\n');
    const stub = claudeStub([
      'printf \'%s\\n\' "$@" > "$RUNNER_STUB_CAPTURE/args"',
      "printf '%s\\n' '" + JSON.stringify({
        type: 'system',
        subtype: 'init',
      }) + "'",
      "printf '%s\\n' '" + JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'Initial summary.',
      }) + "'",
      "printf '\\n'",
      "printf '%s\\n' '" + JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
      }) + "'",
      "printf '%s\\n' '" + JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: { unexpected: true },
      }) + "'",
      "printf '%s\\n' '" + JSON.stringify({
        type: 'result',
        subtype: 'error_max_turns',
        is_error: true,
        result: 'Partial finding.',
      }) + "'",
      "printf '%s\\n' '" + JSON.stringify({
        type: 'system',
        subtype: 'task_notification',
      }) + "'",
      "printf '%s' '" + JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'Late finding.',
      }) + "'",
    ]);

    const result = runRunner(
      work,
      ['claude', 'review', 'uncommitted'],
      stub,
    );

    expect(result.status).toBe(0);
    expectReviewEvidence(result.stdout, 'claude', [
      { status: 'completed', text: 'Initial summary.' },
      {
        details: {
          is_error: false,
          reason: 'successful result did not contain text',
          result: { unexpected: true },
          subtype: 'success',
        },
        status: 'failed',
      },
      {
        details: { is_error: true, subtype: 'error_max_turns' },
        status: 'failed',
        text: 'Partial finding.',
      },
      { status: 'completed', text: 'Late finding.' },
    ]);
    const argv = fs.readFileSync(path.join(stub, 'args'), 'utf8')
      .trimEnd()
      .split('\n');
    expect(argumentAfter(argv, '--output-format')).toBe('stream-json');
    expect(argv).toContain('--verbose');
    expect(argv).not.toContain('--include-partial-messages');
  });

  it.each([
    {
      case: 'malformed JSON',
      event: 'not-json',
      evidence: 'could not parse Claude result stream event 2',
    },
    {
      case: 'a non-object event',
      event: 'null',
      evidence: 'Claude stream event 2 was not a JSON object',
    },
  ])('retains the raw stream when $case follows a response', ({
    event,
    evidence,
  }) => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    writeFile(work, 'tracked.md', 'changed\n');
    const response = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'Earlier finding.',
    });
    const stub = claudeStub([
      `printf '%s\\n%s' ${shellLiteral(response)} ${shellLiteral(event)}`,
    ]);

    const result = runRunner(work, ['claude', 'review', 'uncommitted'], stub);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(evidence);
    expect(result.stderr).toContain(response);
    expect(result.stderr.toString().endsWith(event)).toBe(true);
  });

  // Both invocation parsers retain the provider output that explains an
  // unusable response.
  it.each([
    {
      body: "printf '%s\\n' 'not-json'",
      evidence: 'could not parse Claude result',
      retained: 'not-json',
    },
    {
      body: claudeResult(' \n\t'),
      evidence: 'completed without a final text response',
      retained: '"type":"result"',
    },
  ])(
    'rejects an unusable Claude report retaining its output: $evidence',
    ({ body, evidence, retained }) => {
      const work = makeBareMain({ 'tracked.md': 'tracked\n' });
      writeFile(work, 'tracked.md', 'changed\n');

      for (const args of [
        ['claude', 'review', 'uncommitted'],
        ['claude', 'prompt', 'Inspect.'],
      ]) {
        const result = runRunner(work, args, claudeStub([body]));

        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(evidence);
        expect(result.stderr).toContain(retained);
      }
    },
  );

  it('retains an unsuccessful review result as failed evidence', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    writeFile(work, 'tracked.md', 'changed\n');
    const stub = claudeStub([
      claudeResult('Partial finding.', {
        errors: ['maximum turns reached'],
        is_error: true,
        subtype: undefined,
      }),
    ]);

    const result = runRunner(work, ['claude', 'review', 'uncommitted'], stub);

    expect(result.status).toBe(0);
    expectReviewEvidence(result.stdout, 'claude', [{
      details: {
        errors: ['maximum turns reached'],
        is_error: true,
      },
      status: 'failed',
      text: 'Partial finding.',
    }]);
  });

  it.each([
    {
      body: "printf '%s' 'not-json'",
      evidence: 'could not parse Claude result',
    },
    {
      body: "printf '%s' 'null'",
      evidence: 'Claude output was not a JSON object',
    },
    {
      body: shellJson({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
      }),
      evidence: 'Claude did not return a successful result envelope',
    },
    {
      body: claudeResult({ unexpected: true }),
      evidence: 'Claude completed without a final text response',
    },
    {
      body: claudeResult(' \n\t'),
      evidence: 'Claude completed without a final text response',
    },
  ])('rejects malformed or empty Claude completion: $evidence', ({ body, evidence }) => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = claudeStub([body]);

    const result = runRunner(work, ['claude', 'prompt', 'Inspect.'], stub);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(evidence);
  });

  it('classifies missing provider executables as unavailable', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = makeDir('runner-missing-provider-');
    executable(stub, 'git', ['exec /usr/bin/git "$@"']);
    const environment = { PATH: stub };

    const codex = runRunner(
      work,
      ['codex', 'prompt', 'Inspect.'],
      undefined,
      environment,
    );
    const claude = runRunner(
      work,
      ['claude', 'prompt', 'Inspect.'],
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

  it('preserves provider stderr but not stdout on failure', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = claudeStub([
      'printf "provider transcript\\n" >&2',
      'printf "provider stdout\\n"',
      'exit 7',
    ]);

    const result = runRunner(work, ['claude', 'prompt', 'Inspect.'], stub);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'read-only-runner: Claude failed with status 7\n'
      + 'provider transcript\n',
    );
    expect(result.stderr).not.toContain('provider stdout');
  });

  it.each([
    {
      case: 'without a final newline',
      body: 'printf %s "provider transcript" >&2',
      retained: 'provider transcript',
    },
    {
      case: 'when it is whitespace-only',
      body: "printf '   \\n' >&2",
      retained: '   \n',
    },
  ])('preserves provider stderr $case', ({ body, retained }) => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = claudeStub([body, 'exit 7']);

    const result = runRunner(work, ['claude', 'prompt', 'Inspect.'], stub);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      `read-only-runner: Claude failed with status 7\n${retained}`,
    );
  });

  it('captures stderr from a failed Codex invocation', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = codexStub([
      'printf "codex diagnostic\\n" >&2',
      'printf "partial protocol\\n"',
      'exit 9',
    ]);

    const result = runRunner(work, ['codex', 'prompt', 'Inspect.'], stub);

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

    const result = runRunner(work, ['claude', 'prompt', 'Inspect.'], stub);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('Review complete.');
    expect(result.stderr).toBe('');
  });

  it('rejects missing and whitespace-only Codex final responses', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const missing = codexStub(['exit 0']);
    const whitespace = reportWritingCodex(' \n\t');

    const missingResult = runRunner(
      work,
      ['codex', 'prompt', 'Inspect.'],
      missing,
    );
    const whitespaceResult = runRunner(
      work,
      ['codex', 'prompt', 'Inspect.'],
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

    const result = runRunner(work, ['codex', 'prompt', 'Inspect.'], stub);

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

    const result = runRunner(work, ['codex', 'prompt', 'Inspect.'], stub);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('could not read Codex final response');
    expect(result.stderr).toContain('EISDIR');
    expect(result.stderr).toContain('diagnostic explaining the read failure');
  });

  it('loads its runtime and allocates private output outside an external repository', () => {
    const work = makeExternalBareMain({ 'tracked.md': 'tracked\n' });
    const repositoryTemp = path.join(work, 'repo-temp');
    fs.mkdirSync(repositoryTemp);
    const stub = reportWritingCodex('External clean.', [
      'printf %s "$report" > "$RUNNER_STUB_CAPTURE/report-path"',
    ]);

    const result = runRunner(
      work,
      ['codex', 'prompt', 'Inspect.'],
      stub,
      { TMPDIR: repositoryTemp },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('External clean.');
    const reportPath = fs.readFileSync(
      path.join(stub, 'report-path'),
      'utf8',
    );
    expect(reportPath).not.toContain(work);
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
      [runner, 'claude', 'prompt', 'Inspect.'],
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
      [runner, 'claude', 'prompt', 'Inspect.'],
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

  it('fails when repository paths cannot be resolved', () => {
    const stub = makeDir('runner-git-missing-');
    const result = runRunner(
      makeDir('runner-not-repo-'),
      ['claude', 'prompt', 'Inspect.'],
      undefined,
      { PATH: stub },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('could not resolve repository paths');
  });
});
