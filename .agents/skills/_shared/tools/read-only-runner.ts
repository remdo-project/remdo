/* eslint-disable node/no-process-env */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import type { DisposableTempDir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { terminateProcessGroup } from '../../../../tools/lib/managed-process.ts';

type Agent = 'claude' | 'codex';

type Invocation =
  | { kind: 'prompt'; prompt: string }
  | {
    kind: 'review';
    scope: { kind: 'commit-range'; base: string } | { kind: 'uncommitted' };
  };

interface RunnerCall {
  agent: Agent;
  invocation: Invocation;
  settings: { effort?: string; model?: string };
}

interface ReviewEvidence {
  complete: boolean;
  diagnostic?: string;
  responses: string[];
}

type RunnerResult =
  | { status: 'failed'; evidence: string; preserveEvidenceEnd?: boolean }
  | { status: 'responded'; response: string }
  | { status: 'unavailable'; evidence: string; preserveEvidenceEnd?: boolean };

interface ProcessOutcome {
  aborted: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  spawnError?: NodeJS.ErrnoException;
  stderr: string;
  stdout: string;
}

interface RunProcessOptions {
  captureStderr?: boolean;
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

const REVIEW_INSTRUCTION = [
  'Repository tests and checks are handled outside this review.',
  'Do not run or manually reproduce them.',
  'Review the implementation and test adequacy using repository evidence.',
  'Pass these instructions to every delegated reviewer.',
  'Report any additional runtime check needed and why; do not run it.',
].join(' ');

const CLAUDE_REVIEW_COMMAND = '/code-review';
const CLAUDE_REVIEW_BACKGROUND_WAIT_CEILING_MS = '0';

function claudeReviewRequest(command: string): string {
  // The system-prompt copy guides the lead session; native /code-review does
  // not propagate it reliably to delegated reviewers, so keep a labeled copy
  // in the workflow request as well.
  return `${command}\n\nReview constraint: ${REVIEW_INSTRUCTION}`;
}

function parseCall(args: string[]): RunnerCall {
  const settings: RunnerCall['settings'] = {};
  let index = 0;

  while (args[index]?.startsWith('--') === true) {
    const option = args[index];
    if (option !== '--model' && option !== '--effort') {
      throw new Error(`unknown option: ${option}`);
    }
    const setting = option === '--model' ? 'model' : 'effort';
    if (settings[setting] !== undefined) {
      throw new Error(`duplicate option: ${option}`);
    }
    if (index + 1 >= args.length) {
      throw new Error(`${option} requires a value`);
    }
    settings[setting] = args[index + 1]!;
    index += 2;
  }

  const agent = args[index];
  if (agent !== 'codex' && agent !== 'claude') {
    throw new Error("expected agent 'codex' or 'claude'");
  }
  const invocation = args[index + 1];
  if (invocation === 'prompt') {
    if (args.length !== index + 3) {
      throw new Error('prompt invocation requires exactly one prompt');
    }
    return {
      agent,
      invocation: { kind: 'prompt', prompt: args[index + 2]! },
      settings,
    };
  }
  if (invocation === 'review') {
    const scope = args[index + 2];
    if (scope === 'uncommitted') {
      if (args.length !== index + 3) {
        throw new Error('uncommitted review takes no revisions');
      }
      return {
        agent,
        invocation: { kind: 'review', scope: { kind: 'uncommitted' } },
        settings,
      };
    }
    if (scope === 'commit-range') {
      if (args.length !== index + 4) {
        throw new Error('commit-range review requires exactly one base');
      }
      return {
        agent,
        invocation: {
          kind: 'review',
          scope: { kind: 'commit-range', base: args[index + 3]! },
        },
        settings,
      };
    }
    throw new Error("expected review scope 'uncommitted' or 'commit-range'");
  }
  throw new Error("expected invocation 'prompt' or 'review'");
}

function runProcess(
  command: string,
  args: string[],
  options: RunProcessOptions,
): Promise<ProcessOutcome> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: process.platform !== 'win32',
      env: options.environment,
      stdio: ['pipe', 'pipe', options.captureStderr === true ? 'pipe' : 'ignore'],
    });
    let aborted = false;
    let inputError: NodeJS.ErrnoException | undefined;
    let settled = false;
    let stderr = '';
    let stdout = '';
    let terminating = false;
    const childStdin = child.stdin!;
    const childStdout = child.stdout!;

    const terminate = (): void => {
      if (terminating) {
        return;
      }
      terminating = true;
      if (child.pid !== undefined) {
        try {
          terminateProcessGroup(child, 'SIGKILL');
        } catch {
          // The close or error event remains authoritative for the outcome.
        }
      }
    };
    const abort = (): void => {
      aborted = true;
      terminate();
    };
    const finish = (
      outcome: Omit<ProcessOutcome, 'aborted' | 'stderr' | 'stdout'>,
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      options.signal?.removeEventListener('abort', abort);
      resolve({ ...outcome, aborted, stderr, stdout });
    };

    childStdout.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    childStdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') {
        inputError = error;
        terminate();
      }
    });
    childStdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr?.on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      finish({ exitCode: null, signal: null, spawnError: error });
    });
    child.once('close', (exitCode, signal) => {
      finish({ exitCode, signal, spawnError: inputError });
    });

    if (options.signal?.aborted === true) {
      abort();
    } else {
      options.signal?.addEventListener('abort', abort, { once: true });
    }
    childStdin.end(options.input ?? '');
  });
}

// Retains provider output exactly, including its final byte. Only genuinely
// absent output is omitted.
function outputEvidence(
  summary: string,
  output: string,
): { evidence: string; preserveEvidenceEnd: boolean } {
  return {
    evidence: output === '' ? summary : `${summary}\n${output}`,
    preserveEvidenceEnd: output !== '',
  };
}

function outputFailure(
  summary: string,
  stdout: string,
): Extract<RunnerResult, { status: 'failed' }> {
  return { status: 'failed', ...outputEvidence(summary, stdout) };
}

function providerFailure(
  provider: Agent,
  outcome: ProcessOutcome,
): Extract<RunnerResult, { status: 'failed' | 'unavailable' }> | undefined {
  const name = provider === 'codex' ? 'Codex' : 'Claude';
  if (outcome.spawnError?.code === 'ENOENT') {
    return {
      status: 'unavailable',
      ...outputEvidence(
        `${name} executable is unavailable`,
        outcome.stderr,
      ),
    };
  }
  if (outcome.spawnError !== undefined) {
    return {
      status: 'failed',
      ...outputEvidence(
        `${name} could not start: ${outcome.spawnError.message}`,
        outcome.stderr,
      ),
    };
  }
  if (outcome.aborted) {
    return {
      status: 'failed',
      ...outputEvidence(
        `${name} was cancelled`,
        outcome.stderr,
      ),
    };
  }
  if (outcome.exitCode !== 0) {
    return {
      status: 'failed',
      ...outputEvidence(
        `${name} failed with status ${
          outcome.exitCode ?? `signal ${outcome.signal ?? 'unknown'}`
        }`,
        outcome.stderr,
      ),
    };
  }
  return undefined;
}

function normalizedEnvironment(
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

async function repositoryPaths(
  cwd: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
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
    { captureStderr: true, cwd, environment, signal },
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
  if (paths.length !== 3 || paths.includes('')) {
    return {
      evidence: 'git did not return the repository and Git metadata paths',
    };
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
    return {
      evidence: `could not canonicalize repository paths: ${String(error)}`,
    };
  }
}

function pathIsInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === ''
    || (!relative.startsWith('..') && !path.isAbsolute(relative));
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
    return await fs.mkdtempDisposable(
      path.join(base, 'remdo-read-only-runner.'),
    );
  }
  throw new Error('no temporary directory outside the repository is available');
}

function tomlString(value: string): string {
  return JSON.stringify(value).replaceAll('\u007F', '\\u007F');
}

async function probeCodexReview(
  repository: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<RunnerResult | undefined> {
  const outcome = await runProcess(
    'codex',
    ['exec', 'review', '--help'],
    { captureStderr: true, cwd: repository, environment, signal },
  );
  const failure = providerFailure('codex', outcome);
  if (failure?.status === 'unavailable') {
    return failure;
  }
  if (outcome.aborted || outcome.spawnError !== undefined) {
    return failure;
  }
  if (outcome.exitCode !== 0) {
    return {
      status: 'unavailable',
      ...outputEvidence(
        'Codex native review is unavailable',
        outcome.stderr,
      ),
    };
  }
  return undefined;
}

function codexArgs(
  call: RunnerCall,
  reportPath: string,
  integrationOverrides: string[],
): { args: string[]; input?: string } {
  const args = [
    'exec',
    '--ignore-rules',
    '--disable',
    'hooks',
    '--disable',
    'apps',
    '--disable',
    'plugins',
    '--sandbox',
    'read-only',
    '-c',
    'approval_policy="never"',
    ...integrationOverrides,
    '--ephemeral',
  ];
  if (call.settings.model !== undefined) {
    args.push('--model', call.settings.model);
  }
  if (call.settings.effort !== undefined) {
    args.push(
      '-c',
      `model_reasoning_effort=${tomlString(call.settings.effort)}`,
    );
  }
  if (call.invocation.kind === 'review') {
    args.push(
      '-c',
      `developer_instructions=${tomlString(REVIEW_INSTRUCTION)}`,
    );
  }
  args.push('--output-last-message', reportPath);
  if (call.invocation.kind === 'prompt') {
    args.push('-');
    return { args, input: call.invocation.prompt };
  }
  args.push('review');
  if (call.invocation.scope.kind === 'uncommitted') {
    args.push('--uncommitted');
  } else {
    args.push('--base', call.invocation.scope.base);
  }
  return { args };
}

async function codexIntegrationOverrides(
  repository: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<{ args?: string[]; result?: RunnerResult }> {
  const outcome = await runProcess(
    'codex',
    [
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
    ],
    { captureStderr: true, cwd: repository, environment, signal },
  );
  if (outcome.aborted) {
    return {
      result: {
        status: 'failed',
        evidence: 'Codex integration discovery was cancelled',
      },
    };
  }
  const failure = providerFailure('codex', outcome);
  if (failure !== undefined) {
    return { result: failure };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.stdout);
  } catch (error) {
    return {
      result: {
        status: 'failed',
        evidence: `could not parse Codex MCP inventory: ${String(error)}`,
      },
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      result: {
        status: 'failed',
        evidence: 'Codex MCP inventory was not a JSON array',
      },
    };
  }
  const disabledServers: string[] = [];
  for (const entry of parsed) {
    if (!isObject(entry) || typeof entry.name !== 'string') {
      return {
        result: {
          status: 'failed',
          evidence: 'Codex MCP inventory contained an invalid entry',
        },
      };
    }
    if (entry.name === '') {
      return {
        result: {
          status: 'failed',
          evidence: 'Codex MCP inventory contained an empty server name',
        },
      };
    }
    if (entry.enabled === true) {
      if (!isObject(entry.transport)) {
        return {
          result: {
            status: 'failed',
            evidence: `Codex MCP server has no transport: ${
              JSON.stringify(entry.name)
            }`,
          },
        };
      }
      let transport: string;
      if (
        entry.transport.type === 'stdio'
        && typeof entry.transport.command === 'string'
      ) {
        transport = `command=${tomlString(entry.transport.command)}`;
      } else if (
        entry.transport.type === 'streamable_http'
        && typeof entry.transport.url === 'string'
      ) {
        transport = `url=${tomlString(entry.transport.url)}`;
      } else {
        return {
          result: {
            status: 'failed',
            evidence: `Codex MCP server has an unsupported transport: ${
              JSON.stringify(entry.name)
            }`,
          },
        };
      }
      disabledServers.push(
        `${
          tomlString(entry.name)
        }={enabled=false,${transport}}`,
      );
    }
  }
  const args = ['-c', 'notify=[]'];
  if (disabledServers.length > 0) {
    args.push('-c', `mcp_servers={${disabledServers.join(',')}}`);
  }
  return { args };
}

async function runCodex(
  call: RunnerCall,
  repository: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
  tempDir: string,
): Promise<RunnerResult> {
  const [capability, integrationOverrides] = await Promise.all([
    call.invocation.kind === 'review'
      ? probeCodexReview(repository, environment, signal)
      : Promise.resolve(undefined),
    codexIntegrationOverrides(repository, environment, signal),
  ]);
  if (capability !== undefined) {
    return capability;
  }
  if (integrationOverrides.args === undefined) {
    return integrationOverrides.result ?? {
      status: 'failed',
      evidence: 'could not isolate Codex host integrations',
    };
  }
  const reportPath = path.join(tempDir, 'final-response');
  const invocation = codexArgs(
    call,
    reportPath,
    integrationOverrides.args,
  );
  const outcome = await runProcess('codex', invocation.args, {
    captureStderr: true,
    cwd: repository,
    environment,
    input: invocation.input,
    signal,
  });
  const failure = providerFailure('codex', outcome);
  if (failure !== undefined) {
    return failure;
  }
  let response = '';
  try {
    response = await fs.readFile(reportPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return outputFailure(
        `could not read Codex final response: ${String(error)}`,
        outcome.stdout,
      );
    }
    // The report is the response; its absence is reported below with whatever
    // the invocation printed instead.
  }
  if (response.trim() === '') {
    return outputFailure(
      'Codex completed without a final response',
      outcome.stdout,
    );
  }
  return {
    status: 'responded',
    response: call.invocation.kind === 'review'
      ? serializeReviewEvidence([response])
      : response,
  };
}

async function gitPathList(
  repository: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
  args: string[],
  label: string,
): Promise<{ evidence?: string; paths?: string[] }> {
  const outcome = await runProcess(
    'git',
    args,
    { captureStderr: true, cwd: repository, environment, signal },
  );
  if (outcome.aborted) {
    return { evidence: `${label} path resolution was cancelled` };
  }
  if (outcome.exitCode !== 0 || outcome.spawnError !== undefined) {
    return {
      evidence: outcome.stderr.trim()
      || outcome.spawnError?.message
      || `${label} path resolution failed`,
    };
  }
  const paths = outcome.stdout.split('\0');
  if (paths.at(-1) !== '') {
    return { evidence: `${label} path output was not NUL-terminated` };
  }
  paths.pop();
  return { paths };
}

async function claudeUncommittedTarget(
  repository: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<{ evidence?: string; target?: string }> {
  const results = await Promise.all([
    gitPathList(
      repository,
      environment,
      signal,
      ['diff', '--name-only', '-z', '--'],
      'unstaged',
    ),
    gitPathList(
      repository,
      environment,
      signal,
      ['diff', '--cached', '--name-only', '-z', 'HEAD', '--'],
      'staged',
    ),
    gitPathList(
      repository,
      environment,
      signal,
      ['ls-files', '--others', '--exclude-standard', '-z', '--'],
      'untracked',
    ),
  ]);
  for (const result of results) {
    if (result.paths === undefined) {
      return { evidence: result.evidence };
    }
  }
  const paths = [...new Set(results.flatMap(result => result.paths!))];
  if (paths.length === 0) {
    return { evidence: 'uncommitted review has no changed paths' };
  }
  return {
    target: `${CLAUDE_REVIEW_COMMAND} ${
      paths.map(item => JSON.stringify(item)).join(' ')
    }`,
  };
}

async function resolveHead(
  repository: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<{ evidence?: string; head?: string }> {
  const outcome = await runProcess(
    'git',
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    { captureStderr: true, cwd: repository, environment, signal },
  );
  if (outcome.aborted) {
    return { evidence: 'HEAD resolution was cancelled' };
  }
  if (outcome.exitCode !== 0 || outcome.spawnError !== undefined) {
    return {
      evidence: outcome.stderr.trim()
      || outcome.spawnError?.message
      || 'could not resolve the current HEAD commit',
    };
  }
  const head = outcome.stdout.trim();
  if (head === '') {
    return { evidence: 'git returned an empty HEAD commit' };
  }
  return { head };
}

function claudeInvocation(
  call: RunnerCall,
  reviewCommand: string | undefined,
): { args: string[]; input: string } {
  const review = call.invocation.kind === 'review';
  const args = [
    '-p',
    '--permission-mode',
    review ? 'bypassPermissions' : 'dontAsk',
  ];
  if (!review) {
    // Prompt invocations expose and pre-approve a fixed set of tools used for
    // repository inspection. This limits first-class capabilities but is not an
    // enforcement boundary: Bash can reach any effect. Review therefore
    // restricts nothing while retaining the same trusted-prompt protection level.
    const tools = 'Bash,Read,Grep,Glob';
    args.push('--tools', tools, '--allowedTools', tools);
  }
  args.push(
    '--settings',
    '{"disableAllHooks":true}',
    '--no-session-persistence',
    '--no-chrome',
    '--strict-mcp-config',
    '--mcp-config',
    '{"mcpServers":{}}',
    '--output-format',
    review ? 'stream-json' : 'json',
  );
  if (review) {
    args.push('--verbose');
  }
  if (call.settings.model !== undefined) {
    args.push('--model', call.settings.model);
  }
  if (call.settings.effort !== undefined) {
    args.push('--effort', call.settings.effort);
  }
  if (review) {
    args.push('--append-system-prompt', REVIEW_INSTRUCTION);
  }
  return {
    args,
    input: call.invocation.kind === 'prompt'
      ? call.invocation.prompt
      : reviewCommand!,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function claudeResult(
  envelope: Record<string, unknown>,
): Exclude<RunnerResult, { status: 'unavailable' }> {
  if (
    envelope.type !== 'result'
    || envelope.subtype !== 'success'
    || envelope.is_error !== false
  ) {
    return {
      status: 'failed',
      evidence: 'Claude did not return a successful result envelope',
    };
  }
  if (!isNonEmptyString(envelope.result)) {
    return {
      status: 'failed',
      evidence: 'Claude completed without a final text response',
    };
  }
  return { status: 'responded', response: envelope.result };
}

function serializeReviewEvidence(
  responses: string[],
  diagnostic?: string,
): string {
  const evidence: ReviewEvidence = {
    complete: diagnostic === undefined,
    responses,
    ...(diagnostic !== undefined ? { diagnostic } : {}),
  };
  return JSON.stringify(evidence, null, 2);
}

function claudePromptOutputResult(stdout: string): RunnerResult {
  const failed = (summary: string): RunnerResult =>
    outputFailure(summary, stdout);
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch (error) {
    return failed(`could not parse Claude result: ${String(error)}`);
  }
  if (!isObject(envelope)) {
    return failed('Claude output was not a JSON object');
  }
  const result = claudeResult(envelope);
  return result.status === 'failed' ? failed(result.evidence) : result;
}

function claudeReviewOutputResult(stdout: string): RunnerResult {
  const responses: string[] = [];
  let diagnostic: string | undefined;
  const lines = stdout.split(/\r?\n/u).filter(line => line.trim() !== '');
  for (const line of lines) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      diagnostic ??= 'could not parse Claude review stream output';
      continue;
    }
    if (!isObject(event)) {
      diagnostic ??= 'could not parse Claude review stream output';
      continue;
    }
    if (event.type !== 'result') {
      continue;
    }
    if (event.subtype !== 'success' || event.is_error !== false) {
      diagnostic ??= 'Claude reported incomplete review execution';
    }
    if (isNonEmptyString(event.result)) {
      responses.push(event.result);
    } else if (typeof event.result !== 'string') {
      diagnostic ??= 'Claude emitted a review result without text';
    }
  }
  if (responses.length === 0) {
    return outputFailure(
      diagnostic ?? 'Claude completed without a final text response',
      stdout,
    );
  }
  return {
    status: 'responded',
    response: serializeReviewEvidence(responses, diagnostic),
  };
}

async function runClaude(
  call: RunnerCall,
  repository: string,
  sourceEnvironment: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<RunnerResult> {
  let reviewCommand: string | undefined;
  if (call.invocation.kind === 'review') {
    if (call.invocation.scope.kind === 'uncommitted') {
      const resolved = await claudeUncommittedTarget(
        repository,
        sourceEnvironment,
        signal,
      );
      if (resolved.target === undefined) {
        return {
          status: 'failed',
          evidence: resolved.evidence
          ?? 'could not resolve uncommitted review paths',
        };
      }
      reviewCommand = claudeReviewRequest(resolved.target);
    } else {
      const resolved = await resolveHead(
        repository,
        sourceEnvironment,
        signal,
      );
      if (resolved.head === undefined) {
        return {
          status: 'failed',
          evidence: resolved.evidence ?? 'could not resolve the current HEAD commit',
        };
      }
      reviewCommand = claudeReviewRequest(`${CLAUDE_REVIEW_COMMAND} ${
        call.invocation.scope.base
      }..${resolved.head}`);
    }
  }
  const invocation = claudeInvocation(call, reviewCommand);
  const environment = call.invocation.kind === 'review'
    ? {
      ...sourceEnvironment,
      CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS:
        CLAUDE_REVIEW_BACKGROUND_WAIT_CEILING_MS,
    }
    : sourceEnvironment;
  const outcome = await runProcess('claude', invocation.args, {
    captureStderr: true,
    cwd: repository,
    environment,
    input: invocation.input,
    signal,
  });
  return providerFailure('claude', outcome)
    ?? (call.invocation.kind === 'review'
      ? claudeReviewOutputResult(outcome.stdout)
      : claudePromptOutputResult(outcome.stdout));
}

async function run(
  call: RunnerCall,
  signal: AbortSignal,
): Promise<RunnerResult> {
  if (signal.aborted) {
    return { status: 'failed', evidence: 'agent invocation was cancelled' };
  }
  const cwd = path.resolve(process.cwd());
  const environment = normalizedEnvironment();
  const pathResult = await repositoryPaths(cwd, environment, signal);
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
    return {
      status: 'failed',
      evidence: `could not create private temporary output: ${String(error)}`,
    };
  }
  await using output = privateTempDir;
  const invocationEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    TEMP: output.path,
    TMP: output.path,
    TMPDIR: output.path,
  };
  if (call.agent === 'codex') {
    return await runCodex(
      call,
      repository,
      invocationEnvironment,
      signal,
      output.path,
    );
  }
  return await runClaude(call, repository, invocationEnvironment, signal);
}

async function main(): Promise<void> {
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const call = parseCall(process.argv.slice(2));
    const result = await run(call, controller.signal);
    if (result.status === 'responded') {
      process.stdout.write(result.response);
      return;
    }
    process.stderr.write(`read-only-runner: ${result.evidence}`);
    if (
      result.preserveEvidenceEnd !== true
      && !result.evidence.endsWith('\n')
    ) {
      process.stderr.write('\n');
    }
    process.exitCode = result.status === 'unavailable' ? 2 : 1;
  } catch (error) {
    process.stderr.write(
      `read-only-runner: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

await main();
