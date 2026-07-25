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
    ['claude', 'review', 'working-tree', 'extra'],
    ['claude', 'review', 'committed-range'],
    ['claude', 'review', 'committed-range', 'base', 'extra'],
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

  it('uses native Codex working-tree review after a capability probe', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    writeFile(work, 'tracked.md', 'changed\n');
    const stub = reportWritingCodex('No findings.');

    const result = runRunner(
      work,
      ['--effort', 'high', 'codex', 'review', 'working-tree'],
      stub,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('No findings.');
    expect(fs.readFileSync(path.join(stub, 'probe'), 'utf8')).toBe('probed');
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8');
    expect(args).toContain('review\n--uncommitted\n');
    expect(args).not.toContain('--base\n');
    expect(args).toContain([
      'Do not run repository checks.',
      'When delegating review work, explicitly instruct every delegated',
      'reviewer not to run repository checks.',
    ].join(' '));
  });

  it('passes the immutable base to native Codex committed-range review', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = reportWritingCodex('Range clean.');

    const result = runRunner(
      work,
      ['codex', 'review', 'committed-range', 'base123'],
      stub,
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(stub, 'args'), 'utf8')).toContain(
      'review\n--base\nbase123\n',
    );
  });

  it('classifies a failed Codex review help probe as unavailable', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = makeDir('runner-codex-capability-stub-');
    executable(stub, 'codex', [
      'if [ "$*" = "exec review --help" ]; then exit 7; fi',
      'exit 99',
    ]);

    const result = runRunner(work, ['codex', 'review', 'working-tree'], stub);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Codex native review is unavailable');
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
      '--tools',
      'Bash,Read,Grep,Glob',
      '--allowedTools',
      '{"disableAllHooks":true}',
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
      '--append-system-prompt',
    ]));
    expect(fs.readFileSync(path.join(stub, 'stdin'), 'utf8')).toBe(
      'Inspect this prompt.',
    );
    expect(args).not.toContain('--json-schema');
    const instruction = args[args.indexOf('--append-system-prompt') + 1];
    expect(instruction).toContain('Keep the repository read-only');
    expect(instruction).not.toContain('review_complete');
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

  it('maps Claude working-tree review to literal changed-path targets', () => {
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
      claudeResult('No findings.'),
    ]);

    const result = runRunner(
      work,
      ['--effort', 'high', 'claude', 'review', 'working-tree'],
      stub,
      {
        GIT_CONFIG_COUNT: '001',
        GIT_CONFIG_KEY_0: 'safe.directory',
        GIT_CONFIG_VALUE_0: '*',
        GIT_DIR: '/must/not/be-used',
        GIT_WORK_TREE: '/must/not/be-used',
      },
    );

    expect(result.status).toBe(0);
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8');
    expect(args).toContain('Bash,Read,Grep,Glob,Skill,Agent');
    expect(args).toContain('--effort\nhigh\n');
    const argv = args.trimEnd().split('\n');
    const settings = JSON.parse(argv[argv.indexOf('--settings') + 1]!);
    expect(settings).toEqual({ disableAllHooks: true });
    const instruction = argv[argv.indexOf('--append-system-prompt') + 1];
    expect(instruction).toContain('Do not run repository checks.');
    expect(instruction).toContain(
      'explicitly instruct every delegated reviewer not to run repository checks',
    );
    expect(argv).not.toContain('--append-subagent-system-prompt');
    expect(argv).toContain('Bash,Read,Grep,Glob,Skill,Agent');
    const input = fs.readFileSync(path.join(stub, 'stdin'), 'utf8');
    expect(input).toBe(
      '/code-review "deleted.md" "staged.md" "candidate.md" '
      + '"untracked file.md"',
    );
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
      ['claude', 'review', 'working-tree'],
      stub,
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(stub, 'stdin'), 'utf8')).toBe(
      `/code-review "candidate.md" ${JSON.stringify('line\nbreak.md')}`,
    );
  });

  it('passes a large Claude working-tree target through stdin', () => {
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
      ['claude', 'review', 'working-tree'],
      stub,
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(stub, 'stdin'), 'utf8').length)
      .toBeGreaterThan(128 * 1_024);
  });

  it('rejects Claude working-tree review without changed paths', () => {
    const work = makeBareMain({ 'candidate.md': 'base\n' });
    const stub = claudeStub([claudeResult('not reached')]);

    const result = runRunner(
      work,
      ['claude', 'review', 'working-tree'],
      stub,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('working-tree review has no changed paths');
    expect(fs.existsSync(path.join(stub, 'args'))).toBe(false);
  });

  it('resolves the immutable current HEAD for Claude committed-range review', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const head = git(work, 'rev-parse', 'HEAD').stdout.trim();
    const stub = claudeStub([
      'printf \'%s\\n\' "$@" > "$RUNNER_STUB_CAPTURE/args"',
      claudeResult('Range clean.'),
    ]);

    const result = runRunner(
      work,
      ['claude', 'review', 'committed-range', 'base123'],
      stub,
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(stub, 'stdin'), 'utf8')).toBe(
      `/code-review base123..${head}`,
    );
  });

  it('classifies only Claude exact unknown native review output as unavailable', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    writeFile(work, 'tracked.md', 'changed\n');
    const exact = claudeStub([
      claudeResult('Unknown command: /code-review'),
    ]);
    const mentioned = claudeStub([
      claudeResult(' Unknown command: /code-review '),
    ]);

    const unavailable = runRunner(
      work,
      ['claude', 'review', 'working-tree'],
      exact,
    );
    const response = runRunner(
      work,
      ['claude', 'review', 'working-tree'],
      mentioned,
    );

    expect(unavailable.status).toBe(2);
    expect(unavailable.stdout).toBe('');
    expect(unavailable.stderr).toContain('/code-review is unavailable');
    expect(response.status).toBe(0);
    expect(response.stdout).toBe(' Unknown command: /code-review ');
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

  it('keeps provider failures and diagnostics out of stdout and stderr', () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = claudeStub([
      'printf "provider transcript\\n" >&2',
      'printf "provider stdout\\n"',
      'exit 7',
    ]);

    const result = runRunner(work, ['claude', 'prompt', 'Inspect.'], stub);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Claude failed with status 7');
    expect(result.stderr).not.toContain('provider transcript');
    expect(result.stderr).not.toContain('provider stdout');
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
