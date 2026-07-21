import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { runReadOnlyAgent } from '../tools/read-only-agent-runner';
import {
  cleanupTempDirs,
  makeBareMain,
  makeDir,
  waitForPath,
  writeFile,
} from '../test-support/git-scratch';

function executable(dir: string, name: string, lines: string[]): void {
  writeFile(dir, name, ['#!/bin/sh', 'set -eu', ...lines, ''].join('\n'));
  fs.chmodSync(path.join(dir, name), 0o755);
}

function providerEnvironment(stub: string, overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CODEX_ACCESS_TOKEN: 'unit-test-token',
    CODEX_HOME: path.join(stub, 'unused-codex-home'),
    ...overrides,
    PATH: stub + ':' + process.env.PATH,
    RUNNER_STUB_CAPTURE: stub,
  };
}

function shellLiteral(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

afterEach(cleanupTempDirs);

describe('read-only agent runner', () => {
  it('runs a structured Codex prompt with fixed safety and final response capture', async () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = makeDir('runner-codex-stub-');
    const repoTmp = path.join(work, 'repo-tmp');
    const sourceCodexHome = path.join(stub, 'source-codex-home');
    const sourceAuth = JSON.stringify({
      tokens: { access_token: 'cached', refresh_token: 'single-use' },
    });
    fs.mkdirSync(repoTmp);
    fs.mkdirSync(sourceCodexHome);
    fs.writeFileSync(path.join(sourceCodexHome, 'auth.json'), sourceAuth);
    fs.writeFileSync(
      path.join(sourceCodexHome, 'config.toml'),
      'sandbox_mode = "danger-full-access"',
    );
    executable(stub, 'codex', [
      '[ "$CODEX_HOME" = "$RUNNER_SOURCE_CODEX_HOME" ]',
      'grep -q \'"access_token":"cached"\' "$CODEX_HOME/auth.json"',
      'grep -q \'"refresh_token":"single-use"\' "$CODEX_HOME/auth.json"',
      '[ -e "$CODEX_HOME/config.toml" ]',
      'printf \'%s\\n\' \"$@\" > \"$RUNNER_STUB_CAPTURE/args\"',
      'cat > \"$RUNNER_STUB_CAPTURE/stdin\"',
      'report=\'\'',
      'schema=\'\'',
      'while [ \"$#\" -gt 0 ]; do',
      '  case \"$1\" in',
      '    --output-last-message) shift; report=$1 ;;',
      '    --output-schema) shift; schema=$1 ;;',
      '  esac',
      '  shift',
      'done',
      'printf \'%s\' \"$report\" > \"$RUNNER_STUB_CAPTURE/report-path\"',
      'printf \'%s\' \"$schema\" > \"$RUNNER_STUB_CAPTURE/schema-path\"',
      'cp \"$schema\" \"$RUNNER_STUB_CAPTURE/schema\"',
      'printf \'%s\' \'{\"answer\":\"ok\"}\' > \"$report\"',
    ]);

    const result = await runReadOnlyAgent({
      adapter: 'codex',
      invocation: { kind: 'prompt', prompt: 'Return the answer.' },
      response: {
        kind: 'structured',
        schema: {
          type: 'object',
          properties: { answer: { const: 'ok' } },
          required: ['answer'],
          additionalProperties: false,
        },
      },
      settings: { model: 'quick-model', reasoningEffort: 'low' },
    }, {
      cwd: work,
      environment: providerEnvironment(stub, {
        CODEX_ACCESS_TOKEN: '',
        CODEX_HOME: sourceCodexHome,
        RUNNER_SOURCE_CODEX_HOME: sourceCodexHome,
        TMPDIR: repoTmp,
      }),
    });

    expect(result).toEqual({
      status: 'responded',
      response: { kind: 'structured', value: { answer: 'ok' } },
    });
    expect(fs.readFileSync(path.join(stub, 'stdin'), 'utf8')).toBe('Return the answer.');
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8').trimEnd().split('\n');
    expect(args).toEqual(expect.arrayContaining([
      '--ignore-user-config',
      '--ignore-rules',
      'hooks',
      'apps',
      '--sandbox',
      'read-only',
      'approval_policy="never"',
      '--ephemeral',
      '--output-schema',
      '--output-last-message',
      '--model',
      'quick-model',
      'model_reasoning_effort="low"',
    ]));
    expect(args[args.length - 1]).toBe('-');
    expect(JSON.parse(fs.readFileSync(path.join(stub, 'schema'), 'utf8'))).toMatchObject({
      type: 'object',
    });
    const reportPath = fs.readFileSync(path.join(stub, 'report-path'), 'utf8');
    expect(reportPath).not.toContain(work);
    expect(fs.readFileSync(path.join(stub, 'schema-path'), 'utf8')).not.toContain(work);
    expect(fs.readFileSync(path.join(sourceCodexHome, 'auth.json'), 'utf8')).toBe(sourceAuth);
  });

  it('preserves a dedicated Codex access token and the caller Codex home', async () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = makeDir('runner-codex-token-stub-');
    const sourceCodexHome = makeDir('runner-codex-source-home-');
    fs.writeFileSync(path.join(sourceCodexHome, 'auth.json'), 'must not be read');
    executable(stub, 'codex', [
      '[ "$CODEX_ACCESS_TOKEN" = dedicated-runner-token ]',
      '[ "$CODEX_HOME" = "$RUNNER_SOURCE_CODEX_HOME" ]',
      '[ -e "$CODEX_HOME/auth.json" ]',
      'report=\'\'',
      'while [ "$#" -gt 0 ]; do',
      '  [ "$1" = \'--output-last-message\' ] && { shift; report=$1; }',
      '  shift',
      'done',
      'printf \'%s\' OK > "$report"',
    ]);

    const result = await runReadOnlyAgent({
      adapter: 'codex',
      invocation: { kind: 'prompt', prompt: 'Inspect.' },
      response: { kind: 'text' },
    }, {
      cwd: work,
      environment: providerEnvironment(stub, {
        CODEX_ACCESS_TOKEN: 'dedicated-runner-token',
        CODEX_HOME: sourceCodexHome,
        RUNNER_SOURCE_CODEX_HOME: sourceCodexHome,
      }),
    });

    expect(result).toEqual({
      status: 'responded',
      response: { kind: 'text', value: 'OK' },
    });
    expect(fs.readFileSync(path.join(sourceCodexHome, 'auth.json'), 'utf8')).toBe(
      'must not be read',
    );
  });

  it('returns parsed structured Codex output for caller validation', async () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = makeDir('runner-codex-stub-');
    executable(stub, 'codex', [
      'report=\'\'',
      'while [ \"$#\" -gt 0 ]; do',
      '  [ \"$1\" = \'--output-last-message\' ] && { shift; report=$1; }',
      '  shift',
      'done',
      'printf \'%s\' \'{\"answer\":\"wrong\"}\' > \"$report\"',
    ]);

    const result = await runReadOnlyAgent({
      adapter: 'codex',
      invocation: { kind: 'prompt', prompt: 'Return the answer.' },
      response: {
        kind: 'structured',
        schema: {
          type: 'object',
          properties: { answer: { const: 'ok' } },
          required: ['answer'],
        },
      },
    }, { cwd: work, environment: providerEnvironment(stub) });

    expect(result).toEqual({
      status: 'responded',
      response: { kind: 'structured', value: { answer: 'wrong' } },
    });
  });

  it('runs a structured Claude prompt with its cooperative prompt profile', async () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = makeDir('runner-claude-stub-');
    executable(stub, 'claude', [
      'printf \'%s\\n\' \"$@\" > \"$RUNNER_STUB_CAPTURE/args\"',
      'printf \'%s\\n\' \'{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"{\\\"answer\\\":\\\"ok\\\"}\",\"structured_output\":{\"answer\":\"ok\"}}\'',
    ]);

    const result = await runReadOnlyAgent({
      adapter: 'claude',
      invocation: { kind: 'prompt', prompt: 'Return the answer.' },
      response: {
        kind: 'structured',
        schema: {
          type: 'object',
          properties: { answer: { const: 'ok' } },
          required: ['answer'],
          additionalProperties: false,
        },
      },
      settings: { model: 'quick-model', effort: 'low' },
    }, { cwd: work, environment: providerEnvironment(stub) });

    expect(result).toEqual({
      status: 'responded',
      response: { kind: 'structured', value: { answer: 'ok' } },
    });
    const args = fs.readFileSync(path.join(stub, 'args'), 'utf8').trimEnd().split('\n');
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
      '--mcp-config',
      '{"mcpServers":{}}',
      '--output-format',
      'json',
      '--json-schema',
      '--model',
      'quick-model',
      '--effort',
      'low',
      '--append-system-prompt',
      'Return the answer.',
    ]));
    const instruction = args[args.indexOf('--append-system-prompt') + 1];
    expect(instruction).toContain('Keep the repository read-only');
    expect(instruction).toContain('refuse any conflicting part of the request');
  });

  it('classifies a missing Claude native capability as unavailable', async () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = makeDir('runner-claude-stub-');
    executable(stub, 'claude', [
      'printf \'%s\\n\' \'{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"Unknown command: /code-review\"}\'',
    ]);

    const result = await runReadOnlyAgent({
      adapter: 'claude',
      invocation: {
        kind: 'native',
        command: '/code-review',
        instructions: 'Review without editing.',
      },
      response: { kind: 'structured', schema: { type: 'object' } },
    }, { cwd: work, environment: providerEnvironment(stub) });

    expect(result).toEqual({
      status: 'unavailable',
      evidence: '/code-review is unavailable in this Claude session',
    });
  });

  it('cancels a provider invocation without producing a response', async () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = makeDir('runner-claude-stub-');
    const ready = path.join(stub, 'ready');
    executable(stub, 'claude', [
      'printf ready > "$RUNNER_STUB_READY"',
      'while :; do sleep 1; done',
    ]);
    const controller = new AbortController();

    const resultPromise = runReadOnlyAgent({
      adapter: 'claude',
      invocation: { kind: 'prompt', prompt: 'Inspect.' },
      response: { kind: 'text' },
    }, {
      cwd: work,
      environment: providerEnvironment(stub, { RUNNER_STUB_READY: ready }),
      signal: controller.signal,
    });
    await waitForPath(ready);
    controller.abort();

    await expect(resultPromise).resolves.toEqual({
      status: 'failed',
      evidence: 'Claude was cancelled',
    });
  });

  it('kills provider descendants on cancellation', async () => {
    const work = makeBareMain({ 'tracked.md': 'tracked\n' });
    const stub = makeDir('runner-claude-stub-');
    const marker = path.join(stub, 'survived');
    const ready = path.join(stub, 'ready');
    const stubbornChild = [
      'const fs = require("node:fs");',
      'setTimeout(() => fs.writeFileSync(process.argv[2], "survived"), 200);',
      'fs.writeFileSync(process.argv[1], "ready");',
      'setInterval(() => {}, 1000);',
    ].join(' ');
    executable(stub, 'claude', [
      'trap \'exit 143\' TERM',
      `"$RUNNER_NODE" -e ${shellLiteral(stubbornChild)} "$RUNNER_STUB_READY" "$RUNNER_STUB_MARKER" </dev/null >/dev/null 2>&1 &`,
      'while [ ! -e "$RUNNER_STUB_READY" ]; do sleep 0.01; done',
      'while :; do sleep 1; done',
    ]);
    const controller = new AbortController();

    const resultPromise = runReadOnlyAgent({
      adapter: 'claude',
      invocation: { kind: 'prompt', prompt: 'Inspect.' },
      response: { kind: 'text' },
    }, {
      cwd: work,
      environment: providerEnvironment(stub, {
        RUNNER_NODE: process.execPath,
        RUNNER_STUB_MARKER: marker,
        RUNNER_STUB_READY: ready,
      }),
      signal: controller.signal,
    });
    await waitForPath(ready);
    controller.abort();
    const result = await resultPromise;
    await new Promise(resolve => setTimeout(resolve, 300));

    expect(result).toEqual({ status: 'failed', evidence: 'Claude was cancelled' });
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('classifies a missing provider executable as unavailable', async () => {
    const work = makeDir('runner-work-');
    const stub = makeDir('runner-git-stub-');
    executable(stub, 'git', [
      'case "$*" in',
      '  "rev-parse --path-format=absolute --show-toplevel --absolute-git-dir --git-common-dir")',
      '    printf \'%s\\n%s\\n%s\\n\' "$RUNNER_STUB_CAPTURE" "$RUNNER_STUB_CAPTURE" "$RUNNER_STUB_CAPTURE"',
      '    ;;',
      '  *) exit 1 ;;',
      'esac',
    ]);

    const result = await runReadOnlyAgent({
      adapter: 'codex',
      invocation: { kind: 'prompt', prompt: 'Inspect.' },
      response: { kind: 'text' },
    }, {
      cwd: work,
      environment: { PATH: stub, RUNNER_STUB_CAPTURE: work },
    });

    expect(result).toEqual({
      status: 'unavailable',
      evidence: 'Codex executable is unavailable',
    });
  });

  it('resolves protected Git paths before allocating private output', async () => {
    const work = makeDir('runner-work-');
    const stub = makeDir('runner-git-path-stub-');
    executable(stub, 'git', [
      'case "$*" in',
      '  "rev-parse --path-format=absolute --show-toplevel --absolute-git-dir --git-common-dir")',
      '    printf \'%s\\n%s\\n%s\\n\' "$RUNNER_WORK" /tmp "$RUNNER_OS_TMP"',
      '    ;;',
      '  *) exit 1 ;;',
      'esac',
    ]);
    executable(stub, 'codex', ['exit 99']);

    const result = await runReadOnlyAgent({
      adapter: 'codex',
      invocation: { kind: 'prompt', prompt: 'Inspect.' },
      response: { kind: 'text' },
    }, {
      cwd: work,
      environment: {
        PATH: stub,
        RUNNER_OS_TMP: os.tmpdir(),
        RUNNER_WORK: work,
      },
    });

    expect(result).toEqual({
      status: 'failed',
      evidence: expect.stringContaining(
        'no temporary directory outside the repository is available',
      ),
    });
  });

});
