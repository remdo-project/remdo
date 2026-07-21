/* eslint-disable node/no-process-env */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import type { DisposableTempDir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export type CodexAgentRequest =
  | {
    adapter: 'codex';
    invocation: { kind: 'prompt'; prompt: string };
    response:
      | { kind: 'text' }
      | { kind: 'structured'; schema: boolean | Record<string, unknown> };
    settings?: { model?: string; reasoningEffort?: string };
  }
  | {
    adapter: 'codex';
    invocation: {
      kind: 'review';
      target: { kind: 'working-tree' } | { kind: 'base'; base: string };
    };
    response: { kind: 'text' };
    settings?: { model?: string; reasoningEffort?: string };
  };

export interface ClaudeAgentRequest {
  adapter: 'claude';
  invocation:
    | { kind: 'prompt'; prompt: string }
    | { kind: 'review'; arguments?: string; instructions: string };
  response:
    | { kind: 'text' }
    | { kind: 'structured'; schema: boolean | Record<string, unknown> };
  settings?: { effort?: string; model?: string };
}

export type ReadOnlyAgentRequest = CodexAgentRequest | ClaudeAgentRequest;

export type ReadOnlyAgentResult =
  | {
    status: 'responded';
    response:
      | { kind: 'text'; value: string }
      | { kind: 'structured'; value: unknown };
  }
  | { status: 'unavailable'; evidence: string }
  | { status: 'failed'; evidence: string };

export interface RunReadOnlyAgentOptions {
  cwd?: string;
  environment?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

interface ProcessOutcome {
  aborted: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  spawnError?: NodeJS.ErrnoException;
  stdout: string;
}

interface RunProcessOptions {
  cwd: string;
  environment: NodeJS.ProcessEnv;
  input?: string;
  signal?: AbortSignal;
}

const GIT_REDIRECTION_KEYS = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_WORK_TREE',
] as const;
const CLAUDE_READ_ONLY_INSTRUCTION = [
  'Keep the repository read-only.',
  'Do not create, modify, delete, move, stage, commit, or otherwise change',
  'repository files, the index, untracked files, or Git references.',
  'Use the available tools only to inspect and report; refuse any conflicting',
  'part of the request.',
].join(' ');
const CLAUDE_REVIEW_COMMAND = '/code-review';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function runProcess(command: string, args: string[], options: RunProcessOptions): Promise<ProcessOutcome> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: process.platform !== 'win32',
      env: options.environment,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let aborted = false;
    let inputError: NodeJS.ErrnoException | undefined;
    let settled = false;
    let stdout = '';
    let terminating = false;

    const finish = (outcome: Omit<ProcessOutcome, 'aborted' | 'stdout'>): void => {
      if (settled) {
        return;
      }
      settled = true;
      options.signal?.removeEventListener('abort', abort);
      resolve({ ...outcome, aborted, stdout });
    };
    const signalProcess = (signal: NodeJS.Signals): void => {
      if (child.pid === undefined) {
        return;
      }
      try {
        if (process.platform === 'win32') {
          child.kill(signal);
        } else {
          process.kill(-child.pid, signal);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          try {
            child.kill(signal);
          } catch {
            // The close or error event remains authoritative for the outcome.
          }
        }
      }
    };
    const terminate = (): void => {
      if (terminating) {
        return;
      }
      terminating = true;
      signalProcess('SIGKILL');
    };
    const abort = (): void => {
      aborted = true;
      terminate();
    };

    child.stdout.setEncoding('utf8');
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') {
        inputError = error;
        terminate();
      }
    });
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      finish({ exitCode: null, signal: null, spawnError: error });
    });
    child.once('close', (exitCode, signal) => {
      const outcome = { exitCode, signal, spawnError: inputError };
      finish(outcome);
    });

    if (options.signal?.aborted) {
      abort();
    } else {
      options.signal?.addEventListener('abort', abort, { once: true });
    }
    child.stdin.end(options.input ?? '');
  });
}

function unavailableOrFailure(
  provider: string,
  outcome: ProcessOutcome,
): Extract<ReadOnlyAgentResult, { status: 'failed' | 'unavailable' }> | undefined {
  if (outcome.spawnError?.code === 'ENOENT') {
    return { status: 'unavailable', evidence: `${provider} executable is unavailable` };
  }
  if (outcome.spawnError !== undefined) {
    return {
      status: 'failed',
      evidence: `${provider} could not start: ${outcome.spawnError.message}`,
    };
  }
  if (outcome.aborted) {
    return { status: 'failed', evidence: `${provider} was cancelled` };
  }
  if (outcome.exitCode !== 0) {
    return {
      status: 'failed',
      evidence: `${provider} failed with status ${outcome.exitCode ?? `signal ${outcome.signal ?? 'unknown'}`}`,
    };
  }
  return undefined;
}

async function repositoryPaths(
  cwd: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal | undefined,
): Promise<{ evidence?: string; paths?: { git: string[]; repository: string } }> {
  const outcome = await runProcess(
    'git',
    [
      'rev-parse',
      '--path-format=absolute',
      '--show-toplevel',
      '--absolute-git-dir',
      '--git-common-dir',
    ],
    { cwd, environment, signal },
  );
  if (outcome.aborted) {
    return { evidence: 'repository resolution was cancelled' };
  }
  if (outcome.spawnError !== undefined || outcome.exitCode !== 0) {
    return { evidence: 'could not resolve repository paths' };
  }
  const output = outcome.stdout.endsWith('\n')
    ? outcome.stdout.slice(0, -1)
    : outcome.stdout;
  const paths = output.split('\n');
  if (paths.length !== 3 || paths.some(item => item === '')) {
    return { evidence: 'git did not return the repository and Git metadata paths' };
  }
  try {
    const [repository, gitDir, commonDir] = await Promise.all(
      paths.map(item => fs.realpath(item)),
    );
    return {
      paths: {
        git: [...new Set([gitDir!, commonDir!])],
        repository: repository!,
      },
    };
  } catch (error) {
    return { evidence: `could not canonicalize repository paths: ${String(error)}` };
  }
}

function pathIsInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function createPrivateTempDir(
  protectedPaths: readonly string[],
): Promise<DisposableTempDir> {
  for (const candidate of new Set(['/tmp', os.tmpdir()])) {
    let base: string;
    try {
      base = await fs.realpath(candidate);
    } catch {
      continue;
    }
    if (protectedPaths.some(protectedPath => pathIsInside(protectedPath, base))) {
      continue;
    }
    return await fs.mkdtempDisposable(path.join(base, 'remdo-read-only-agent-runner.'));
  }
  throw new Error('no temporary directory outside the repository is available');
}

function codexArgs(request: CodexAgentRequest, tempDir: string): {
  args: string[];
  input?: string;
  reportPath: string;
} {
  const reportPath = path.join(tempDir, 'final-response');
  const args = [
    'exec',
    '--ignore-user-config',
    '--ignore-rules',
    '--disable',
    'hooks',
    '--disable',
    'apps',
    '--sandbox',
    'read-only',
    '-c',
    'approval_policy="never"',
    '--ephemeral',
  ];
  if (request.settings?.model !== undefined) {
    args.push('--model', request.settings.model);
  }
  if (request.settings?.reasoningEffort !== undefined) {
    args.push('-c', `model_reasoning_effort="${request.settings.reasoningEffort}"`);
  }
  args.push('--output-last-message', reportPath);
  if (request.response.kind === 'structured') {
    const schemaPath = path.join(tempDir, 'response.schema.json');
    args.push('--output-schema', schemaPath);
  }
  if (request.invocation.kind === 'prompt') {
    args.push('-');
    return { args, input: request.invocation.prompt, reportPath };
  }
  args.push('review');
  if (request.invocation.target.kind === 'working-tree') {
    args.push('--uncommitted');
  } else {
    args.push('--base', request.invocation.target.base);
  }
  return { args, reportPath };
}

async function runCodex(
  request: CodexAgentRequest,
  repository: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal | undefined,
  tempDir: string,
): Promise<ReadOnlyAgentResult> {
  const invocation = codexArgs(request, tempDir);
  if (request.response.kind === 'structured') {
    await fs.writeFile(
      path.join(tempDir, 'response.schema.json'),
      JSON.stringify(request.response.schema),
      'utf8',
    );
  }
  const outcome = await runProcess(
    'codex',
    invocation.args,
    {
      cwd: repository,
      environment,
      input: invocation.input,
      signal,
    },
  );
  const failure = unavailableOrFailure('Codex', outcome);
  if (failure !== undefined) {
    return failure;
  }

  let finalResponse: string;
  try {
    finalResponse = await fs.readFile(invocation.reportPath, 'utf8');
  } catch {
    return {
      status: 'failed',
      evidence: 'Codex completed without a final response',
    };
  }
  if (finalResponse.trim() === '') {
    return {
      status: 'failed',
      evidence: 'Codex completed without a final response',
    };
  }
  if (request.response.kind === 'text') {
    return { status: 'responded', response: { kind: 'text', value: finalResponse } };
  }
  let value: unknown;
  try {
    value = JSON.parse(finalResponse);
  } catch (error) {
    return { status: 'failed', evidence: `Codex final response was not JSON: ${String(error)}` };
  }
  return { status: 'responded', response: { kind: 'structured', value } };
}

function claudeArgs(request: ClaudeAgentRequest): string[] {
  const tools = request.invocation.kind === 'review'
    ? 'Bash,Read,Grep,Glob,Skill,Agent'
    : 'Bash,Read,Grep,Glob';
  const args = [
    '-p',
    '--permission-mode',
    'dontAsk',
    '--tools',
    tools,
    '--allowedTools',
    tools,
    '--settings',
    '{"disableAllHooks":true}',
    '--no-session-persistence',
    '--no-chrome',
    '--strict-mcp-config',
    '--mcp-config',
    '{"mcpServers":{}}',
    '--output-format',
    'json',
  ];
  if (request.settings?.model !== undefined) {
    args.push('--model', request.settings.model);
  }
  if (request.settings?.effort !== undefined) {
    args.push('--effort', request.settings.effort);
  }
  if (request.response.kind === 'structured') {
    args.push('--json-schema', JSON.stringify(request.response.schema));
  }
  const instructions = request.invocation.kind === 'review'
    ? `${CLAUDE_READ_ONLY_INSTRUCTION}\n\n${request.invocation.instructions}`
    : CLAUDE_READ_ONLY_INSTRUCTION;
  args.push('--append-system-prompt', instructions);
  if (request.invocation.kind === 'review') {
    const command = request.invocation.arguments?.trim()
      ? `${CLAUDE_REVIEW_COMMAND} ${request.invocation.arguments}`
      : CLAUDE_REVIEW_COMMAND;
    args.push(command);
  } else {
    args.push(request.invocation.prompt);
  }
  return args;
}

async function runClaude(
  request: ClaudeAgentRequest,
  repository: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal | undefined,
): Promise<ReadOnlyAgentResult> {
  const outcome = await runProcess('claude', claudeArgs(request), {
    cwd: repository,
    environment,
    signal,
  });
  const failure = unavailableOrFailure('Claude', outcome);
  if (failure !== undefined) {
    return failure;
  }
  let envelope: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(outcome.stdout);
    if (!isObject(parsed)) {
      return {
        status: 'failed',
        evidence: 'Claude output was not a JSON object',
      };
    }
    envelope = parsed;
  } catch (error) {
    return {
      status: 'failed',
      evidence: `could not parse Claude result: ${String(error)}`,
    };
  }
  if (envelope.is_error === true) {
    return {
      status: 'failed',
      evidence: 'Claude did not complete cleanly',
    };
  }
  if (envelope.type !== 'result'
    || envelope.subtype !== 'success'
    || envelope.is_error !== false) {
    return {
      status: 'failed',
      evidence: 'Claude did not return a successful result envelope',
    };
  }
  if (request.invocation.kind === 'review'
    && typeof envelope.result === 'string'
    && envelope.result.trim() === `Unknown command: ${CLAUDE_REVIEW_COMMAND}`) {
    return {
      status: 'unavailable',
      evidence: `${CLAUDE_REVIEW_COMMAND} is unavailable in this Claude session`,
    };
  }
  if (request.response.kind === 'text') {
    if (typeof envelope.result !== 'string' || envelope.result.trim() === '') {
      return { status: 'failed', evidence: 'Claude completed without a final text response' };
    }
    return { status: 'responded', response: { kind: 'text', value: envelope.result } };
  }
  const value = envelope.structured_output;
  if (value === undefined || value === null) {
    return {
      status: 'failed',
      evidence: 'Claude completed without structured output',
    };
  }
  return { status: 'responded', response: { kind: 'structured', value } };
}

export async function runReadOnlyAgent(
  request: ReadOnlyAgentRequest,
  options: RunReadOnlyAgentOptions = {},
): Promise<ReadOnlyAgentResult> {
  if (options.signal?.aborted) {
    return { status: 'failed', evidence: 'agent invocation was cancelled' };
  }
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const environment = normalizeReadOnlyEnvironment(options.environment ?? process.env);
  const pathResult = await repositoryPaths(cwd, environment, options.signal);
  if (pathResult.paths === undefined) {
    return {
      status: 'failed',
      evidence: pathResult.evidence ?? 'could not resolve repository paths',
    };
  }
  const { git: gitPaths, repository } = pathResult.paths;
  let privateTempDir: DisposableTempDir;
  try {
    privateTempDir = await createPrivateTempDir([repository, ...gitPaths]);
  } catch (error) {
    return { status: 'failed', evidence: `could not create private temporary output: ${String(error)}` };
  }
  await using output = privateTempDir;
  const invocationEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    TEMP: output.path,
    TMP: output.path,
    TMPDIR: output.path,
  };
  if (request.adapter === 'codex') {
    return await runCodex(
      request,
      repository,
      invocationEnvironment,
      options.signal,
      output.path,
    );
  }
  return await runClaude(
    request,
    repository,
    invocationEnvironment,
    options.signal,
  );
}

export async function runReadOnlyAgentWithProcessSignals(
  request: ReadOnlyAgentRequest,
  options: RunReadOnlyAgentOptions = {},
): Promise<ReadOnlyAgentResult> {
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  if (options.signal?.aborted) {
    cancel();
  } else {
    options.signal?.addEventListener('abort', cancel, { once: true });
  }
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    return await runReadOnlyAgent(request, { ...options, signal: controller.signal });
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

export function normalizeReadOnlyEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...source };
  for (const key of GIT_REDIRECTION_KEYS) {
    delete environment[key];
  }
  if (environment.CODEX_ACCESS_TOKEN?.trim() === '') {
    delete environment.CODEX_ACCESS_TOKEN;
  }
  return environment;
}
