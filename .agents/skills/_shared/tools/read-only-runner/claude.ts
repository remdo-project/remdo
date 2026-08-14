import { isNonEmptyString, isObject, serializeReviewEvidence } from './evidence.ts';
import {
  outputFailure,
  providerFailure,
  runProcess,
} from './process.ts';
import type { ReviewCall, RunnerResult } from './types.ts';

const REVIEW_INSTRUCTION = [
  'Repository tests and checks are handled outside this review.',
  'Do not run or manually reproduce them.',
  'Review the implementation and test adequacy using repository evidence.',
  'Pass these instructions to every delegated reviewer.',
  'Report any additional runtime check needed and why; do not run it.',
].join(' ');

const REVIEW_COMMAND = '/code-review';
const BACKGROUND_WAIT_CEILING_MS = '0';

function reviewRequest(command: string): string {
  return `${command}\n\nReview constraint: ${REVIEW_INSTRUCTION}`;
}

async function gitPathList(
  repository: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
  args: string[],
  label: string,
): Promise<{ evidence?: string; paths?: string[] }> {
  const outcome = await runProcess('git', args, {
    cwd: repository,
    environment,
    signal,
  });
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

async function uncommittedTarget(
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
    target: `${REVIEW_COMMAND} ${
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
    { cwd: repository, environment, signal },
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
  return head === ''
    ? { evidence: 'git returned an empty HEAD commit' }
    : { head };
}

async function reviewCommand(
  call: ReviewCall,
  repository: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<{ command?: string; evidence?: string }> {
  if (call.scope.kind === 'uncommitted') {
    const resolved = await uncommittedTarget(repository, environment, signal);
    return resolved.target === undefined
      ? { evidence: resolved.evidence }
      : { command: resolved.target };
  }
  const resolved = await resolveHead(repository, environment, signal);
  return resolved.head === undefined
    ? { evidence: resolved.evidence }
    : { command: `${REVIEW_COMMAND} ${call.scope.base}..${resolved.head}` };
}

function invocationArgs(call: ReviewCall): string[] {
  const args = [
    '-p',
    '--permission-mode',
    'bypassPermissions',
    '--settings',
    '{"disableAllHooks":true}',
    '--no-session-persistence',
    '--no-chrome',
    '--strict-mcp-config',
    '--mcp-config',
    '{"mcpServers":{}}',
    '--output-format',
    'stream-json',
    '--verbose',
  ];
  if (call.settings.model !== undefined) {
    args.push('--model', call.settings.model);
  }
  if (call.settings.effort !== undefined) {
    args.push('--effort', call.settings.effort);
  }
  args.push('--append-system-prompt', REVIEW_INSTRUCTION);
  return args;
}

function reviewOutput(stdout: string): RunnerResult {
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

export async function runClaude(
  call: ReviewCall,
  repository: string,
  sourceEnvironment: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<RunnerResult> {
  const resolved = await reviewCommand(
    call,
    repository,
    sourceEnvironment,
    signal,
  );
  if (resolved.command === undefined) {
    return {
      status: 'failed',
      evidence: resolved.evidence ?? 'could not resolve Claude review target',
    };
  }
  const outcome = await runProcess('claude', invocationArgs(call), {
    cwd: repository,
    environment: {
      ...sourceEnvironment,
      CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: BACKGROUND_WAIT_CEILING_MS,
    },
    input: reviewRequest(resolved.command),
    signal,
  });
  return providerFailure('claude', outcome) ?? reviewOutput(outcome.stdout);
}
